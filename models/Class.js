// server/models/Class.js
const mongoose = require('mongoose');
const ClassSchema = new mongoose.Schema({
  name: String,
  description: String,
  instructor: String,
  schedule: [Date], // array of session datetimes
  sessionLength: Number, // minutes
  capacity: Number,
  fee: Number,
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
});
module.exports = mongoose.model('Class', ClassSchema);
