const express = require('express');
const classController = require('../controllers/class.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Create class/course (staff or admin)
router.post('/', auth(['staff', 'admin']), classController.createClass);

// List/search classes (staff or admin)
router.get('/', auth(['staff', 'admin']), classController.getClasses);

// Get class details (staff or admin)
router.get('/:id', auth(['staff', 'admin']), classController.getClassById);

// Update class (staff or admin)
router.put('/:id', auth(['staff', 'admin']), classController.updateClass);

// Delete class (admin only)
router.delete('/:id', auth(['admin']), classController.deleteClass);

module.exports = router;
