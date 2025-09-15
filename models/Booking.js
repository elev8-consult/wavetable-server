// server/models/Booking.js
const mongoose = require('mongoose');
const BookingSchema = new mongoose.Schema({
  serviceType: { type: String, enum: ['equipment', 'room', 'class'], required: true },
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
  totalFee: Number,
  // Google Calendar integration
  googleEventId: { type: String },
  googleCalendarId: { type: String },
});
module.exports = mongoose.model('Booking', BookingSchema);
