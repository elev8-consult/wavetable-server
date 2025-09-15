// server/models/Equipment.js
const mongoose = require('mongoose');
const EquipmentSchema = new mongoose.Schema({
  name: String,
  type: String,
  status: { type: String, enum: ['available', 'out', 'maintenance'], default: 'available' },
  specs: mongoose.Schema.Types.Mixed,
  purchaseDate: Date,
});
module.exports = mongoose.model('Equipment', EquipmentSchema);