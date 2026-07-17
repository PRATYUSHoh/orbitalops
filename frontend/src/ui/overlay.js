/**
 * Builds the HUD overlay: title, live satellite count, and the
 * normal/anomaly legend. Pure DOM — no three.js dependency, so this can be
 * restyled or moved to a framework later without touching the scene code.
 */
export function renderOverlay(hudEl, { satelliteCount }) {
  hudEl.innerHTML = `
    <div class="hud-top">
      <div class="hud-title">Orbital<span>Ops</span></div>
      <div class="hud-sub">SATELLITE EVENT PROCESSING — LIVE VIEW</div>
      <div class="hud-count" style="margin-top:14px">
        <b id="hud-sat-count">${satelliteCount}</b> satellites tracked
      </div>
    </div>
    <div class="hud-bottom" style="display:flex;justify-content:space-between;align-items:flex-end">
      <div class="hud-legend">
        <span class="legend-item"><span class="legend-dot normal"></span>normal</span>
        <span class="legend-item"><span class="legend-dot anomaly"></span>anomaly</span>
      </div>
    </div>
  `;
}
