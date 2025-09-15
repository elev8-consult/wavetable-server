const express = require('express');
const equipmentController = require('../controllers/equipment.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Add equipment (staff or admin)
router.post('/', auth(['staff', 'admin']), equipmentController.addEquipment);

// List/search equipment (staff or admin)
router.get('/', auth(['staff', 'admin']), equipmentController.getEquipment);

// Get equipment by ID (staff or admin)
router.get('/:id', auth(['staff', 'admin']), equipmentController.getEquipmentById);

// Update equipment info/status (staff or admin)
router.put('/:id', auth(['staff', 'admin']), equipmentController.updateEquipment);

// Delete equipment (admin only)
router.delete('/:id', auth(['admin']), equipmentController.deleteEquipment);

module.exports = router;
