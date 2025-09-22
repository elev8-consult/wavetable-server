// server/models/Payment.js
const mongoose = require('mongoose');
const { SERVICE_CODES } = require('../config/services');

const PRICE_CURRENCY_DEFAULT = process.env.BOOKING_DEFAULT_CURRENCY || 'USD';

const PaymentSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  date: Date,
  amount: Number,
  type: { type: String, enum: ['income', 'expense'], required: true },
  method: String,
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' },
  description: String,
  serviceCode: { type: String, enum: SERVICE_CODES },
  serviceType: { type: String, enum: ['equipment', 'room', 'class', 'service'] },
  priceCurrency: { type: String, default: PRICE_CURRENCY_DEFAULT },
});

module.exports = mongoose.model('Payment', PaymentSchema);
