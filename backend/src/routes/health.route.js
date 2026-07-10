// Routes stay thin — just map method+path to a controller function.
const express = require('express');
const router = express.Router();
const { getHealth } = require('../controllers/health.controller');

router.get('/', getHealth);

module.exports = router;