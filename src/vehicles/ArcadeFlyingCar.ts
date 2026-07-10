import { Euler, MathUtils, Object3D, Vector3 } from 'three';
import type { FlightCommand } from '../controls/types';
import type { VehicleModule, VehicleState } from '../engine/types';

export interface ArcadeFlyingCarOptions {
  object: Object3D;
  visual: Object3D;
  command: FlightCommand;
  startPosition?: Vector3;
}

const localForward = new Vector3(0, 0, -1);
const maxPitch = MathUtils.degToRad(38);
const maxVisualBank = MathUtils.degToRad(38);

export class ArcadeFlyingCar implements VehicleModule {
  readonly object: Object3D;
  readonly state: VehicleState;

  private readonly visual: Object3D;
  private readonly command: FlightCommand;
  private readonly motionEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly desiredForward = new Vector3();
  private readonly travelDirection = new Vector3();

  private heading = 0;
  private pitch = 0;
  private visualRoll = 0;
  private visualPitch = 0;
  private longitudinalAcceleration = 0;

  constructor(options: ArcadeFlyingCarOptions) {
    this.object = options.object;
    this.visual = options.visual;
    this.command = options.command;

    this.object.position.copy(options.startPosition ?? new Vector3(0, 520, 0));
    this.motionEuler.setFromQuaternion(this.object.quaternion, 'YXZ');
    this.heading = this.motionEuler.y;
    this.pitch = clamp(this.motionEuler.x, -maxPitch, maxPitch);
    this.travelDirection.copy(localForward).applyQuaternion(this.object.quaternion).normalize();
    this.desiredForward.copy(this.travelDirection);

    this.state = {
      position: this.object.position,
      rotation: this.object.quaternion,
      velocity: this.travelDirection.clone().multiplyScalar(92),
      angularVelocity: new Vector3(),
      throttle: 0,
      speed: 92
    };
  }

  update(dt: number): void {
    const previousSpeed = this.state.speed;
    const boostMultiplier = this.command.boost ? 1.65 : 1;
    const maxSpeed = 210 * boostMultiplier;
    const minSpeed = 28;
    const cruiseSpeed = 92;

    const acceleration = 58 * boostMultiplier;
    const brakePower = 82;
    const passiveReturn = 0.24;

    this.state.throttle = this.command.throttle;

    if (this.command.brake > 0) {
      this.state.speed -= brakePower * this.command.brake * dt;
    } else if (this.command.throttle > 0) {
      this.state.speed += acceleration * this.command.throttle * dt;
    } else {
      this.state.speed += (cruiseSpeed - this.state.speed) * passiveReturn * dt;
    }

    this.state.speed = clamp(this.state.speed, minSpeed, maxSpeed);
    this.longitudinalAcceleration = (this.state.speed - previousSpeed) / Math.max(dt, 0.0001);

    const speedAuthority = 0.72 + smoothstep(this.state.speed, minSpeed, 180) * 0.28;
    const yawRate = 0.72 * speedAuthority;
    const pitchRate = 0.62 * speedAuthority;
    const previousPitch = this.pitch;
    const previousVisualRoll = this.visualRoll;

    this.heading = wrapAngle(this.heading + this.command.yaw * yawRate * dt);
    if (Math.abs(this.command.pitch) > 0.01) {
      this.pitch += this.command.pitch * pitchRate * dt;
    } else {
      this.pitch = damp(this.pitch, 0, 1.65, dt);
    }
    this.pitch = clamp(this.pitch, -maxPitch, maxPitch);

    this.motionEuler.set(this.pitch, this.heading, 0, 'YXZ');
    this.object.quaternion.setFromEuler(this.motionEuler);

    this.desiredForward.copy(localForward).applyQuaternion(this.object.quaternion).normalize();
    this.travelDirection.lerp(this.desiredForward, 1 - Math.exp(-10 * dt)).normalize();
    this.state.velocity.copy(this.travelDirection).multiplyScalar(this.state.speed);
    this.object.position.addScaledVector(this.state.velocity, dt);

    const automaticBank = this.command.yaw * MathUtils.degToRad(22) * speedAuthority;
    const manualBank = this.command.roll * MathUtils.degToRad(30);
    const targetVisualRoll = clamp(automaticBank + manualBank, -maxVisualBank, maxVisualBank);
    this.visualRoll = damp(this.visualRoll, targetVisualRoll, 6.8, dt);

    const accelerationPitch = clamp(this.longitudinalAcceleration / 100, -1, 1) *
      MathUtils.degToRad(4.5);
    const controlPitch = this.command.pitch * MathUtils.degToRad(2);
    this.visualPitch = damp(this.visualPitch, accelerationPitch + controlPitch, 5.4, dt);
    this.visual.rotation.set(this.visualPitch, 0, this.visualRoll, 'YXZ');

    this.state.angularVelocity.set(
      (this.pitch - previousPitch) / Math.max(dt, 0.0001),
      this.command.yaw * yawRate,
      (this.visualRoll - previousVisualRoll) / Math.max(dt, 0.0001)
    );
  }

  getDiagnostics() {
    return {
      heading: this.heading,
      pitch: this.pitch,
      visualRoll: this.visualRoll,
      visualPitch: this.visualPitch,
      longitudinalAcceleration: this.longitudinalAcceleration,
      desiredForward: this.desiredForward.toArray(),
      travelDirection: this.travelDirection.toArray()
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function damp(current: number, target: number, smoothing: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}

function smoothstep(value: number, min: number, max: number): number {
  const normalized = clamp((value - min) / (max - min), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
