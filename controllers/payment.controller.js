const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { getServiceCategory, findServiceByCode } = require('../config/services');

const PRICE_CURRENCY_DEFAULT = (process.env.BOOKING_DEFAULT_CURRENCY || 'USD').toUpperCase();

function normalizeCurrency(value) {
  return value ? String(value).trim().toUpperCase() : PRICE_CURRENCY_DEFAULT;
}

async function syncBookingPaymentStatus(bookingId) {
  if (!bookingId) return;
  const [sum] = await Payment.aggregate([
    { $match: { bookingId, type: 'income' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalPaid = sum?.total || 0;
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
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

    if (payload.bookingId) {
      const booking = await Booking.findById(payload.bookingId);
      if (booking) {
        if (!payload.clientId && booking.clientId) payload.clientId = booking.clientId;
        if (!payload.serviceCode && booking.serviceCode) payload.serviceCode = booking.serviceCode;
        if (!payload.serviceType && booking.serviceType) payload.serviceType = booking.serviceType;
        if (!payload.priceCurrency && booking.priceCurrency) payload.priceCurrency = booking.priceCurrency;
      }
    }

    if (payload.serviceCode && !payload.serviceType) {
      payload.serviceType = getServiceCategory(payload.serviceCode) || payload.serviceType;
    }
    payload.priceCurrency = normalizeCurrency(payload.priceCurrency);

    const payment = new Payment(payload);
    await payment.save();

    try {
      await syncBookingPaymentStatus(payment.bookingId);
    } catch (err) {
      console.warn('Post-payment booking status update failed:', err.message);
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: 'Error recording payment', error: error.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.bookingId) filter.bookingId = req.query.bookingId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.serviceCode) filter.serviceCode = req.query.serviceCode;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.currency) filter.priceCurrency = req.query.currency.toUpperCase();
    if (req.query.startDate && req.query.endDate) {
      filter.date = { $gte: new Date(req.query.startDate), $lte: new Date(req.query.endDate) };
    }
    const payments = await Payment.find(filter)
      .sort({ date: -1 })
      .populate('clientId')
      .populate('bookingId');
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payments', error: error.message });
  }
};

exports.getPaymentSummaries = async (req, res) => {
  try {
    const {
      clientId,
      serviceType,
      serviceCode,
      paymentStatus: paymentStatusFilterRaw,
      startDate: startDateRaw,
      endDate: endDateRaw,
      includeCanceled,
    } = req.query || {};

    const bookingFilter = {};
    if (clientId) bookingFilter.clientId = clientId;
    if (serviceType) bookingFilter.serviceType = serviceType;
    if (serviceCode) bookingFilter.serviceCode = serviceCode;

    const includeCanceledFlag = typeof includeCanceled === 'string'
      ? includeCanceled.toLowerCase() === 'true'
      : Boolean(includeCanceled);
    if (!includeCanceledFlag) {
      bookingFilter.status = { $ne: 'canceled' };
    }

    if (startDateRaw || endDateRaw) {
      const startDate = startDateRaw ? new Date(startDateRaw) : null;
      const endDate = endDateRaw ? new Date(endDateRaw) : null;
      const dateFilter = {};
      if (startDate && !Number.isNaN(startDate.getTime())) dateFilter.$gte = startDate;
      if (endDate && !Number.isNaN(endDate.getTime())) dateFilter.$lte = endDate;
      if (Object.keys(dateFilter).length) bookingFilter.startDate = dateFilter;
    }

    const bookings = await Booking.find(bookingFilter)
      .populate('clientId', 'name email phone')
      .populate('roomId', 'name')
      .populate('equipmentId', 'name')
      .populate('classId', 'name')
      .lean();

    const bookingIds = bookings.map(b => b._id).filter(Boolean);
    const payments = bookingIds.length
      ? await Payment.find({ bookingId: { $in: bookingIds } })
          .sort({ date: 1, createdAt: 1, _id: 1 })
          .lean()
      : [];

    const paymentsByBooking = new Map();
    for (const payment of payments) {
      if (!payment.bookingId) continue;
      const key = String(payment.bookingId);
      if (!paymentsByBooking.has(key)) paymentsByBooking.set(key, []);
      paymentsByBooking.get(key).push(payment);
    }

    const normalizeAmount = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      return Math.round(num * 100) / 100;
    };

    const deriveTotalFee = (booking) => {
      if (typeof booking.totalFee === 'number') return normalizeAmount(booking.totalFee);
      if (typeof booking.discountedPrice === 'number') return normalizeAmount(booking.discountedPrice);
      if (typeof booking.fullPrice === 'number') return normalizeAmount(booking.fullPrice);
      return 0;
    };

    const paymentStatusFilter = Array.isArray(paymentStatusFilterRaw)
      ? paymentStatusFilterRaw.map(s => String(s).toLowerCase())
      : typeof paymentStatusFilterRaw === 'string' && paymentStatusFilterRaw.trim()
        ? paymentStatusFilterRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : null;

    const summaries = bookings.map(booking => {
      const bookingKey = String(booking._id);
      const bookingPayments = paymentsByBooking.get(bookingKey) || [];
      const totals = bookingPayments.reduce((acc, payment) => {
        const amount = normalizeAmount(payment.amount);
        if (payment.type === 'income') acc.income += amount;
        else if (payment.type === 'expense') acc.expense += amount;
        return acc;
      }, { income: 0, expense: 0 });

      const totalPaid = normalizeAmount(totals.income - totals.expense);
      const totalFee = deriveTotalFee(booking);
      const balanceRaw = normalizeAmount(totalFee - totalPaid);
      const balanceDue = balanceRaw > 0 ? balanceRaw : 0;

      const EPSILON = 0.01;
      let paymentStatus = booking.paymentStatus || 'unpaid';
      if (totalFee > 0) {
        if (totalPaid + EPSILON >= totalFee) paymentStatus = 'paid';
        else if (totalPaid > 0) paymentStatus = 'partial';
        else paymentStatus = 'unpaid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      const serviceDef = findServiceByCode(booking.serviceCode);
      const currency = normalizeCurrency(booking.priceCurrency);
      const createdAt = typeof booking.createdAt === 'string' || booking.createdAt instanceof Date
        ? new Date(booking.createdAt)
        : booking._id?.getTimestamp?.() || null;

      return {
        bookingId: booking._id,
        bookingStartDate: booking.startDate || null,
        bookingEndDate: booking.endDate || null,
        bookingStatus: booking.status || null,
        createdAt,
        client: booking.clientId ? {
          _id: booking.clientId._id || booking.clientId,
          name: booking.clientId.name || null,
          email: booking.clientId.email || null,
          phone: booking.clientId.phone || null,
        } : null,
        service: {
          code: booking.serviceCode || null,
          type: booking.serviceType || null,
          name: serviceDef?.name || booking.serviceType || null,
        },
        totalFee,
        priceCurrency: currency,
        totalPaid,
        balanceDue,
        paymentStatus,
        payments: bookingPayments.map(payment => ({
          _id: payment._id,
          amount: normalizeAmount(payment.amount),
          type: payment.type,
          method: payment.method || null,
          description: payment.description || null,
          date: payment.date || null,
          priceCurrency: normalizeCurrency(payment.priceCurrency),
        })),
      };
    }).filter(summary => {
      if (!paymentStatusFilter) return true;
      return paymentStatusFilter.includes(summary.paymentStatus);
    });

    const statusPriority = { unpaid: 0, partial: 1, paid: 2 };
    const getSortDate = (item) => {
      if (item.bookingStartDate) {
        const start = new Date(item.bookingStartDate);
        if (!Number.isNaN(start.getTime())) return start.getTime();
      }
      if (item.createdAt instanceof Date && !Number.isNaN(item.createdAt.getTime())) {
        return item.createdAt.getTime();
      }
      if (item.createdAt && typeof item.createdAt.getTime === 'function') {
        return item.createdAt.getTime();
      }
      return 0;
    };

    summaries.sort((a, b) => {
      const statusDiff = (statusPriority[a.paymentStatus] ?? 4) - (statusPriority[b.paymentStatus] ?? 4);
      if (statusDiff !== 0) return statusDiff;
      return getSortDate(a) - getSortDate(b);
    });

    res.json({ items: summaries });
  } catch (error) {
    res.status(500).json({ message: 'Error building payment summary', error: error.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('clientId')
      .populate('bookingId');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment', error: error.message });
  }
};

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

    if (payload.bookingId !== undefined) {
      payment.bookingId = payload.bookingId || undefined;
      if (payload.bookingId) {
        const booking = await Booking.findById(payload.bookingId);
        if (booking) {
          if (!payment.clientId && booking.clientId) payment.clientId = booking.clientId;
          if (!payload.serviceCode && booking.serviceCode) payment.serviceCode = booking.serviceCode;
          if (!payload.serviceType && booking.serviceType) payment.serviceType = booking.serviceType;
          if (!payload.priceCurrency && booking.priceCurrency) payment.priceCurrency = booking.priceCurrency;
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

    if (payload.priceCurrency !== undefined) {
      payment.priceCurrency = normalizeCurrency(payload.priceCurrency);
    } else if (!payment.priceCurrency) {
      payment.priceCurrency = PRICE_CURRENCY_DEFAULT;
    }

    await payment.save();

    try {
      await syncBookingPaymentStatus(payment.bookingId);
    } catch (err) {
      console.warn('Post-payment booking status update failed:', err.message);
    }

    res.json(payment);
  } catch (error) {
    res.status(400).json({ message: 'Error updating payment', error: error.message });
  }
};

exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    try {
      await syncBookingPaymentStatus(payment.bookingId);
    } catch (err) {
      console.warn('Post-payment booking status update failed:', err.message);
    }
    res.json({ message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting payment', error: error.message });
  }
};
