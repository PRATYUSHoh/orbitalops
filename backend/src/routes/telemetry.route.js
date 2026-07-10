const express = require('express');
const router = express.Router();
const { createTelemetry } = require('../controllers/telemetry.controller');

router.post('/', createTelemetry);

module.exports = router;