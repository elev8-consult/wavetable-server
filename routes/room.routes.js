const express = require('express');
const roomController = require('../controllers/room.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Add room (staff or admin)
router.post('/', auth(['staff', 'admin']), roomController.addRoom);

// List/search rooms (staff or admin)
router.get('/', auth(['staff', 'admin']), roomController.getRooms);

// Get room by ID (staff or admin)
router.get('/:id', auth(['staff', 'admin']), roomController.getRoomById);

// Update room info (staff or admin)
router.put('/:id', auth(['staff', 'admin']), roomController.updateRoom);

// Delete room (admin only)
router.delete('/:id', auth(['admin']), roomController.deleteRoom);

module.exports = router;
