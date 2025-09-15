// server/models/Enrollment.js
const mongoose = require('mongoose');
const EnrollmentSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  enrolledOn: Date,
  paymentStatus: { type: String, enum: ['paid', 'unpaid', 'partial'], default: 'unpaid' },
  feedback: String,
});
module.exports = mongoose.model('Enrollment', EnrollmentSchema);