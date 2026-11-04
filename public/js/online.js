/**
 * Boc Socket.IO client: tai script on-demand (de che do offline khong bao loi),
 * gui/nhan su kien dung ten voi server, ho tro rejoin sau khi rot mang.
 */

let libPromise = null;

function loadSocketLib() {
  if (window.io) return Promise.resolve(window.io);
  if (libPromise) return libPromise;

  libPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('socket.io/socket.io.js', document.baseURI).href;
    script.async = true;
    script.onload = () => {
      if (window.io) resolve(window.io);
      else reject(new Error('socket.io-unavailable'));
    };
    script.onerror = () => {
      libPromise = null;
      reject(new Error('socket.io-unavailable'));
    };
    document.head.appendChild(script);
  });

  return libPromise;
}

function waitForConnect(socket, timeoutMs = 9000) {
  if (socket.connected) return Promise.resolve(socket);
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('connect-timeout'));
    }, timeoutMs);

    function onConnect() {
      if (done) return;
      done = true;
      cleanup();
      resolve(socket);
    }

    function onError(error) {
      if (done) return;
      done = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('connect-error'));
    }

    function cleanup() {
      window.clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

const FORWARDED_EVENTS = [
  'room:state',
  'game:over',
  'game:restart',
  'game:timeout',
  'emote:received',
  'room:opponent-disconnected',
  'room:opponent-reconnected',
  'room:closed',
  'room:replaced',
  'error:message',
];

export class OnlineClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.socket = null;
    this.connectPromise = null;
  }

  get connected() {
    return Boolean(this.socket?.connected);
  }

  async connect() {
    if (this.socket?.connected) return this.socket;

    if (this.socket) {
      await waitForConnect(this.socket);
      return this.socket;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.#createSocket().finally(() => {
        this.connectPromise = null;
      });
    }
    return this.connectPromise;
  }

  async #createSocket() {
    const io = await loadSocketLib();
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
      timeout: 8000,
    });
    this.socket = socket;
    this.#bind(socket);
    await waitForConnect(socket);
    return socket;
  }

  #bind(socket) {
    socket.on('connect', () => {
      this.handlers.onConnect?.();
    });
    socket.on('disconnect', (reason) => {
      this.handlers.onDisconnect?.(reason);
    });
    socket.on('connect_error', (error) => {
      this.handlers.onConnectError?.(error);
    });

    for (const event of FORWARDED_EVENTS) {
      socket.on(event, (payload) => {
        this.handlers.onEvent?.(event, payload);
      });
    }
  }

  #emitAck(event, payload) {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error('not-connected'));
    return new Promise((resolve, reject) => {
      socket.timeout(9000).emit(event, payload, (error, response) => {
        if (error) {
          reject(new Error('timeout'));
          return;
        }
        resolve(response);
      });
    });
  }

  createRoom(profile, size) {
    return this.#emitAck('room:create', {
      name: profile?.name || '',
      avatar: profile?.avatar || 'orange',
      size,
    });
  }

  joinRoom(roomId, profile) {
    return this.#emitAck('room:join', {
      roomId,
      name: profile?.name || '',
      avatar: profile?.avatar || 'orange',
    });
  }

  rejoin(roomId, playerKey) {
    return this.#emitAck('room:rejoin', { roomId, playerKey });
  }

  move(roomId, index) {
    return this.#emitAck('game:move', { roomId, index });
  }

  rematch(roomId) {
    return this.#emitAck('game:rematch', { roomId });
  }

  sendEmote(roomId, emote) {
    return this.#emitAck('emote:send', { roomId, emote });
  }

  leave(roomId) {
    return this.#emitAck('room:leave', { roomId });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
