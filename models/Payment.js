// server/models/Payment.js
const mongoose = require('mongoose');
const { SERVICE_CODES } = require('../config/services');

const PRICE_CURRENCY_DEFAULT = (process.env.BOOKING_DEFAULT_CURRENCY || 'USD').toUpperCase();

const PaymentSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  date: { type: Date, default: () => new Date() },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  method: String,
  description: String,
  serviceCode: { type: String, enum: SERVICE_CODES },
  serviceType: { type: String, enum: ['equipment', 'room', 'class', 'service'] },
  priceCurrency: { type: String, default: PRICE_CURRENCY_DEFAULT },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
