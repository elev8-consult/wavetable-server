const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Get dashboard data (totals, income, outstanding, bookings count, etc.)
router.get('/summary', auth(['staff', 'admin']), dashboardController.getSummary);

module.exports = router;
