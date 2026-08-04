import CameraControls from 'camera-controls';
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4
} from 'three';
import type { VehicleState } from '../engine/types';

CameraControls.install({
  THREE: {
    Box3,
    MathUtils,
    Matrix4,
    OrthographicCamera,
    PerspectiveCamera,
    Quaternion,
    Raycaster,
    Sphere,
    Spherical,
    Vector2,
    Vector3,
    Vector4
  }
});

export interface VehicleCameraRigOptions {
  camera: PerspectiveCamera;
  domElement: HTMLElement;
}

const initialOffset = new Vector3(0, 2.25, 9.5);
const targetOffset = new Vector3(0, 0.35, 0);
const baseFov = 64;
const maxFov = 74;
const orbitRotateSpeed = 1.6;
const fovSharpness = 4.8;
const headingSharpness = 7.5;
const localForward = new Vector3(0, 0, -1);
const worldUp = new Vector3(0, 1, 0);

export class VehicleCameraRig {
  readonly controls: CameraControls;

  private readonly camera: PerspectiveCamera;
  private readonly previousVehiclePosition = new Vector3();
  private readonly followDelta = new Vector3();
  private readonly controlsTarget = new Vector3();
  private readonly controlsPosition = new Vector3();
  private readonly cameraOffset = new Vector3();
  private readonly vehicleForward = new Vector3();
  private targetFov = baseFov;
  private targetHeading = 0;
  private followHeading = 0;
  private initialized = false;

  constructor(options: VehicleCameraRigOptions) {
    this.camera = options.camera;
    this.controls = new CameraControls(options.camera, options.domElement);
    this.controls.smoothTime = 0.12;
    this.controls.draggingSmoothTime = 0.08;
    this.controls.azimuthRotateSpeed = orbitRotateSpeed;
    this.controls.polarRotateSpeed = orbitRotateSpeed;
    this.controls.dollySpeed = 0.85;
    this.controls.truckSpeed = 0.55;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 46;
    this.controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    this.controls.mouseButtons.right = CameraControls.ACTION.SCREEN_PAN;
    this.controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  }

  update(dt: number, vehicleState: VehicleState): void {
    if (!this.initialized) {
      this.reset(vehicleState);
      this.initialized = true;
    }

    this.controls.update(dt);
    this.controls.getTarget(this.controlsTarget, false);
    this.controls.getPosition(this.controlsPosition, false);

    this.followDelta.copy(vehicleState.position).sub(this.previousVehiclePosition);
    this.controlsTarget.add(this.followDelta);
    this.controlsPosition.add(this.followDelta);
    this.previousVehiclePosition.copy(vehicleState.position);

    this.targetHeading = this.readVehicleHeading(vehicleState);
    const headingDelta =
      shortestAngle(this.targetHeading - this.followHeading) *
      (1 - Math.exp(-headingSharpness * dt));
    this.followHeading = wrapAngle(this.followHeading + headingDelta);
    this.cameraOffset
      .copy(this.controlsPosition)
      .sub(this.controlsTarget)
      .applyAxisAngle(worldUp, headingDelta);
    this.controlsPosition.copy(this.controlsTarget).add(this.cameraOffset);
    void this.controls.setLookAt(
      this.controlsPosition.x,
      this.controlsPosition.y,
      this.controlsPosition.z,
      this.controlsTarget.x,
      this.controlsTarget.y,
      this.controlsTarget.z,
      false
    );
    this.controls.update(0);

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
  }

  dispose(): void {
    this.controls.dispose();
  }

  reset(vehicleState: VehicleState): void {
    this.controlsTarget.copy(vehicleState.position).add(targetOffset);
    this.targetHeading = this.readVehicleHeading(vehicleState);
    this.followHeading = this.targetHeading;
    this.cameraOffset.copy(initialOffset).applyAxisAngle(worldUp, this.followHeading);
    this.controlsPosition.copy(this.controlsTarget).add(this.cameraOffset);
    void this.controls.setLookAt(
      this.controlsPosition.x,
      this.controlsPosition.y,
      this.controlsPosition.z,
      this.controlsTarget.x,
      this.controlsTarget.y,
      this.controlsTarget.z,
      false
    );
    this.controls.update(0);
    this.camera.fov = baseFov;
    this.camera.updateProjectionMatrix();
    this.targetFov = baseFov;
    this.previousVehiclePosition.copy(vehicleState.position);
    this.followDelta.set(0, 0, 0);
  }

  getDiagnostics() {
    return {
      controller: 'camera-controls',
      initialized: this.initialized,
      active: this.controls.active,
      currentAction: this.controls.currentAction,
      distance: this.controls.distance,
      positionFollowMode: 'render-delta',
      lastFollowDistance: this.followDelta.length(),
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
