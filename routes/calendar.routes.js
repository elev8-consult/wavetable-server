const express = require('express');
const calendarController = require('../controllers/calendar.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Fetch Google Calendar events (staff or admin)
router.get('/events', auth(['staff', 'admin']), calendarController.getEvents);

// Manually trigger sync (staff or admin)
router.post('/sync', auth(['staff', 'admin']), calendarController.syncCalendar);

module.exports = router;
