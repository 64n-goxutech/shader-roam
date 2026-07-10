import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VehicleState } from '../engine/types';

export interface OrbitCameraRigOptions {
  camera: PerspectiveCamera;
  domElement: HTMLElement;
}

const initialOffset = new Vector3(0, 2.7, 13.5);
const targetOffset = new Vector3(0, 0.35, 0);

export class OrbitCameraRig {
  readonly controls: OrbitControls;

  private readonly camera: PerspectiveCamera;
  private readonly target = new Vector3();
  private readonly targetDelta = new Vector3();
  private readonly previousTarget = new Vector3();
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

  update(vehicleState: VehicleState): void {
    if (!this.initialized) {
      this.reset(vehicleState);
      this.initialized = true;
    }

    this.target.copy(vehicleState.position).add(targetOffset);
    this.targetDelta.copy(this.target).sub(this.previousTarget);
    this.controls.target.add(this.targetDelta);
    this.camera.position.add(this.targetDelta);
    this.previousTarget.copy(this.target);
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }

  reset(vehicleState: VehicleState): void {
    this.target.copy(vehicleState.position).add(targetOffset);
    this.camera.position.copy(this.target).add(initialOffset);
    this.controls.target.copy(this.target);
    this.previousTarget.copy(this.target);
    this.controls.update();
  }
}
