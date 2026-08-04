import type { Object3D, Quaternion, Vector3 } from 'three';

export interface ExperienceConfig {
  vehicleId: string;
  vehicleModelUrl: string;
  vehicleModelYawDegrees: number;
}

export interface VehicleState {
  position: Vector3;
  rotation: Quaternion;
  velocity: Vector3;
  angularVelocity: Vector3;
  throttle: number;
  speed: number;
}

export interface Updatable {
  update(dt: number, elapsed: number): void;
}

export interface VehicleModule extends Updatable {
  object: Object3D;
  state: VehicleState;
}
