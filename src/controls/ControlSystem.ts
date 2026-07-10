import { applyDeadzone, clamp, damp } from './math';
import {
  createNeutralFlightCommand,
  defaultControlSettings,
  type ControlSettings,
  type FlightCommand,
  type RawInputState
} from './types';

export class ControlSystem {
  readonly command: FlightCommand = createNeutralFlightCommand();

  private readonly settings: ControlSettings;
  private pointerYawPulse = 0;
  private pointerPitchPulse = 0;

  constructor(settings: Partial<ControlSettings> = {}) {
    this.settings = {
      ...defaultControlSettings,
      ...settings
    };
  }

  update(raw: RawInputState, dt: number): FlightCommand {
    const target = createNeutralFlightCommand();

    target.throttle = raw.keys.has('KeyW') ? 1 : 0;
    target.brake = raw.keys.has('KeyS') ? 1 : 0;
    target.yaw =
      (Number(raw.keys.has('KeyA') || raw.keys.has('ArrowLeft')) -
        Number(raw.keys.has('KeyD') || raw.keys.has('ArrowRight'))) *
      this.settings.keyboardSensitivity;
    target.roll =
      (Number(raw.keys.has('KeyQ')) - Number(raw.keys.has('KeyE'))) *
      this.settings.keyboardSensitivity;
    target.pitch =
      (Number(raw.keys.has('ArrowUp')) - Number(raw.keys.has('ArrowDown'))) *
      this.settings.keyboardSensitivity;
    target.boost = raw.keys.has('ShiftLeft') || raw.keys.has('ShiftRight');

    this.pointerYawPulse = clamp(
      this.pointerYawPulse - raw.pointerDelta.x * this.settings.pointerSensitivity,
      -1,
      1
    );
    this.pointerPitchPulse = clamp(
      this.pointerPitchPulse - raw.pointerDelta.y * this.settings.pointerSensitivity,
      -1,
      1
    );

    target.yaw += this.pointerYawPulse;
    target.pitch += this.pointerPitchPulse;

    if (this.settings.invertPitch) {
      target.pitch *= -1;
    }

    target.pitch = applyDeadzone(clamp(target.pitch, -1, 1), this.settings.deadzone);
    target.yaw = applyDeadzone(clamp(target.yaw, -1, 1), this.settings.deadzone);
    target.roll = applyDeadzone(clamp(target.roll, -1, 1), this.settings.deadzone);

    this.command.throttle = target.throttle;
    this.command.brake = target.brake;
    this.command.pitch = damp(this.command.pitch, target.pitch, this.settings.smoothing, dt);
    this.command.yaw = damp(this.command.yaw, target.yaw, this.settings.smoothing, dt);
    this.command.roll = damp(this.command.roll, target.roll, this.settings.smoothing, dt);
    this.command.boost = target.boost;

    this.pointerYawPulse = damp(this.pointerYawPulse, 0, 9, dt);
    this.pointerPitchPulse = damp(this.pointerPitchPulse, 0, 9, dt);

    return this.command;
  }
}
