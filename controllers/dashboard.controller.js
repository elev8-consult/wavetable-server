const Client = require('../models/Client');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Class = require('../models/Class');

exports.getSummary = async (req, res) => {
  try {
    const [totalClients, totalBookings, totalClasses, totalIncome, totalOutstanding] = await Promise.all([
      Client.countDocuments(),
      Booking.countDocuments(),
      Class.countDocuments(),
      Payment.aggregate([
        { $match: { type: 'income' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { type: 'income', description: /outstanding/i } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.json({
      totalClients,
      totalBookings,
      totalClasses,
      totalIncome: totalIncome[0]?.total || 0,
      totalOutstanding: totalOutstanding[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard summary', error: error.message });
  }
};
