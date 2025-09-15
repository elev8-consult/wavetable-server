const express = require('express');
const bookingController = require('../controllers/booking.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Create new booking (staff or admin)
router.post('/', auth(['staff', 'admin']), bookingController.createBooking);

// Check availability
router.get('/availability', auth(['staff', 'admin']), bookingController.checkAvailability);

// List/search all bookings (staff or admin)
router.get('/', auth(['staff', 'admin']), bookingController.getBookings);

// Get booking details (staff or admin)
router.get('/:id', auth(['staff', 'admin']), bookingController.getBookingById);

// Update booking (staff or admin)
router.put('/:id', auth(['staff', 'admin']), bookingController.updateBooking);

// Delete/cancel booking (staff or admin)
router.delete('/:id', auth(['staff', 'admin']), bookingController.deleteBooking);

// Mark equipment as returned (staff or admin)
router.post('/:id/return', auth(['staff', 'admin']), bookingController.returnEquipment);

module.exports = router;
