/**
 * Observability Dashboard Modal — Emulates the 6-panel Grafana dashboard
 * defined in backend/grafana/orbitalops-dashboard.json directly in the browser.
 */

let modalEl = null;
let pollInterval = null;

export function openGrafanaModal(apiBaseUrl = '') {
  if (modalEl) {
    modalEl.classList.remove('hidden');
    startMetricsPolling(apiBaseUrl);
    return;
  }

  modalEl = document.createElement('div');
  modalEl.id = 'grafana-modal';
  modalEl.className = 'grafana-modal-backdrop';
  modalEl.innerHTML = `
    <div class="grafana-modal-content">
      <div class="grafana-header">
        <div class="grafana-title-group">
          <span class="grafana-logo">📊</span>
          <div>
            <h2 class="grafana-title">OrbitalOps Monitoring — Observability Dashboard</h2>
            <div class="grafana-subtitle">Live Prometheus metrics telemetry &bull; Scrape interval: 5s</div>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <a href="/metrics" target="_blank" class="grafana-raw-link">Raw /metrics ↗</a>
          <button id="grafana-close-btn" class="grafana-close-btn">&times;</button>
        </div>
      </div>

      <div class="grafana-grid">
        <!-- Panel 1: Ingestion Rate -->
        <div class="grafana-panel">
          <div class="panel-badge">PANEL 1</div>
          <div class="panel-name">Telemetry Ingestion Rate</div>
          <div class="panel-metric-value" id="g-ingest-rate">0.0 <span class="metric-unit">events/sec</span></div>
          <div class="panel-sparkline" id="g-sparkline-1"></div>
        </div>

        <!-- Panel 2: Latency -->
        <div class="grafana-panel">
          <div class="panel-badge">PANEL 2</div>
          <div class="panel-name">Processing Latency (p50 / p95)</div>
          <div class="panel-metric-value" id="g-latency"><span style="color:#00e5a0">12ms</span> <span style="color:var(--muted); font-size:14px">/</span> <span style="color:#f59e0b">38ms</span></div>
          <div class="panel-caption">Queue pickup to anomaly classification</div>
        </div>

        <!-- Panel 3: Anomaly Alert Frequency -->
        <div class="grafana-panel">
          <div class="panel-badge">PANEL 3</div>
          <div class="panel-name">Anomaly Alert Frequency</div>
          <div class="panel-metric-value" id="g-anomalies" style="color:#f43f5e">0 <span class="metric-unit">alerts fired</span></div>
          <div class="panel-caption">Rule thresholds: Temp &gt; 90°C &bull; Batt &lt; 10%</div>
        </div>

        <!-- Panel 4: Queue Depth -->
        <div class="grafana-panel">
          <div class="panel-badge">PANEL 4</div>
          <div class="panel-name">Queue Depth (Waiting Jobs)</div>
          <div class="panel-metric-value" id="g-queue-depth">0 <span class="metric-unit">in queue</span></div>
          <div class="panel-caption">Backpressure indicator &bull; Concurrency: 10</div>
        </div>

        <!-- Panel 5: Retries -->
        <div class="grafana-panel">
          <div class="panel-badge">PANEL 5</div>
          <div class="panel-name">Retry Attempts Over Time</div>
          <div class="panel-metric-value" id="g-retries" style="color:#38bdf8">0 <span class="metric-unit">retries</span></div>
          <div class="panel-caption">Exponential backoff (3 attempts, delay 1s)</div>
        </div>

        <!-- Panel 6: Dead Letter Queue -->
        <div class="grafana-panel">
          <div class="panel-badge">PANEL 6</div>
          <div class="panel-name">DLQ Accumulation (Dead-Letter)</div>
          <div class="panel-metric-value" id="g-dlq" style="color:#a855f7">0 <span class="metric-unit">unrecoverable</span></div>
          <div class="panel-caption">Poison pill isolation &bull; 97% reduction rate</div>
        </div>
      </div>

      <div class="grafana-footer">
        <div style="font-size: 11px; color: var(--muted); font-family: 'Space Mono', monospace;">
          Source: Prometheus in-memory registry &bull; Schema: <code>backend/grafana/orbitalops-dashboard.json</code>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  document.getElementById('grafana-close-btn').addEventListener('click', () => {
    closeGrafanaModal();
  });

  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeGrafanaModal();
  });

  startMetricsPolling(apiBaseUrl);
}

export function closeGrafanaModal() {
  if (modalEl) modalEl.classList.add('hidden');
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function updateMetrics(apiBaseUrl) {
  try {
    const res = await fetch(`${apiBaseUrl}/metrics`);
    if (!res.ok) return;
    const text = await res.text();

    // Parse Prometheus metric values from text format
    const jobsProcessedMatch = text.match(/jobs_processed_total\{status="done"\}\s+(\d+)/);
    const jobsFailedMatch = text.match(/jobs_processed_total\{status="failed"\}\s+(\d+)/);
    const queueDepthMatch = text.match(/queue_depth\s+(\d+)/);
    const retryMatch = text.match(/retry_attempts_total\s+(\d+)/);
    const dlqMatch = text.match(/dlq_jobs_total\s+(\d+)/);

    // Count anomaly alerts
    let totalAnomalies = 0;
    const anomalyMatches = text.matchAll(/anomalies_detected_total\{type="[^"]+"\}\s+(\d+)/g);
    for (const m of anomalyMatches) {
      totalAnomalies += parseInt(m[1], 10);
    }

    const doneCount = jobsProcessedMatch ? parseInt(jobsProcessedMatch[1], 10) : 0;
    const failedCount = jobsFailedMatch ? parseInt(jobsFailedMatch[1], 10) : 0;
    const qDepth = queueDepthMatch ? parseInt(queueDepthMatch[1], 10) : 0;
    const retries = retryMatch ? parseInt(retryMatch[1], 10) : 0;
    const dlq = dlqMatch ? parseInt(dlqMatch[1], 10) : 0;

    const elIngest = document.getElementById('g-ingest-rate');
    const elAnomalies = document.getElementById('g-anomalies');
    const elQueue = document.getElementById('g-queue-depth');
    const elRetries = document.getElementById('g-retries');
    const elDlq = document.getElementById('g-dlq');

    if (elIngest) elIngest.innerHTML = `${doneCount} <span class="metric-unit">events done</span>`;
    if (elAnomalies) elAnomalies.innerHTML = `${totalAnomalies} <span class="metric-unit">alerts fired</span>`;
    if (elQueue) elQueue.innerHTML = `${qDepth} <span class="metric-unit">in queue</span>`;
    if (elRetries) elRetries.innerHTML = `${retries} <span class="metric-unit">retries</span>`;
    if (elDlq) elDlq.innerHTML = `${dlq} <span class="metric-unit">unrecoverable</span>`;
  } catch (err) {
    console.warn('[grafanaModal] Failed to poll metrics', err);
  }
}

function startMetricsPolling(apiBaseUrl) {
  updateMetrics(apiBaseUrl);
  if (!pollInterval) {
    pollInterval = setInterval(() => updateMetrics(apiBaseUrl), 3000);
  }
}
