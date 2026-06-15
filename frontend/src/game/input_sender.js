export class InputSender {
  constructor(wsClient) {
    this.ws = wsClient;
    this.seq = 0;
    this.keys = { w: false, a: false, s: false, d: false };
    this.orbitYaw = 0;
    this.orbitPitch = -0.35;
    this._lastSent = 0;
    this._sendInterval = 50; // 20Hz to match server tick rate
    this._pendingInputs = [];
  }

  update(keys, orbitYaw, orbitPitch) {
    this.keys = { ...keys };
    this.orbitYaw = orbitYaw;
    this.orbitPitch = orbitPitch;
  }

  sendInput() {
    const now = performance.now();
    if (now - this._lastSent < this._sendInterval) return;
    this._lastSent = now;

    this.seq++;
    const input = {
      type: 'input',
      seq: this.seq,
      ts: Date.now(),
      k: {
        w: this.keys.w ? 1 : 0,
        a: this.keys.a ? 1 : 0,
        s: this.keys.s ? 1 : 0,
        d: this.keys.d ? 1 : 0,
      },
      yaw: this.orbitYaw,
      pitch: this.orbitPitch,
    };
    this._pendingInputs.push(input);
    this.ws.send(input);
  }

  sendFire(aimTarget) {
    this.seq++;
    const msg = {
      type: 'fire',
      seq: this.seq,
      ts: Date.now(),
      aim: { x: aimTarget.x, y: aimTarget.y, z: aimTarget.z },
    };
    this._pendingInputs.push(msg);
    this.ws.send(msg);
  }

  sendSkill(name) {
    this.seq++;
    const msg = {
      type: 'activate_skill',
      seq: this.seq,
      ts: Date.now(),
      skill: name,
    };
    this._pendingInputs.push(msg);
    this.ws.send(msg);
  }

  sendTorpedo(heading, tier, spread) {
    this.seq++;
    const msg = {
      type: 'fire_torpedo',
      seq: this.seq,
      ts: Date.now(),
      h: heading,
      tier,
      sp: spread === 'wide' ? 1 : 0,
    };
    this._pendingInputs.push(msg);
    this.ws.send(msg);
  }

  confirmInput(serverSeq) {
    // Remove all confirmed inputs
    this._pendingInputs = this._pendingInputs.filter(i => i.seq > serverSeq);
  }

  getPendingInputs() {
    return this._pendingInputs;
  }

  getSequence() {
    return this.seq;
  }
}
