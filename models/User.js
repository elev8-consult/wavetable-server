// server/models/User.js
const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' }
});
module.exports = mongoose.model('User', UserSchema);