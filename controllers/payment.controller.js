const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');

// Record payment (income/expense)
exports.createPayment = async (req, res) => {
  try {
    const payment = new Payment({ ...req.body, date: req.body.date ? new Date(req.body.date) : new Date() });
    await payment.save();
    // Attempt to update related entities' payment status
    try {
      if (payment.type === 'income') {
        // Booking payment status
        if (payment.bookingId) {
          const [sum] = await Payment.aggregate([
            { $match: { bookingId: payment.bookingId, type: 'income' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]);
          const totalPaid = sum?.total || 0;
          const booking = await Booking.findById(payment.bookingId);
          if (booking) {
            let newStatus = 'unpaid';
            if (typeof booking.totalFee === 'number' && booking.totalFee > 0) {
              newStatus = totalPaid >= booking.totalFee ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');
            } else {
              newStatus = totalPaid > 0 ? 'partial' : 'unpaid';
            }
            if (booking.paymentStatus !== newStatus) {
              booking.paymentStatus = newStatus;
              await booking.save();
            }
          }
        }
        // Enrollment payment status based on Class.fee
        if (payment.enrollmentId) {
          const enrollment = await Enrollment.findById(payment.enrollmentId);
          if (enrollment) {
            const [sum] = await Payment.aggregate([
              { $match: { enrollmentId: payment.enrollmentId, type: 'income' } },
              { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            const totalPaid = sum?.total || 0;
            let fee = 0;
            if (enrollment.classId) {
              const cls = await Class.findById(enrollment.classId);
              fee = cls?.fee || 0;
            }
            const newStatus = fee > 0 ? (totalPaid >= fee ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid')) : (totalPaid > 0 ? 'partial' : 'unpaid');
            if (enrollment.paymentStatus !== newStatus) {
              enrollment.paymentStatus = newStatus;
              await enrollment.save();
            }
          }
        }
      }
    } catch (e) {
      console.warn('Post-payment status update failed:', e.message);
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: 'Error recording payment', error: error.message });
  }
};

// List/search payments
exports.getPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.bookingId) filter.bookingId = req.query.bookingId;
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.enrollmentId) filter.enrollmentId = req.query.enrollmentId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.startDate && req.query.endDate) {
      filter.date = { $gte: new Date(req.query.startDate), $lte: new Date(req.query.endDate) };
    }
    const payments = await Payment.find(filter)
      .populate('clientId')
      .populate('bookingId')
      .populate('classId')
      .populate('enrollmentId');
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payments', error: error.message });
  }
};

// Get payment details
exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('clientId')
      .populate('bookingId')
      .populate('classId')
      .populate('enrollmentId');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment', error: error.message });
  }
};

// Update payment record
exports.updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(400).json({ message: 'Error updating payment', error: error.message });
  }
};

// Delete payment (admin only)
exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting payment', error: error.message });
  }
};
