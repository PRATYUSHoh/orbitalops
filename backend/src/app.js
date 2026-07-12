// Express app CONFIGURATION only — no app.listen() here.
// Why separate from index.js? So tests/health.test.js can require this
// file and hit it with supertest WITHOUT actually binding a real port.
const express = require('express');
const morgan = require('morgan');
const healthRoute = require('./routes/health.route');
const telemetryRoute = require('./routes/telemetry.route');
const satelliteRoute = require('./routes/satellite.route');
const jobRoute = require('./routes/job.route');
const alertRoute = require('./routes/alert.route');
const errorHandler = require('./middleware/errorHandler');
const { register } = require('./middleware/metrics');

const app = express();

// Middleware FIRST — must run before any route handles a request
app.use(morgan('dev'));       // logs every request — method, path, status, response time
app.use(express.json());      // parses JSON request bodies into req.body

// Routes
app.use('/health', healthRoute);
app.use('/api/telemetry', telemetryRoute);
app.use('/api/satellites', satelliteRoute);
app.use('/api/jobs', jobRoute);
app.use('/api/alerts', alertRoute);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Error handler MUST be last — after all routes are registered
app.use(errorHandler);

module.exports = app;