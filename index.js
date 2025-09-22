require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import routes
const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/client.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const roomRoutes = require('./routes/room.routes');
const bookingRoutes = require('./routes/booking.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const paymentRoutes = require('./routes/payment.routes');
const calendarRoutes = require('./routes/calendar.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

// CORS must be the very first middleware
// Allow configuring allowed origins via CORS_ORIGINS env (comma-separated).
// Default to localhost:3000 for the React dev server.
if (process.env.NODE_ENV === 'production') {
  const allowedOrigins = (process.env.CORS_ORIGINS && process.env.CORS_ORIGINS.split(',').map(o => o.trim())) || ['https://your-production-domain.com'];
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      return callback(new Error('CORS policy: Origin not allowed'));
    },
    credentials: true,
    optionsSuccessStatus: 204
  }));
} else {
  // Development: allow any origin to simplify local testing (browser preflight included).
  app.use(cors({ origin: true, credentials: true, optionsSuccessStatus: 204 }));
}

// Middleware
app.use(express.json());
app.use(helmet());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
