export const GEAR_RATIOS = [-0.3, 0, 0.25, 0.5, 0.75, 1.0];

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = null;
    this.keys = { w: false, a: false, s: false, d: false };
    this.gear = 1;
    this.orbitYaw = 0;
    this.orbitPitch = -0.35;
    this.wantsFire = false;
    this.locked = false;
    this.skillActivations = [];
    this.sensitivity = 0.002;
    this.scopedSensitivity = 0.0006;
    this.scoped = false;
    this._scopePressed = false;

    this.zoomLevel = 1.0;
    this._minZoom = 0.3;
    this._maxZoom = 3.0;
    this.normalFov = 60;
    this._minFov = 25;
    this._maxFov = 100;
    this.heightOffset = 0;
    this._minHeight = -4;
    this._maxHeight = 250;
    this.weaponMode = 'gun';
    this.torpedoTier = 1;
    this.torpedoSpread = 'narrow';
    this._availableTiers = [1, 2, 3];

    this._onKeyDown = (e) => {
      if (e.key == null) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'd') this.keys[k] = true;

      if (this.locked) {
        // Skills (no-repeat to prevent spam)
        if (k === 'f' && !e.repeat) {
          this.skillActivations.push('rapid_fire');
          e.preventDefault();
        } else if (k === 'g' && !e.repeat) {
          this.skillActivations.push('damage_control');
          e.preventDefault();
        } else if (k === 'h' && !e.repeat) {
          this.skillActivations.push('precision');
          e.preventDefault();
        } else if (k === 'q' && !e.repeat && this.scoped) {
          const step = this.heightOffset > 0
            ? this.heightOffset * 0.25 + 3
            : 2;
          this.heightOffset = Math.min(this._maxHeight, this.heightOffset + step);
          if (this.audio) this.audio.playScopeAdjust();
          e.preventDefault();
        } else if (k === 'e' && !e.repeat && this.scoped) {
          const step = this.heightOffset > 5
            ? this.heightOffset * 0.25 + 3
            : 2;
          this.heightOffset = Math.max(this._minHeight, this.heightOffset - step);
          if (this.audio) this.audio.playScopeAdjust();
          e.preventDefault();
        } else if (k === 'w' && !e.repeat) {
          this.gear = Math.min(GEAR_RATIOS.length - 1, this.gear + 1);
          if (this.audio) this.audio.playGearShift();
          e.preventDefault();
        } else if (k === 's' && !e.repeat) {
          this.gear = Math.max(0, this.gear - 1);
          if (this.audio) this.audio.playGearShift();
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
        this.heightOffset = 0;
        this.zoomLevel = 1.0;
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
    };
    this._onMouseUp = (e) => {
      if (!this.locked) return;
      if (e.button === 2) {
        this.scoped = !this.scoped;
        if (!this.scoped) {
          this.heightOffset = 0;
          this.zoomLevel = 1.0;
        }
      }
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onWheel = (e) => {
      if (!this.locked) return;
      e.preventDefault();
      if (this.scoped) {
        this.zoomLevel -= e.deltaY * 0.002;
        this.zoomLevel = Math.max(this._minZoom, Math.min(this._maxZoom, this.zoomLevel));
        if (this.audio) this.audio.playScopeAdjust();
      } else {
        this.normalFov += e.deltaY * 0.1;
        this.normalFov = Math.max(this._minFov, Math.min(this._maxFov, this.normalFov));
      }
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('click', this._onClick);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('wheel', this._onWheel, { passive: false });
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

  setAudioManager(audio) {
    this.audio = audio;
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
    this.heightOffset = 0;
    this.zoomLevel = 1.0;
  }

  consumeFire() {
    if (this.wantsFire) {
      this.wantsFire = false;
      return true;
    }
    return false;
  }

  consumeSkillActivations() {
    const skills = [...this.skillActivations];
    this.skillActivations = [];
    return skills;
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('click', this._onClick);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
  }
}
