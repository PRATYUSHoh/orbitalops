// Express app CONFIGURATION only — no app.listen() here.
// Why separate from index.js? So tests/health.test.js can require this
// file and hit it with supertest WITHOUT actually binding a real port.
const express = require('express');
const morgan = require('morgan');
const healthRoute = require('./routes/health.route');
const errorHandler = require('./middleware/errorHandler');
const telemetryRoute = require('./routes/telemetry.route');

const app = express();

app.use(morgan('dev'));       // logs every request to console — method, path, status, response time
app.use(express.json());      // parses JSON request bodies into req.body

app.use('/health', healthRoute);

app.use('/api/telemetry', telemetryRoute);
app.use(errorHandler);        // must be last — after all routes are registered

module.exports = app;