const express = require('express');
const clientController = require('../controllers/client.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Create client (staff or admin)
router.post('/', auth(['staff', 'admin']), clientController.createClient);

// List/search all clients (staff or admin)
router.get('/', auth(['staff', 'admin']), clientController.getClients);

// Get one client by ID (staff or admin)
router.get('/:id', auth(['staff', 'admin']), clientController.getClientById);

// Update client info (staff or admin)
router.put('/:id', auth(['staff', 'admin']), clientController.updateClient);

// Delete client (admin only)
router.delete('/:id', auth(['admin']), clientController.deleteClient);

module.exports = router;
