export const GEAR_RATIOS = [-0.3, 0, 0.25, 0.5, 0.75, 1.0];

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = { w: false, a: false, s: false, d: false };
    this.gear = 1;
    this.orbitYaw = 0;
    this.orbitPitch = -0.35;
    this.wantsFire = false;
    this.locked = false;
    this.sensitivity = 0.002;
    this.scopedSensitivity = 0.0006;
    this.scoped = false;
    this._scopePressed = false;

    this.weaponMode = 'gun';
    this.torpedoTier = 1;
    this.torpedoSpread = 'narrow';
    this._availableTiers = [1, 2, 3];

    this._onKeyDown = (e) => {
      if (e.key == null) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'd') this.keys[k] = true;

      if (this.locked) {
        if (k === 'w' && !e.repeat) {
          this.gear = Math.min(GEAR_RATIOS.length - 1, this.gear + 1);
          e.preventDefault();
        } else if (k === 's' && !e.repeat) {
          this.gear = Math.max(0, this.gear - 1);
          e.preventDefault();
        } else if (k === '1') {
          this.weaponMode = 'gun';
          e.preventDefault();
        } else if (k === '2') {
          if (this._availableTiers.includes(1)) {
            if (this.weaponMode === 'torpedo' && this.torpedoTier === 1) {
              this.torpedoSpread = this.torpedoSpread === 'narrow' ? 'wide' : 'narrow';
            } else {
              this.weaponMode = 'torpedo';
              this.torpedoTier = 1;
            }
          }
          e.preventDefault();
        } else if (k === '3') {
          if (this._availableTiers.includes(2)) {
            if (this.weaponMode === 'torpedo' && this.torpedoTier === 2) {
              this.torpedoSpread = this.torpedoSpread === 'narrow' ? 'wide' : 'narrow';
            } else {
              this.weaponMode = 'torpedo';
              this.torpedoTier = 2;
            }
          }
          e.preventDefault();
        } else if (k === '4') {
          if (this._availableTiers.includes(3)) {
            if (this.weaponMode === 'torpedo' && this.torpedoTier === 3) {
              this.torpedoSpread = this.torpedoSpread === 'narrow' ? 'wide' : 'narrow';
            } else {
              this.weaponMode = 'torpedo';
              this.torpedoTier = 3;
            }
          }
          e.preventDefault();
        }
      }
    };
    this._onKeyUp = (e) => {
      if (e.key == null) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'd') this.keys[k] = false;
    };

    this._onClick = () => {
      if (!this.locked) this.canvas.requestPointerLock();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.scoped = false;
        this._scopePressed = false;
      }
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      const sens = this.scoped ? this.scopedSensitivity : this.sensitivity;
      this.orbitYaw -= e.movementX * sens;
      this.orbitPitch -= e.movementY * sens;
      this.orbitPitch = Math.max(-1.2, Math.min(0.4, this.orbitPitch));
    };
    this._onMouseDown = (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.wantsFire = true;
      if (e.button === 2) this.scoped = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 2) this.scoped = false;
    };
    this._onContextMenu = (e) => e.preventDefault();

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('click', this._onClick);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  updateMotionKeys(currentSpeed, maxSpeed) {
    const target = GEAR_RATIOS[this.gear] * maxSpeed;
    const epsilon = 0.05;
    if (currentSpeed < target - epsilon) {
      this.keys.w = true;
      this.keys.s = false;
    } else if (currentSpeed > target + epsilon) {
      this.keys.w = false;
      this.keys.s = true;
    } else {
      this.keys.w = false;
      this.keys.s = false;
    }
  }

  setTorpedoCapabilities({ availableTiers }) {
    this._availableTiers = availableTiers;
  }

  get availableTorpedoTiers() {
    return this._availableTiers;
  }

  attachCanvas(newCanvas) {
    if (newCanvas === this.canvas) return;
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this.canvas = newCanvas;
    newCanvas.addEventListener('click', this._onClick);
    newCanvas.addEventListener('contextmenu', this._onContextMenu);
    this.locked = false;
    this.scoped = false;
    this._scopePressed = false;
  }

  consumeFire() {
    if (this.wantsFire) {
      this.wantsFire = false;
      return true;
    }
    return false;
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('click', this._onClick);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
  }
}
