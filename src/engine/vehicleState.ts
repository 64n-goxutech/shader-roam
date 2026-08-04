import { MathUtils, Quaternion, Vector3 } from 'three';
import type { VehicleSimulationState } from './types';

export function createVehicleSimulationState(
  source?: VehicleSimulationState
): VehicleSimulationState {
  const state: VehicleSimulationState = {
    position: new Vector3(),
    rotation: new Quaternion(),
    velocity: new Vector3(),
    angularVelocity: new Vector3(),
    throttle: 0,
    speed: 0,
    visualRoll: 0,
    visualPitch: 0
  };

  return source ? copyVehicleSimulationState(state, source) : state;
}

export function copyVehicleSimulationState(
  target: VehicleSimulationState,
  source: VehicleSimulationState
): VehicleSimulationState {
  target.position.copy(source.position);
  target.rotation.copy(source.rotation);
  target.velocity.copy(source.velocity);
  target.angularVelocity.copy(source.angularVelocity);
  target.throttle = source.throttle;
  target.speed = source.speed;
  target.visualRoll = source.visualRoll;
  target.visualPitch = source.visualPitch;
  return target;
}

export function interpolateVehicleSimulationState(
  target: VehicleSimulationState,
  previous: VehicleSimulationState,
  current: VehicleSimulationState,
  alpha: number
): VehicleSimulationState {
  const t = MathUtils.clamp(alpha, 0, 1);
  target.position.lerpVectors(previous.position, current.position, t);
  target.rotation.slerpQuaternions(previous.rotation, current.rotation, t);
  target.velocity.lerpVectors(previous.velocity, current.velocity, t);
  target.angularVelocity.lerpVectors(previous.angularVelocity, current.angularVelocity, t);
  target.throttle = MathUtils.lerp(previous.throttle, current.throttle, t);
  target.speed = MathUtils.lerp(previous.speed, current.speed, t);
  target.visualRoll = MathUtils.lerp(previous.visualRoll, current.visualRoll, t);
  target.visualPitch = MathUtils.lerp(previous.visualPitch, current.visualPitch, t);
  return target;
}
