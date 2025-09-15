const express = require('express');
const paymentController = require('../controllers/payment.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Record payment (income/expense) (staff or admin)
router.post('/', auth(['staff', 'admin']), paymentController.createPayment);

// List/search payments (staff or admin)
router.get('/', auth(['staff', 'admin']), paymentController.getPayments);

// Get payment details (staff or admin)
router.get('/:id', auth(['staff', 'admin']), paymentController.getPaymentById);

// Update payment record (staff or admin)
router.put('/:id', auth(['staff', 'admin']), paymentController.updatePayment);

// Delete payment (admin only)
router.delete('/:id', auth(['admin']), paymentController.deletePayment);

module.exports = router;
