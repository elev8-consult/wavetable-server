// server/models/Booking.js
const mongoose = require('mongoose');
const { SERVICE_CODES } = require('../config/services');

const PRICE_CURRENCY_DEFAULT = process.env.BOOKING_DEFAULT_CURRENCY || 'USD';

const BookingSchema = new mongoose.Schema({
  serviceType: {
    type: String,
    enum: ['equipment', 'room', 'class', 'service'],
    required: true,
  },
  serviceCode: { type: String, enum: SERVICE_CODES },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment' },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  startDate: Date,
  endDate: Date,
  returned: Boolean,
  status: { type: String, enum: ['scheduled', 'completed', 'canceled'], default: 'scheduled' },
  paymentStatus: { type: String, enum: ['paid', 'unpaid', 'partial'], default: 'unpaid' },
  fullPrice: Number,
  discountedPrice: Number,
  priceCurrency: { type: String, default: PRICE_CURRENCY_DEFAULT },
  priceNotes: String,
  addOns: [{
    name: String,
    amount: Number,
  }],
  totalFee: Number,
  // Google Calendar integration
  googleEventId: { type: String },
  googleCalendarId: { type: String },
});

BookingSchema.pre('validate', function applyPricingValidation(next) {
  if (typeof this.discountedPrice === 'number' && typeof this.fullPrice === 'number') {
    if (this.discountedPrice > this.fullPrice) {
      this.invalidate('discountedPrice', 'Discounted price cannot exceed full price');
    }
  }
  if (!this.priceCurrency) this.priceCurrency = PRICE_CURRENCY_DEFAULT;
  next();
});

BookingSchema.pre('save', function syncTotalFee(next) {
  if (typeof this.discountedPrice === 'number') {
    this.totalFee = this.discountedPrice;
  } else if (typeof this.fullPrice === 'number') {
    this.totalFee = this.fullPrice;
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
