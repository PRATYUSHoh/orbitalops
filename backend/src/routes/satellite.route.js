const express = require('express');
const router = express.Router();
const { getSatelliteHealth } = require('../controllers/satellite.controller');

router.get('/:id/health', getSatelliteHealth);

module.exports = router;