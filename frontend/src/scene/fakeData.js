import { setDotStatus } from './satellites.js';

/**
 * WEEK 0 PLACEHOLDER ONLY.
 * Randomly flashes a satellite dot to "anomaly" then back to "normal" every
 * 1-2s, purely so the globe looks alive before the real backend + WebSocket
 * pipeline exists. This whole file is throwaway — it gets deleted in Week 5
 * when real `telemetry_processed` events drive the dots instead.
 */
export function startFakeActivity(dotsById) {
  const ids = Array.from(dotsById.keys());
  let timer = null;

  function tick() {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const dot = dotsById.get(id);
    if (dot) {
      setDotStatus(dot, 'anomaly');
      setTimeout(() => setDotStatus(dot, 'normal'), 400);
    }
    const nextDelay = 1000 + Math.random() * 1000; // 1-2s
    timer = setTimeout(tick, nextDelay);
  }

  tick();

  // Return a stop function so main.js can clean up if needed (e.g. hot reload)
  return () => clearTimeout(timer);
}
