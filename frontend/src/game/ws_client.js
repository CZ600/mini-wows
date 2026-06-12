import { encode, decode } from '@msgpack/msgpack';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class WSClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.onMessage = null;
    this.onDisconnect = null;
    this.onConnect = null;
    this._reconnectAttempts = 0;
    this._token = null;
    this._messageQueue = [];
  }

  connect(token) {
    this._token = token;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      // Flush queued messages
      while (this._messageQueue.length > 0) {
        this._send(this._messageQueue.shift());
      }
      if (this.onConnect) this.onConnect();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = decode(new Uint8Array(event.data));
        if (this.onMessage) this.onMessage(msg);
      } catch (e) {
        console.error('WS decode error:', e);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
      if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this._reconnectAttempts++;
        setTimeout(() => this.connect(this._token), RECONNECT_DELAY);
      }
    };

    this.ws.onerror = () => {
      // onclose will handle reconnection
    };
  }

  send(msg) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this._send(msg);
    } else {
      this._messageQueue.push(msg);
    }
  }

  _send(msg) {
    try {
      this.ws.send(encode(msg));
    } catch (e) {
      console.error('WS send error:', e);
    }
  }

  disconnect() {
    this._reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
