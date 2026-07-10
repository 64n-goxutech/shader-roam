export interface RawInputState {
  keys: ReadonlySet<string>;
  pointerDelta: {
    x: number;
    y: number;
  };
}

export interface ControlSettings {
  pointerSensitivity: number;
  keyboardSensitivity: number;
  smoothing: number;
  invertPitch: boolean;
  deadzone: number;
}

export interface FlightCommand {
  throttle: number;
  brake: number;
  pitch: number;
  yaw: number;
  roll: number;
  boost: boolean;
}

export const defaultControlSettings: ControlSettings = {
  pointerSensitivity: 0.003,
  keyboardSensitivity: 1,
  smoothing: 18,
  invertPitch: false,
  deadzone: 0.02
};

export function createNeutralFlightCommand(): FlightCommand {
  return {
    throttle: 0,
    brake: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    boost: false
  };
}
