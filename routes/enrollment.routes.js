const express = require('express');
const enrollmentController = require('../controllers/enrollment.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Enroll student in class (staff or admin)
router.post('/', auth(['staff', 'admin']), enrollmentController.createEnrollment);

// List all enrollments (staff or admin)
router.get('/', auth(['staff', 'admin']), enrollmentController.getEnrollments);

// Get enrollment details (staff or admin)
router.get('/:id', auth(['staff', 'admin']), enrollmentController.getEnrollmentById);

// Update enrollment (staff or admin)
router.put('/:id', auth(['staff', 'admin']), enrollmentController.updateEnrollment);

// Remove enrollment (staff or admin)
router.delete('/:id', auth(['staff', 'admin']), enrollmentController.deleteEnrollment);

module.exports = router;
