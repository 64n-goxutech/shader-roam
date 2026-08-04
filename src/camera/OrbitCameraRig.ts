import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VehicleState } from '../engine/types';

export interface OrbitCameraRigOptions {
  camera: PerspectiveCamera;
  domElement: HTMLElement;
}

const initialOffset = new Vector3(0, 2.25, 9.5);
const targetOffset = new Vector3(0, 0.35, 0);
const baseFov = 64;
const maxFov = 74;
const followSharpness = 18;
const fovSharpness = 4.8;
const headingSharpness = 7.5;
const localForward = new Vector3(0, 0, -1);
const worldUp = new Vector3(0, 1, 0);

export class OrbitCameraRig {
  readonly controls: OrbitControls;

  private readonly camera: PerspectiveCamera;
  private readonly target = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly lookAhead = new Vector3();
  private readonly targetDelta = new Vector3();
  private readonly previousTarget = new Vector3();
  private readonly cameraOffset = new Vector3();
  private readonly vehicleForward = new Vector3();
  private targetFov = baseFov;
  private targetHeading = 0;
  private followHeading = 0;
  private initialized = false;

  constructor(options: OrbitCameraRigOptions) {
    this.camera = options.camera;
    this.controls = new OrbitControls(options.camera, options.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.58;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.55;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 46;
    this.controls.screenSpacePanning = true;
  }

  update(dt: number, vehicleState: VehicleState): void {
    if (!this.initialized) {
      this.reset(vehicleState);
      this.initialized = true;
    }

    const speedLookAhead = Math.min(10.5, vehicleState.speed / followSharpness);
    this.lookAhead
      .copy(vehicleState.velocity)
      .normalize()
      .multiplyScalar(speedLookAhead);
    this.desiredTarget.copy(vehicleState.position).add(targetOffset).add(this.lookAhead);
    const followAlpha = 1 - Math.exp(-followSharpness * dt);
    this.target.lerp(this.desiredTarget, followAlpha);
    this.targetDelta.copy(this.target).sub(this.previousTarget);
    this.controls.target.add(this.targetDelta);
    this.camera.position.add(this.targetDelta);
    this.previousTarget.copy(this.target);

    this.targetHeading = this.readVehicleHeading(vehicleState);
    const headingDelta =
      shortestAngle(this.targetHeading - this.followHeading) *
      (1 - Math.exp(-headingSharpness * dt));
    this.followHeading = wrapAngle(this.followHeading + headingDelta);
    this.cameraOffset
      .copy(this.camera.position)
      .sub(this.controls.target)
      .applyAxisAngle(worldUp, headingDelta);
    this.camera.position.copy(this.controls.target).add(this.cameraOffset);

    const speedRatio = MathUtils.smoothstep(vehicleState.speed, 72, 260);
    this.targetFov = MathUtils.lerp(baseFov, maxFov, speedRatio);
    const nextFov = MathUtils.lerp(
      this.camera.fov,
      this.targetFov,
      1 - Math.exp(-fovSharpness * dt)
    );
    if (Math.abs(nextFov - this.camera.fov) > 0.001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }

  reset(vehicleState: VehicleState): void {
    this.target.copy(vehicleState.position).add(targetOffset);
    this.desiredTarget.copy(this.target);
    this.lookAhead.set(0, 0, 0);
    this.targetHeading = this.readVehicleHeading(vehicleState);
    this.followHeading = this.targetHeading;
    this.cameraOffset.copy(initialOffset).applyAxisAngle(worldUp, this.followHeading);
    this.camera.position.copy(this.target).add(this.cameraOffset);
    this.camera.fov = baseFov;
    this.camera.updateProjectionMatrix();
    this.targetFov = baseFov;
    this.controls.target.copy(this.target);
    this.previousTarget.copy(this.target);
    this.controls.update();
  }

  getDiagnostics() {
    return {
      initialized: this.initialized,
      lookAheadDistance: this.lookAhead.length(),
      targetFov: this.targetFov,
      currentFov: this.camera.fov,
      targetHeading: this.targetHeading,
      followHeading: this.followHeading,
      headingError: shortestAngle(this.targetHeading - this.followHeading)
    };
  }

  private readVehicleHeading(vehicleState: VehicleState): number {
    this.vehicleForward.copy(localForward).applyQuaternion(vehicleState.rotation);
    this.vehicleForward.y = 0;
    if (this.vehicleForward.lengthSq() < 0.0001) {
      return this.followHeading;
    }

    this.vehicleForward.normalize();
    return Math.atan2(-this.vehicleForward.x, -this.vehicleForward.z);
  }
}

function shortestAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
