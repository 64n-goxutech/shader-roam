import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
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
import {
  coreRenderDiagnosticsVersion,
  getRendererDiagnostics,
  installRendererConsoleDiagnostics,
  readFramebufferPixelSamples
} from '../diagnostics/renderDiagnostics';
import { ArcadeFlyingCar } from '../vehicles/ArcadeFlyingCar';
import { createPlaceholderFlyingCar } from '../vehicles/createPlaceholderFlyingCar';
import { loadVehicleModel } from '../vehicles/loadVehicleModel';
import { VehicleWheelAnimator } from '../vehicles/VehicleWheelAnimator';
import type { ExperienceConfig } from './types';

export interface ExperienceOptions {
  canvas: HTMLCanvasElement;
  config: ExperienceConfig;
}

const maxFrameDelta = 0.1;

export class Experience {
  private readonly canvas: HTMLCanvasElement;
  private readonly config: ExperienceConfig;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(64, 1, 0.1, 1500);
  private readonly timer = new Timer();
  private readonly input: KeyboardPointerInput;
  private readonly controls = new ControlSystem();
  private readonly vehicle: ArcadeFlyingCar;
  private readonly vehicleVisualRoot: Group;
  private readonly orbitCameraRig: OrbitCameraRig;
  private readonly removeRendererDiagnostics: () => void;

  private animationFrame = 0;
  private running = false;
  private frameCount = 0;
  private lastRawDelta = 0;
  private vehicleModelState: 'loading' | 'ready' | 'fallback' = 'loading';
  private vehicleWheels: VehicleWheelAnimator | null = null;

  constructor(options: ExperienceOptions) {
    this.canvas = options.canvas;
    this.config = options.config;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color('#111318'));
    this.renderer.setPixelRatio(1);
    this.removeRendererDiagnostics = installRendererConsoleDiagnostics(this.renderer, this.canvas);
    this.timer.connect(document);

    this.input = new KeyboardPointerInput(this.canvas);
    this.addVehicleLighting();

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
    this.input.setPointerFlightEnabled(false);

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

  private readonly tick = (timestamp: number): void => {
    if (!this.running) {
      return;
    }

    this.timer.update(timestamp);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(Math.max(rawDt, 0), maxFrameDelta);
    this.lastRawDelta = rawDt;

    const rawInput = this.input.snapshot();
    this.controls.update(rawInput, dt);
    this.vehicle.update(dt);
    this.vehicleWheels?.update(dt, this.vehicle.state.speed);
    this.orbitCameraRig.update(dt, this.vehicle.state);

    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;

    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
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
      diagnosticsVersion: coreRenderDiagnosticsVersion,
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
        wheels: this.vehicleWheels?.getDiagnostics() ?? null,
        attitude: this.vehicle.getDiagnostics()
      },
      renderer: getRendererDiagnostics(this.renderer),
      scene: {
        children: this.scene.children.map((child) => ({
          name: child.name || child.type,
          type: child.type
        }))
      },
      framebuffer
    };
  }

  private logDiagnostics(
    reason: string,
    framebuffer: ReturnType<typeof readFramebufferPixelSamples>
  ) {
    const snapshot = this.createDiagnostics(framebuffer);

    console.groupCollapsed(`[ShaderRoam][diagnostics:${reason}] Core drive render snapshot`);
    console.info('snapshot', snapshot);
    console.table(framebuffer.samples);
    if (framebuffer.error || framebuffer.glError !== 0) {
      console.error('framebuffer readback failed', framebuffer);
    }
    console.groupEnd();

    return snapshot;
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
      this.vehicleWheels = new VehicleWheelAnimator(model);
      this.vehicleModelState = 'ready';
      console.info('[ShaderRoam][Experience][vehicle-model-ready]', {
        vehicleId: this.config.vehicleId,
        model: model.userData.vehicleModel,
        wheels: this.vehicleWheels.getDiagnostics()
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

  private addVehicleLighting(): void {
    const fill = new HemisphereLight(0xe7edf4, 0x181a1e, 1.8);
    fill.name = 'VehicleFillLight';
    this.scene.add(fill);

    const key = new DirectionalLight(0xffffff, 2.6);
    key.name = 'VehicleKeyLight';
    key.position.set(8, 12, 10);
    this.scene.add(key);
  }
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
