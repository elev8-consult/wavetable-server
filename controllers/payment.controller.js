const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const { getServiceCategory } = require('../config/services');

const PRICE_CURRENCY_DEFAULT = (process.env.BOOKING_DEFAULT_CURRENCY || 'USD').toUpperCase();

// Record payment (income/expense)
exports.createPayment = async (req, res) => {
  try {
    const payload = { ...(req.body || {}) };
    payload.date = payload.date ? new Date(payload.date) : new Date();

    if (payload.amount === undefined || payload.amount === null || payload.amount === '') {
      return res.status(400).json({ message: 'amount is required' });
    }
    const amount = Number(payload.amount);
    if (Number.isNaN(amount)) {
      return res.status(400).json({ message: 'amount must be a valid number' });
    }
    payload.amount = amount;

    if (payload.priceCurrency) {
      payload.priceCurrency = String(payload.priceCurrency).trim().toUpperCase();
    }

    let relatedBooking = null;
    if (payload.bookingId) {
      relatedBooking = await Booking.findById(payload.bookingId);
      if (relatedBooking) {
        if (!payload.clientId && relatedBooking.clientId) payload.clientId = relatedBooking.clientId;
        if (!payload.serviceCode && relatedBooking.serviceCode) payload.serviceCode = relatedBooking.serviceCode;
        if (!payload.serviceType && relatedBooking.serviceType) payload.serviceType = relatedBooking.serviceType;
        if (!payload.priceCurrency && relatedBooking.priceCurrency) payload.priceCurrency = relatedBooking.priceCurrency;
      }
    }

    if (payload.serviceCode && !payload.serviceType) {
      payload.serviceType = getServiceCategory(payload.serviceCode) || payload.serviceType;
    } else if (!payload.serviceCode && relatedBooking?.serviceCode) {
      payload.serviceCode = relatedBooking.serviceCode;
    }

    payload.priceCurrency = (payload.priceCurrency || PRICE_CURRENCY_DEFAULT).toUpperCase();

    const payment = new Payment(payload);
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
    if (req.query.serviceCode) filter.serviceCode = req.query.serviceCode;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.currency) filter.priceCurrency = req.query.currency.toUpperCase();
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
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const payload = req.body || {};

    if (payload.type) payment.type = payload.type;
    if (payload.amount !== undefined) {
      const amount = Number(payload.amount);
      if (Number.isNaN(amount)) {
        return res.status(400).json({ message: 'amount must be a valid number' });
      }
      payment.amount = amount;
    }
    if (payload.method !== undefined) payment.method = payload.method;
    if (payload.description !== undefined) payment.description = payload.description;
    if (payload.date !== undefined) payment.date = payload.date ? new Date(payload.date) : payment.date;
    if (payload.clientId !== undefined) payment.clientId = payload.clientId || undefined;

    let relatedBooking = null;
    if (payload.bookingId !== undefined) {
      payment.bookingId = payload.bookingId || undefined;
      if (payload.bookingId) {
        relatedBooking = await Booking.findById(payload.bookingId);
        if (relatedBooking) {
          if (!payment.clientId && relatedBooking.clientId) payment.clientId = relatedBooking.clientId;
          if (!payload.serviceCode && relatedBooking.serviceCode) payment.serviceCode = relatedBooking.serviceCode;
          if (!payload.serviceType && relatedBooking.serviceType) payment.serviceType = relatedBooking.serviceType;
          if (!payload.priceCurrency && relatedBooking.priceCurrency) payment.priceCurrency = relatedBooking.priceCurrency;
        }
      }
    }

    if (payload.serviceCode !== undefined) {
      payment.serviceCode = payload.serviceCode || undefined;
    }

    if (payload.serviceType !== undefined) {
      payment.serviceType = payload.serviceType || undefined;
    }

    if (payment.serviceCode && (payload.serviceCode !== undefined || !payment.serviceType)) {
      const derived = getServiceCategory(payment.serviceCode);
      if (derived) payment.serviceType = derived;
    }

    if (!payment.serviceCode && relatedBooking?.serviceCode) {
      payment.serviceCode = relatedBooking.serviceCode;
      if (!payment.serviceType) payment.serviceType = relatedBooking.serviceType;
    }

    if (payload.priceCurrency !== undefined) {
      payment.priceCurrency = payload.priceCurrency ? String(payload.priceCurrency).trim().toUpperCase() : PRICE_CURRENCY_DEFAULT;
    } else if (!payment.priceCurrency) {
      payment.priceCurrency = PRICE_CURRENCY_DEFAULT;
    }

    await payment.save();
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
