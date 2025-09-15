// server/models/Room.js
const mongoose = require('mongoose');
const RoomSchema = new mongoose.Schema({
  name: String,
  type: String,
  hourlyRate: Number,
  capacity: Number,
});
module.exports = mongoose.model('Room', RoomSchema);