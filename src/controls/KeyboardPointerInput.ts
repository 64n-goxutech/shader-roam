import type { RawInputState } from './types';

const preventedKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Space'
]);

export class KeyboardPointerInput {
  private readonly pressed = new Set<string>();
  private readonly target: HTMLElement;
  private pointerDeltaX = 0;
  private pointerDeltaY = 0;
  private pointerFlightEnabled = true;

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.target.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  snapshot(): RawInputState {
    const state: RawInputState = {
      keys: this.pressed,
      pointerDelta: {
        x: this.pointerFlightEnabled ? this.pointerDeltaX : 0,
        y: this.pointerFlightEnabled ? this.pointerDeltaY : 0
      }
    };

    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;

    return state;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.target.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  setPointerFlightEnabled(enabled: boolean): void {
    this.pointerFlightEnabled = enabled;
    if (!enabled) {
      this.pointerDeltaX = 0;
      this.pointerDeltaY = 0;
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
    if (preventedKeys.has(event.code)) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.pressed.clear();
    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.pointerFlightEnabled) {
      return;
    }

    this.target.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerFlightEnabled || event.buttons !== 1) {
      return;
    }

    this.pointerDeltaX += event.movementX;
    this.pointerDeltaY += event.movementY;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerFlightEnabled && this.target.hasPointerCapture(event.pointerId)) {
      this.target.releasePointerCapture(event.pointerId);
    }
  };
}
