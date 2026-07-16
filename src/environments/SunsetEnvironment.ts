import {
  BackSide,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import {
  sunsetCloudLayerBounds,
  sunsetCloudProfile,
  sunsetSkyFragmentShader,
  sunsetSkyQualityDefines,
  sunsetSkyShaderVersion,
  sunsetSkyUniforms,
  sunsetSkyVertexShader
} from '../shaders/sunsetSky';
import type { AtmosphereDebugMode } from '../shaders/sunsetSky';
import { getRendererProgramDiagnostics } from '../diagnostics/renderDiagnostics';
import type { QualityLevel } from '../engine/types';
import type { VehicleState } from '../engine/types';

export interface SunsetEnvironmentOptions {
  quality: QualityLevel;
}

export class SunsetEnvironment {
  readonly id = 'sunset-drive';

  private readonly sky: Mesh;
  private readonly material: ShaderMaterial;
  private readonly quality: QualityLevel;
  private readonly qualityDefines: (typeof sunsetSkyQualityDefines)[QualityLevel];
  private readonly cameraForward = new Vector3();

  private updateCount = 0;
  private beforeRenderCount = 0;
  private afterRenderCount = 0;
  private compileCount = 0;

  constructor(scene: Scene, options: SunsetEnvironmentOptions) {
    const sunDirection = new Vector3(0.32, 0.18, -0.93).normalize();
    const qualityDefines = sunsetSkyQualityDefines[options.quality];
    this.quality = options.quality;
    this.qualityDefines = qualityDefines;

    scene.fog = new FogExp2(0x704057, 0.00038);
    scene.add(new HemisphereLight(0xffb36b, 0x28172e, 2.4));

    const sun = new DirectionalLight(0xffa45a, 4.2);
    sun.position.copy(sunDirection).multiplyScalar(100);
    scene.add(sun);

    this.material = new ShaderMaterial({
      uniforms: {
        iTime: { value: sunsetSkyUniforms.iTime.value },
        iResolution: { value: sunsetSkyUniforms.iResolution.value.clone() },
        uCameraPosition: { value: sunsetSkyUniforms.uCameraPosition.value.clone() },
        vehiclePosition: { value: sunsetSkyUniforms.vehiclePosition.value.clone() },
        sunDirection: { value: sunDirection.clone() },
        uAtmosphereDebugMode: { value: sunsetSkyUniforms.uAtmosphereDebugMode.value }
      },
      vertexShader: sunsetSkyVertexShader,
      fragmentShader: sunsetSkyFragmentShader,
      defines: qualityDefines,
      side: BackSide,
      depthWrite: false,
      depthTest: false
    });
    this.material.name = 'SunsetSkyMaterial';
    this.material.onBeforeCompile = (parameters): void => {
      this.compileCount += 1;
      console.groupCollapsed('[ShaderRoam][SunsetEnvironment][shader-compile] Sunset shader source prepared');
      console.info('compile', {
        compileCount: this.compileCount,
        shaderVersion: sunsetSkyShaderVersion,
        quality: this.quality,
        defines: this.material.defines,
        uniforms: Object.keys(parameters.uniforms),
        vertexLength: parameters.vertexShader.length,
        fragmentLength: parameters.fragmentShader.length,
        features: {
          cameraUniform: parameters.fragmentShader.includes('uniform vec3 uCameraPosition'),
          cloudDensity: parameters.fragmentShader.includes('float cloudDensity'),
          cloudSegment: parameters.fragmentShader.includes('bool cloudSegment'),
          cloudMarch: parameters.fragmentShader.includes('vec4 marchClouds'),
          debugMode: parameters.fragmentShader.includes('uniform int uAtmosphereDebugMode')
        }
      });
      console.groupEnd();
    };

    this.sky = new Mesh(new SphereGeometry(4200, 64, 32), this.material);
    this.sky.name = 'SunsetSkySphere';
    this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (renderer, _scene, camera): void => {
      this.beforeRenderCount += 1;
      if (shouldLogInitialDraw(this.beforeRenderCount)) {
        console.info('[ShaderRoam][SunsetEnvironment][draw:before]', {
          count: this.beforeRenderCount,
          cameraPosition: camera.position.toArray(),
          skyPosition: this.sky.position.toArray(),
          visible: this.sky.visible && this.material.visible,
          renderOrder: this.sky.renderOrder,
          callsBeforeSky: renderer.info.render.calls
        });
      }
    };
    this.sky.onAfterRender = (renderer): void => {
      this.afterRenderCount += 1;
      if (shouldLogInitialDraw(this.afterRenderCount)) {
        console.info('[ShaderRoam][SunsetEnvironment][draw:after]', {
          count: this.afterRenderCount,
          callsAfterSky: renderer.info.render.calls,
          trianglesAfterSky: renderer.info.render.triangles
        });
      }
    };
    scene.add(this.sky);

    console.groupCollapsed('[ShaderRoam][SunsetEnvironment][init] Sunset environment created');
    console.info('configuration', {
      shaderVersion: sunsetSkyShaderVersion,
      quality: this.quality,
      defines: this.qualityDefines,
      sunsetCloudLayerBounds,
      sunsetCloudProfile,
      skyRadius: 4200
    });
    console.info('material', {
      name: this.material.name,
      side: this.material.side,
      depthWrite: this.material.depthWrite,
      depthTest: this.material.depthTest,
      transparent: this.material.transparent,
      uniformNames: Object.keys(this.material.uniforms)
    });
    console.groupEnd();
  }

  resize(renderer: WebGLRenderer): void {
    const size = renderer.getSize(new Vector2());
    this.material.uniforms.iResolution.value.copy(size);
    console.info('[ShaderRoam][SunsetEnvironment][resize]', {
      cssSize: size.toArray(),
      uniformResolution: this.material.uniforms.iResolution.value.toArray(),
      pixelRatio: renderer.getPixelRatio()
    });
  }

  update(elapsed: number, cameraPosition: Vector3, vehicleState: VehicleState): void {
    this.updateCount += 1;
    this.sky.position.copy(cameraPosition);
    this.material.uniforms.iTime.value = elapsed;
    this.material.uniforms.uCameraPosition.value.copy(cameraPosition);
    this.material.uniforms.vehiclePosition.value.copy(vehicleState.position);

    if (this.updateCount <= 2) {
      console.info('[ShaderRoam][SunsetEnvironment][update]', {
        count: this.updateCount,
        elapsed,
        cameraPosition: cameraPosition.toArray(),
        uniformCameraPosition: this.material.uniforms.uCameraPosition.value.toArray(),
        vehiclePosition: vehicleState.position.toArray(),
        skyPosition: this.sky.position.toArray()
      });
    }
  }

  setDebugMode(mode: AtmosphereDebugMode): void {
    if (mode !== 0 && mode !== 1 && mode !== 2) {
      throw new RangeError(`Unsupported atmosphere debug mode: ${String(mode)}`);
    }

    this.material.uniforms.uAtmosphereDebugMode.value = mode;
    console.warn('[ShaderRoam][SunsetEnvironment][debug-mode]', {
      mode,
      description:
        mode === 0 ? 'normal rendering' : mode === 1 ? 'cloud layer ray segment' : 'integrated cloud opacity'
    });
  }

  getDiagnostics(camera: PerspectiveCamera, renderer: WebGLRenderer) {
    camera.getWorldDirection(this.cameraForward);
    const cameraUniform = this.material.uniforms.uCameraPosition.value as Vector3;
    const uniformCameraDistance = cameraUniform.distanceTo(camera.position);
    const skyCameraDistance = this.sky.position.distanceTo(camera.position);
    const centerRayCloudSegment = calculateCloudSegment(
      camera.position.y,
      this.cameraForward.y,
      Number(this.qualityDefines.CLOUD_FAR_DISTANCE)
    );
    const sunsetProgram = getRendererProgramDiagnostics(renderer).find(
      (program) => program.name === this.material.name
    );

    return {
      shaderVersion: sunsetSkyShaderVersion,
      quality: this.quality,
      defines: this.qualityDefines,
      densityProfile: sunsetCloudProfile,
      counters: {
        updates: this.updateCount,
        shaderCompiles: this.compileCount,
        beforeRender: this.beforeRenderCount,
        afterRender: this.afterRenderCount
      },
      camera: {
        position: camera.position.toArray(),
        forward: this.cameraForward.toArray(),
        insideCloudLayer:
          camera.position.y > sunsetCloudLayerBounds.bottom &&
          camera.position.y < sunsetCloudLayerBounds.top
      },
      uniforms: {
        iTime: this.material.uniforms.iTime.value,
        iResolution: this.material.uniforms.iResolution.value.toArray(),
        uCameraPosition: cameraUniform.toArray(),
        vehiclePosition: this.material.uniforms.vehiclePosition.value.toArray(),
        sunDirection: this.material.uniforms.sunDirection.value.toArray(),
        uAtmosphereDebugMode: this.material.uniforms.uAtmosphereDebugMode.value
      },
      centerRayCloudSegment,
      mesh: {
        name: this.sky.name,
        visible: this.sky.visible,
        frustumCulled: this.sky.frustumCulled,
        cameraLayerVisible: camera.layers.test(this.sky.layers),
        renderOrder: this.sky.renderOrder,
        positionCount: this.sky.geometry.attributes.position?.count ?? 0
      },
      material: {
        name: this.material.name,
        visible: this.material.visible,
        side: this.material.side,
        depthWrite: this.material.depthWrite,
        depthTest: this.material.depthTest,
        transparent: this.material.transparent
      },
      program: sunsetProgram ?? null,
      sync: {
        uniformCameraDistance,
        skyCameraDistance
      },
      checks: {
        updateRunning: this.updateCount > 0,
        shaderPrepared: this.compileCount > 0,
        drawStarted: this.beforeRenderCount > 0,
        drawCompleted: this.afterRenderCount > 0,
        shaderProgramFound: sunsetProgram !== undefined,
        shaderProgramLinked: sunsetProgram?.linkStatus === true,
        cameraUniformSynced: uniformCameraDistance < 0.0001,
        skyCenteredOnCamera: skyCameraDistance < 0.0001,
        centerRayHitsCloudLayer: centerRayCloudSegment !== null,
        meshVisibleToCamera: this.sky.visible && this.material.visible && camera.layers.test(this.sky.layers)
      }
    };
  }
}

function shouldLogInitialDraw(count: number): boolean {
  return count <= 2;
}

function calculateCloudSegment(originY: number, directionY: number, farDistance: number) {
  if (Math.abs(directionY) < 0.0001) {
    return originY > sunsetCloudLayerBounds.bottom && originY < sunsetCloudLayerBounds.top
      ? { start: 0, end: farDistance, travel: farDistance }
      : null;
  }

  const invY = 1 / directionY;
  const a = (sunsetCloudLayerBounds.bottom - originY) * invY;
  const b = (sunsetCloudLayerBounds.top - originY) * invY;
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(farDistance, Math.max(a, b));

  return end > start ? { start, end, travel: end - start } : null;
}
