// server/models/Attendance.js
const mongoose = require('mongoose');
const AttendanceSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  sessionDate: { type: Date, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  status: { type: String, enum: ['present', 'absent'], default: 'absent' },
}, { timestamps: true });

// prevent duplicate attendance rows for same class/session/student
AttendanceSchema.index({ classId: 1, sessionDate: 1, studentId: 1 }, { unique: true, partialFilterExpression: { classId: { $exists: true } } });
AttendanceSchema.index({ bookingId: 1 });
// Prevent duplicate attendance rows for the same booking/session/student
AttendanceSchema.index({ bookingId: 1, sessionDate: 1, studentId: 1 }, { unique: true, partialFilterExpression: { bookingId: { $exists: true } } });

module.exports = mongoose.model('Attendance', AttendanceSchema);