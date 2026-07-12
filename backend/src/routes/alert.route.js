const express = require('express');
const router = express.Router();
const { getAlerts } = require('../controllers/alert.controller');

router.get('/', getAlerts);

module.exports = router;