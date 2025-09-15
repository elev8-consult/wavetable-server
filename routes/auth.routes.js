const express = require('express');
const { register, login, getCurrentUser, logout } = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

const router = express.Router();

// Register a new staff/admin user
router.post('/register', register);

// Login user
router.post('/login', login);

// Get current user info (protected route)
router.get('/me', auth, getCurrentUser);

// Logout user
router.post('/logout', auth, logout);

module.exports = router;
