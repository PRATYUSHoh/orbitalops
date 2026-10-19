const path = require('path');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const healthRoute = require('./routes/health.route');
const telemetryRoute = require('./routes/telemetry.route');
const satelliteRoute = require('./routes/satellite.route');
const jobRoute = require('./routes/job.route');
const alertRoute = require('./routes/alert.route');
const errorHandler = require('./middleware/errorHandler');
const { register } = require('./middleware/metrics');

const app = express();

// Enable CORS for all origins in AI Studio iframe environment
app.use(cors());

// Middleware FIRST
app.use(morgan('dev'));
app.use(express.json());

// API Routes
app.use('/health', healthRoute);
app.use('/api/telemetry', telemetryRoute);
app.use('/api/satellites', satelliteRoute);
app.use('/api/jobs', jobRoute);
app.use('/api/alerts', alertRoute);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Static frontend serving
const localDistPath = path.resolve(__dirname, '../dist');
const rootDistPath = path.resolve(__dirname, '../../dist');
const distPath = fs.existsSync(localDistPath) ? localDistPath : rootDistPath;
const frontendPath = path.resolve(__dirname, '../../frontend');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// SPA catch-all fallback
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/metrics') ||
    req.path.startsWith('/socket.io')
  ) {
    return next();
  }

  const distIndex = path.join(distPath, 'index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }

  const frontendIndex = path.join(frontendPath, 'index.html');
  if (fs.existsSync(frontendIndex)) {
    return res.sendFile(frontendIndex);
  }

  next();
});

// Error handler MUST be last
app.use(errorHandler);

module.exports = app;