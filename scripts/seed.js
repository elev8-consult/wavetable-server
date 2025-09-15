const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('../models/User');

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/studio-management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB for seeding');

  const existing = await User.findOne({ username: 'admin' });
  if (existing) {
    console.log('Admin user already exists:', existing.username);
    process.exit(0);
  }

  const password = process.env.SEED_ADMIN_PASSWORD || 'password123';
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);

  const user = new User({ username: 'admin', password: hashed, role: 'admin' });
  await user.save();
  console.log('Created admin user: admin (password:', password + ')');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding error', err);
  process.exit(1);
});
