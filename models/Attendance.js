// server/models/Attendance.js
const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  sessionDate: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'present', 'absent', 'cancelled'], default: 'scheduled' },
  notes: { type: String }
}, { timestamps: true });

AttendanceSchema.index({ bookingId: 1, clientId: 1 }, { unique: true });
AttendanceSchema.index({ sessionDate: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
