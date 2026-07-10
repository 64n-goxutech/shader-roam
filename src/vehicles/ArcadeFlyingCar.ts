import { Object3D, Quaternion, Vector3 } from 'three';
import type { FlightCommand } from '../controls/types';
import type { VehicleModule, VehicleState } from '../engine/types';

export interface ArcadeFlyingCarOptions {
  object: Object3D;
  command: FlightCommand;
  startPosition?: Vector3;
}

const localPitchAxis = new Vector3(1, 0, 0);
const localYawAxis = new Vector3(0, 1, 0);
const localRollAxis = new Vector3(0, 0, -1);
const localForward = new Vector3(0, 0, -1);

export class ArcadeFlyingCar implements VehicleModule {
  readonly object: Object3D;
  readonly state: VehicleState;

  private readonly command: FlightCommand;
  private readonly deltaRotation = new Quaternion();
  private readonly forward = new Vector3();

  constructor(options: ArcadeFlyingCarOptions) {
    this.object = options.object;
    this.command = options.command;

    this.object.position.copy(options.startPosition ?? new Vector3(0, 520, 0));

    this.state = {
      position: this.object.position,
      rotation: this.object.quaternion,
      velocity: new Vector3(),
      angularVelocity: new Vector3(),
      throttle: 0,
      speed: 92
    };
  }

  update(dt: number): void {
    const boostMultiplier = this.command.boost ? 1.65 : 1;
    const maxSpeed = 210 * boostMultiplier;
    const minSpeed = 38;
    const cruiseSpeed = 92;

    const acceleration = 58 * boostMultiplier;
    const brakePower = 82;
    const passiveReturn = 0.24;

    this.state.throttle = this.command.throttle;

    if (this.command.throttle > 0) {
      this.state.speed += acceleration * dt;
    } else if (this.command.brake > 0) {
      this.state.speed -= brakePower * dt;
    } else {
      this.state.speed += (cruiseSpeed - this.state.speed) * passiveReturn * dt;
    }

    this.state.speed = clamp(this.state.speed, minSpeed, maxSpeed);

    const speedAuthority = clamp(this.state.speed / 140, 0.35, 1.35);
    const pitchRate = 0.78 * speedAuthority;
    const yawRate = 0.46 * speedAuthority;
    const rollRate = 1.35 * speedAuthority;

    this.applyLocalRotation(localPitchAxis, this.command.pitch * pitchRate * dt);
    this.applyLocalRotation(localYawAxis, this.command.yaw * yawRate * dt);
    this.applyLocalRotation(localRollAxis, this.command.roll * rollRate * dt);

    this.forward.copy(localForward).applyQuaternion(this.object.quaternion).normalize();
    this.state.velocity.copy(this.forward).multiplyScalar(this.state.speed);
    this.object.position.addScaledVector(this.state.velocity, dt);

    this.state.angularVelocity.set(
      this.command.pitch * pitchRate,
      this.command.yaw * yawRate,
      this.command.roll * rollRate
    );
  }

  private applyLocalRotation(axis: Vector3, radians: number): void {
    if (Math.abs(radians) < 0.00001) {
      return;
    }

    this.deltaRotation.setFromAxisAngle(axis, radians);
    this.object.quaternion.multiply(this.deltaRotation).normalize();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
