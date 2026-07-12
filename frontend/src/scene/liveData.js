export function connectLiveData({ apiBaseUrl, onEvent, onConnectionChange }) {
  const socket = io(apiBaseUrl, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[liveData] Connected to backend');
    onConnectionChange?.(true);
  });

  socket.on('disconnect', () => {
    console.log('[liveData] Disconnected from backend');
    onConnectionChange?.(false);
  });

  socket.on('connect_error', (err) => {
    console.warn('[liveData] Connection error:', err.message);
    onConnectionChange?.(false);
  });

  socket.on('telemetry_processed', (payload) => {
    onEvent(payload);
  });

  return socket;
}
