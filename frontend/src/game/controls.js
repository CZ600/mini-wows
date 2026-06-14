export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = { w: false, a: false, s: false, d: false };
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
      if (k in this.keys) this.keys[k] = true;

      if (this.locked) {
        if (k === '1') {
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
      if (k in this.keys) this.keys[k] = false;
    };
    this._onClick = () => {
      if (!this.locked) canvas.requestPointerLock();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === canvas;
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

  setTorpedoCapabilities({ availableTiers }) {
    this._availableTiers = availableTiers;
  }

  get availableTorpedoTiers() {
    return this._availableTiers;
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
