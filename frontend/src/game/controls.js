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
    // Submarine dive toggle requests (edge-triggered, consumed by the engine).
    this.diveToggleRequests = [];
    // Carrier view mode: 'ship' (steer the carrier) or 'squadron' (fly the
    // aircraft). The engine flips camera subject + input routing on change.
    this.viewMode = 'ship';
    this.viewToggleRequests = [];
    // Carrier air-group launch requests. Each entry is 'torpedo' (鱼雷机) or
    // 'bomber' (轰炸机): the engine launches/switches to that group on consume.
    // Bound to keys 5/6 (the bottom weapon bar slots).
    this.squadronLaunchRequests = [];
    // Carrier squadron auto-pilot toggle requests (edge-triggered, consumed by
    // the engine). Bound to Y. Ignored by non-carriers.
    this.autoPilotToggleRequests = [];
    // Carrier map toggle requests (edge-triggered). Bound to M; opens the
    // full-screen carrier patrol map (React layer renders it).
    this.carrierMapToggleRequests = [];
    // Carrier active-squadron switch requests (edge-triggered). Bound to Tab;
    // swaps control/camera between the torpedo and bomber squadrons while flying.
    this.squadronSwitchRequests = [];
    this.sensitivity = 0.002;
    this.scopedSensitivity = 0.0006;
    this.scoped = false;
    this._scopePressed = false;
    // 开镜期锁定的绝对世界偏航角：开镜时船身转向不再带动瞄准镜方向，
    // 只有鼠标水平移动才会改变这个值。引擎层在进入开镜的边沿上锚定它。
    this.scopedWorldYaw = 0;
    this._wasScoped = false;

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
    // ASW (anti-submarine depth charges) capability for the current ship. Set
    // from the resolved class config; the 6-key weapon select skips it when
    // the ship has no ASW fit (e.g. carrier / submarine).
    this._hasAsw = false;
    // Secondary battery capability (cruiser / battleship side turrets), bound
    // to the 5 key.
    this._hasSecondary = false;

    this._onKeyDown = (e) => {
      if (e.key == null) return;
      const k = e.key.toLowerCase();
      // Steering + altitude keys are captured unconditionally (not gated on
      // pointer lock) so flying the squadron stays responsive even if the lock
      // dropped (e.g. after opening the M-key map). A/D steer, W/S dive/climb.
      if (k === 'a' || k === 'd') this.keys[k] = true;
      if (this.viewMode === 'squadron' && (k === 'w' || k === 's')) {
        this.keys[k] = true;
      }

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
        } else if (k === 'w') {
          if (this.viewMode === 'squadron') {
            // Aircraft throttle: held = accelerate.
            this.keys.w = true;
          } else if (!e.repeat) {
            this.gear = Math.min(GEAR_RATIOS.length - 1, this.gear + 1);
            if (this.audio) this.audio.playGearShift();
          }
          e.preventDefault();
        } else if (k === 's') {
          if (this.viewMode === 'squadron') {
            this.keys.s = true;
          } else if (!e.repeat) {
            this.gear = Math.max(0, this.gear - 1);
            if (this.audio) this.audio.playGearShift();
          }
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
        } else if (k === '5' && !e.repeat) {
          // 5 = secondary battery (副炮) on cruisers/battleships. Ships that
          // carry none fall through to the carrier torpedo-bomber launch —
          // carriers are exactly the ships with no secondaries, so the two
          // roles never collide on one hull.
          if (this._hasSecondary) {
            this.weaponMode = 'secondary';
          } else {
            this.squadronLaunchRequests.push('torpedo');
          }
          e.preventDefault();
        } else if (k === '6' && !e.repeat) {
          // 6 = depth charges (深水炸弹) on destroyers/cruisers (close drop)
          // and battleships (air strike). Ships that carry none fall through
          // to the carrier dive-bomber launch.
          if (this._hasAsw) {
            this.weaponMode = 'asw';
          } else {
            this.squadronLaunchRequests.push('bomber');
          }
          e.preventDefault();
        } else if (k === 'y' && !e.repeat) {
          // Carrier squadron auto-pilot toggle (auto-attack). Ignored by
          // non-carriers in the engine.
          this.autoPilotToggleRequests.push(true);
          e.preventDefault();
        } else if (k === 'm' && !e.repeat) {
          // Carrier patrol map toggle (full-screen). Ignored by non-carriers.
          this.carrierMapToggleRequests.push(true);
          e.preventDefault();
        } else if (k === 'tab' && !e.repeat) {
          // Carrier active-squadron switch (torpedo <-> bomber) while flying.
          // Prevent the browser from moving keyboard focus away from the canvas.
          this.squadronSwitchRequests.push(true);
          e.preventDefault();
        } else if (k === 'b' && !e.repeat) {
          // Submarine dive toggle (ignored by non-submarines in the engine).
          this.diveToggleRequests.push(true);
          e.preventDefault();
        } else if (k === 't' && !e.repeat) {
          // Carrier view toggle: switch between steering the ship and flying
          // the squadron. Ignored by non-carriers in the engine.
          this.viewToggleRequests.push(true);
          e.preventDefault();
        }
      }
    };
    this._onKeyUp = (e) => {
      if (e.key == null) return;
      const k = e.key.toLowerCase();
      // A/D always release; W/S release in squadron view (altitude keys).
      if (k === 'a' || k === 'd') this.keys[k] = false;
      if (this.viewMode === 'squadron' && (k === 'w' || k === 's')) this.keys[k] = false;
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
        this.scopedWorldYaw = 0;
        this._wasScoped = false;
      }
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      const sens = this.scoped ? this.scopedSensitivity : this.sensitivity;
      // 开镜时水平移动直接改绝对世界偏航角（与 ship.heading 解耦），
      // 非开镜时仍走 orbitYaw（相对船身的偏移）。
      if (this.scoped) {
        this.scopedWorldYaw -= e.movementX * sens;
      } else {
        this.orbitYaw -= e.movementX * sens;
      }
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
          this.scopedWorldYaw = 0;
          this._wasScoped = false;
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

  setAswCapability(hasAsw) {
    this._hasAsw = !!hasAsw;
    // If the ship lost its ASW fit (e.g. class change), drop out of ASW mode so
    // left-click doesn't try to fire depth charges it can't launch.
    if (!this._hasAsw && this.weaponMode === 'asw') {
      this.weaponMode = 'gun';
    }
  }

  get hasAsw() {
    return this._hasAsw;
  }

  setSecondaryCapability(hasSecondary) {
    this._hasSecondary = !!hasSecondary;
    if (!this._hasSecondary && this.weaponMode === 'secondary') {
      this.weaponMode = 'gun';
    }
  }

  get hasSecondary() {
    return this._hasSecondary;
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
    this.scopedWorldYaw = 0;
    this._wasScoped = false;
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

  consumeDiveToggle() {
    if (this.diveToggleRequests.length > 0) {
      this.diveToggleRequests = [];
      return true;
    }
    return false;
  }

  consumeViewToggle() {
    if (this.viewToggleRequests.length > 0) {
      this.viewToggleRequests = [];
      return true;
    }
    return false;
  }

  // Pop the next carrier air-group launch request ('torpedo' | 'bomber'), or
  // null. Only the most recent group matters (rapid 5+6 = switch to bomber).
  consumeSquadronLaunch() {
    if (this.squadronLaunchRequests.length > 0) {
      const group = this.squadronLaunchRequests[this.squadronLaunchRequests.length - 1];
      this.squadronLaunchRequests = [];
      return group;
    }
    return null;
  }

  // Pop a carrier squadron auto-pilot toggle request (returns true if pending).
  consumeAutoPilotToggle() {
    if (this.autoPilotToggleRequests.length > 0) {
      this.autoPilotToggleRequests = [];
      return true;
    }
    return false;
  }

  // Pop a carrier patrol map toggle request (returns true if pending).
  consumeCarrierMapToggle() {
    if (this.carrierMapToggleRequests.length > 0) {
      this.carrierMapToggleRequests = [];
      return true;
    }
    return false;
  }

  // Pop a carrier active-squadron switch request (returns true if pending).
  // Bound to Tab — swaps the torpedo/bomber squadron the player flies.
  consumeSquadronSwitch() {
    if (this.squadronSwitchRequests.length > 0) {
      this.squadronSwitchRequests = [];
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
    document.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
  }
}
