// server/models/Payment.js
const mongoose = require('mongoose');
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
});
module.exports = mongoose.model('Payment', PaymentSchema);