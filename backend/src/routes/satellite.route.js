const express = require('express');
const router = express.Router();
const { getSatelliteHealth, listSatellites } = require('../controllers/satellite.controller');

router.get('/', listSatellites);
router.get('/:id/health', getSatelliteHealth);

module.exports = router;