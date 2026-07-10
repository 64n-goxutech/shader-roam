import {
  Color,
  Group,
  MathUtils,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitCameraRig } from '../camera/OrbitCameraRig';
import { ControlSystem } from '../controls/ControlSystem';
import { KeyboardPointerInput } from '../controls/KeyboardPointerInput';
import { SunsetEnvironment } from '../environments/SunsetEnvironment';
import { MotionReferenceField } from '../environments/MotionReferenceField';
import type { AtmosphereDebugMode } from '../shaders/sunsetSky';
import {
  getRendererDiagnostics,
  installRendererConsoleDiagnostics,
  readFramebufferPixelSamples,
  sunsetRenderDiagnosticsVersion
} from '../diagnostics/renderDiagnostics';
import { ArcadeFlyingCar } from '../vehicles/ArcadeFlyingCar';
import { createPlaceholderFlyingCar } from '../vehicles/createPlaceholderFlyingCar';
import { loadVehicleModel } from '../vehicles/loadVehicleModel';
import type { ExperienceConfig, HudElements } from './types';

export interface ExperienceOptions {
  canvas: HTMLCanvasElement;
  config: ExperienceConfig;
  hud: HudElements;
}

export class Experience {
  private readonly canvas: HTMLCanvasElement;
  private readonly config: ExperienceConfig;
  private readonly hud: HudElements;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(64, 1, 0.1, 9000);
  private readonly timer = new Timer();
  private readonly input: KeyboardPointerInput;
  private readonly controls = new ControlSystem();
  private readonly vehicle: ArcadeFlyingCar;
  private readonly vehicleVisualRoot: Group;
  private readonly orbitCameraRig: OrbitCameraRig;
  private readonly environment: SunsetEnvironment;
  private readonly motionReferences: MotionReferenceField;
  private readonly removeRendererDiagnostics: () => void;

  private animationFrame = 0;
  private running = false;
  private frameCount = 0;
  private nextDiagnosticElapsed = 0;
  private lastRawDelta = 0;
  private vehicleModelState: 'loading' | 'ready' | 'fallback' = 'loading';

  constructor(options: ExperienceOptions) {
    this.canvas = options.canvas;
    this.config = options.config;
    this.hud = options.hud;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color('#120d1d'));
    this.renderer.setPixelRatio(getPixelRatioCap(this.config.quality));
    this.removeRendererDiagnostics = installRendererConsoleDiagnostics(this.renderer, this.canvas);
    this.timer.connect(document);

    this.input = new KeyboardPointerInput(this.canvas);

    const vehicleObject = new Group();
    vehicleObject.name = this.config.vehicleId;
    const vehicleVisualRoot = new Group();
    vehicleVisualRoot.name = `${this.config.vehicleId}-visual-root`;
    const placeholder = createPlaceholderFlyingCar();
    placeholder.rotation.y = MathUtils.degToRad(this.config.vehicleModelYawDegrees);
    vehicleVisualRoot.add(placeholder);
    vehicleObject.add(vehicleVisualRoot);
    this.scene.add(vehicleObject);
    this.vehicleVisualRoot = vehicleVisualRoot;
    this.vehicle = new ArcadeFlyingCar({
      object: vehicleObject,
      visual: vehicleVisualRoot,
      command: this.controls.command
    });
    void this.loadVehicleVisual(placeholder);

    this.orbitCameraRig = new OrbitCameraRig({
      camera: this.camera,
      domElement: this.canvas
    });
    this.environment = new SunsetEnvironment(this.scene, {
      quality: this.config.quality
    });
    this.motionReferences = new MotionReferenceField(this.scene, {
      quality: this.config.quality
    });
    this.input.setPointerFlightEnabled(false);

    this.hud.environment?.replaceChildren(this.config.environmentLabel);
    window.addEventListener('resize', this.resize);
    document.addEventListener('keydown', this.handleKeyDown, { capture: true });
    this.resize();

    console.groupCollapsed('[ShaderRoam][Experience][init] Scene constructed');
    console.info('configuration', this.config);
    console.info(
      'scene children',
      this.scene.children.map((child) => ({ name: child.name || child.type, type: child.type }))
    );
    console.info('camera', {
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      position: this.camera.position.toArray()
    });
    console.groupEnd();
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.timer.reset();
    console.info('[ShaderRoam][Experience][start] Animation loop started.');
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    window.cancelAnimationFrame(this.animationFrame);
    this.input.dispose();
    this.orbitCameraRig.dispose();
    this.motionReferences.dispose();
    this.timer.dispose();
    this.removeRendererDiagnostics();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    console.info('[ShaderRoam][Experience][stop] Animation loop stopped.');
  }

  getDiagnostics() {
    return this.createDiagnostics(null);
  }

  dumpDiagnostics(reason = 'manual-devtools') {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
    return this.logDiagnostics(reason, readFramebufferPixelSamples(this.renderer));
  }

  setAtmosphereDebugMode(mode: AtmosphereDebugMode): void {
    this.environment.setDebugMode(mode);
    this.dumpDiagnostics(`atmosphere-debug-mode-${mode}`);
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) {
      return;
    }

    this.timer.update(timestamp);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 1 / 30);
    const elapsed = this.timer.getElapsed();
    this.lastRawDelta = rawDt;

    const rawInput = this.input.snapshot();
    this.controls.update(rawInput, dt);
    this.vehicle.update(dt);
    this.orbitCameraRig.update(dt, this.vehicle.state);
    this.motionReferences.update(dt, elapsed, this.camera, this.vehicle.state);
    this.environment.update(elapsed, this.camera.position, this.vehicle.state);
    this.updateHud();

    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;

    if (this.frameCount === 1 || elapsed >= this.nextDiagnosticElapsed) {
      this.nextDiagnosticElapsed = elapsed + 5;
      this.logDiagnostics(
        this.frameCount === 1 ? 'first-rendered-frame' : 'periodic-render-health',
        readFramebufferPixelSamples(this.renderer)
      );
    }

    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.environment.resize(this.renderer);
    console.info('[ShaderRoam][Experience][resize]', {
      cssSize: [width, height],
      drawingBuffer: this.renderer.getDrawingBufferSize(new Vector2()).toArray(),
      cameraAspect: this.camera.aspect,
      pixelRatio: this.renderer.getPixelRatio()
    });
  };

  private createDiagnostics(framebuffer: ReturnType<typeof readFramebufferPixelSamples> | null) {
    const cameraForward = this.camera.getWorldDirection(new Vector3());

    return {
      diagnosticsVersion: sunsetRenderDiagnosticsVersion,
      runtime: {
        running: this.running,
        frameCount: this.frameCount,
        elapsed: this.timer.getElapsed(),
        lastFrameMilliseconds: this.lastRawDelta * 1000,
        approximateFps: this.lastRawDelta > 0 ? 1 / this.lastRawDelta : null
      },
      config: this.config,
      camera: {
        position: this.camera.position.toArray(),
        forward: cameraForward.toArray(),
        aspect: this.camera.aspect,
        near: this.camera.near,
        far: this.camera.far,
        motionFeedback: this.orbitCameraRig.getDiagnostics()
      },
      vehicle: {
        id: this.config.vehicleId,
        modelUrl: this.config.vehicleModelUrl,
        modelState: this.vehicleModelState,
        visualChildren: this.vehicleVisualRoot.children.map((child) => child.name || child.type),
        position: this.vehicle.state.position.toArray(),
        speed: this.vehicle.state.speed,
        attitude: this.vehicle.getDiagnostics()
      },
      renderer: getRendererDiagnostics(this.renderer),
      sunset: this.environment.getDiagnostics(this.camera, this.renderer),
      motionReferences: this.motionReferences.getDiagnostics(),
      framebuffer
    };
  }

  private logDiagnostics(
    reason: string,
    framebuffer: ReturnType<typeof readFramebufferPixelSamples>
  ) {
    const snapshot = this.createDiagnostics(framebuffer);
    const failedChecks = Object.entries(snapshot.sunset.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    console.groupCollapsed(`[ShaderRoam][diagnostics:${reason}] Sunset render snapshot`);
    console.info('snapshot', snapshot);
    console.table(framebuffer.samples);
    if (framebuffer.error || framebuffer.glError !== 0) {
      console.error('framebuffer readback failed', framebuffer);
    }
    if (failedChecks.length > 0) {
      console.warn('failed sunset render checks', failedChecks);
    } else {
      console.info('all sunset render boundary checks passed');
    }
    console.groupEnd();

    return snapshot;
  }

  private updateHud(): void {
    this.hud.speed?.replaceChildren(Math.round(this.vehicle.state.speed).toString().padStart(3, '0'));
    this.hud.altitude?.replaceChildren(
      Math.max(0, Math.round(this.vehicle.state.position.y)).toString().padStart(3, '0')
    );
    this.hud.environment?.replaceChildren(this.config.environmentLabel);
  }

  private async loadVehicleVisual(placeholder: Object3D): Promise<void> {
    try {
      const model = await loadVehicleModel(this.config.vehicleModelUrl, {
        targetLength: 5.2,
        yawDegrees: this.config.vehicleModelYawDegrees
      });
      this.vehicleVisualRoot.remove(placeholder);
      disposeObject3D(placeholder);
      this.vehicleVisualRoot.add(model);
      this.vehicleModelState = 'ready';
      console.info('[ShaderRoam][Experience][vehicle-model-ready]', {
        vehicleId: this.config.vehicleId,
        model: model.userData.vehicleModel
      });
    } catch (error) {
      this.vehicleModelState = 'fallback';
      console.error('[ShaderRoam][Experience][vehicle-model-error]', {
        vehicleId: this.config.vehicleId,
        url: this.config.vehicleModelUrl,
        error
      });
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.repeat && event.code === 'KeyR') {
      event.preventDefault();
      event.stopPropagation();
      this.orbitCameraRig.reset(this.vehicle.state);
    }
  };
}

function disposeObject3D(object: Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function getPixelRatioCap(quality: ExperienceConfig['quality']): number {
  if (quality === 'high') {
    return Math.min(window.devicePixelRatio, 1.5);
  }

  if (quality === 'medium') {
    return Math.min(window.devicePixelRatio, 1.15);
  }

  return 1;
}
