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
    // Packet-loss estimation: an input not confirmed by the server within
    // LOSS_TIMEOUT is treated as lost/unconfirmed. We track a rolling window
    // of sent inputs and how many of them timed out.
    this._lossTimeout = 1000; // ms — ~20 ticks at 20Hz
    this._lossWindow = []; // { seq, ts, lost }
    this._lossWindowMax = 100; // track the last 100 inputs (~5s)
  }

  update(keys, orbitYaw, orbitPitch) {
    this.keys = { ...keys };
    this.orbitYaw = orbitYaw;
    this.orbitPitch = orbitPitch;
  }

  _recordSent(seq) {
    this._lossWindow.push({ seq, ts: performance.now(), lost: false });
    if (this._lossWindow.length > this._lossWindowMax) {
      this._lossWindow.shift();
    }
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
    this._recordSent(input.seq);
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
    this._recordSent(msg.seq);
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
    this._recordSent(msg.seq);
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
    this._recordSent(msg.seq);
    this.ws.send(msg);
  }

  confirmInput(serverSeq) {
    // Remove all confirmed inputs
    this._pendingInputs = this._pendingInputs.filter(i => i.seq > serverSeq);
    // Mark any tracked inputs at or below serverSeq as delivered
    for (const entry of this._lossWindow) {
      if (!entry.confirmed && entry.seq <= serverSeq) entry.confirmed = true;
    }
  }

  getPendingInputs() {
    return this._pendingInputs;
  }

  // Returns an estimated packet-loss ratio in [0, 1] over the rolling window.
  // An input is "lost" if it has neither been confirmed by the server nor is
  // still pending, and the LOSS_TIMEOUT has elapsed since it was sent.
  getPacketLoss() {
    const now = performance.now();
    let lost = 0;
    let total = 0;
    for (const entry of this._lossWindow) {
      total++;
      if (entry.confirmed) continue;
      const age = now - entry.ts;
      if (age > this._lossTimeout) {
        entry.lost = true;
        lost++;
      }
    }
    return total > 0 ? lost / total : 0;
  }

  getSequence() {
    return this.seq;
  }
}
