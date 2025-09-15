// server/models/Client.js
const mongoose = require('mongoose');
const ClientSchema = new mongoose.Schema({
  type: { type: String, enum: ['individual', 'company', 'student'], required: true },
  name: String,
  email: String,
  phone: String,
  age: Number,
  companyName: String,
  contactPerson: String,
  notes: String,
});
module.exports = mongoose.model('Client', ClientSchema);