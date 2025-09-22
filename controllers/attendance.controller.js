const Attendance = require('../models/Attendance');
const Booking = require('../models/Booking');
const Client = require('../models/Client');

function buildAttendanceFilter(query = {}) {
  const filter = {};
  if (query.bookingId) filter.bookingId = query.bookingId;
  if (query.clientId) filter.clientId = query.clientId;
  if (query.status) filter.status = query.status;
  if (query.startDate || query.endDate) {
    filter.sessionDate = {};
    if (query.startDate) filter.sessionDate.$gte = new Date(query.startDate);
    if (query.endDate) filter.sessionDate.$lte = new Date(query.endDate);
  } else if (query.sessionDate) {
    filter.sessionDate = new Date(query.sessionDate);
  }
  return filter;
}

async function validateRefs({ bookingId, clientId }) {
  if (bookingId) {
    const booking = await Booking.findById(bookingId).select('_id clientId startDate');
    if (!booking) throw new Error('Booking does not exist');
    if (!clientId) {
      return {
        bookingClientId: booking.clientId,
        sessionDate: booking.startDate,
      };
    }
    return {
      bookingClientId: booking.clientId,
      sessionDate: booking.startDate,
    };
  }
  return {};
}

// Create or upsert attendance record for a booking/client pair
exports.createAttendance = async (req, res) => {
  try {
    const { bookingId, clientId, sessionDate, status, notes } = req.body || {};
    if (!bookingId) return res.status(400).json({ message: 'bookingId is required' });
    const { bookingClientId, sessionDate: bookingSessionDate } = await validateRefs({ bookingId, clientId });

    const resolvedClientId = clientId || bookingClientId;
    if (!resolvedClientId) return res.status(400).json({ message: 'clientId is required' });
    const clientExists = await Client.exists({ _id: resolvedClientId });
    if (!clientExists) return res.status(400).json({ message: 'Client does not exist' });

    const resolvedSessionDate = sessionDate ? new Date(sessionDate) : bookingSessionDate ? new Date(bookingSessionDate) : null;
    if (!resolvedSessionDate || Number.isNaN(resolvedSessionDate.getTime())) {
      return res.status(400).json({ message: 'sessionDate is required' });
    }

    const payload = {
      bookingId,
      clientId: resolvedClientId,
      sessionDate: resolvedSessionDate,
      status: status || 'scheduled',
    };
    if (notes !== undefined) payload.notes = notes;

    const attendance = await Attendance.findOneAndUpdate(
      { bookingId, clientId: resolvedClientId },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(attendance);
  } catch (error) {
    res.status(400).json({ message: 'Error creating attendance', error: error.message });
  }
};

exports.getAttendances = async (req, res) => {
  try {
    const filter = buildAttendanceFilter(req.query);
    const items = await Attendance.find(filter)
      .sort({ sessionDate: 1 })
      .populate('clientId')
      .populate('bookingId');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching attendance', error: err.message });
  }
};

exports.getAttendanceById = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('clientId')
      .populate('bookingId');
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching attendance', error: err.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.sessionDate) {
      update.sessionDate = new Date(update.sessionDate);
    }
    const attendance = await Attendance.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(attendance);
  } catch (err) {
    res.status(400).json({ message: 'Error updating attendance', error: err.message });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting attendance', error: err.message });
  }
};

// Legacy endpoint compatibility: mark all attendance entries for a booking as present
exports.bulkMarkSessionPresent = async (req, res) => {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ message: 'bookingId is required' });
    const result = await Attendance.updateMany({ bookingId }, { $set: { status: 'present' } });
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: 'Error bulk marking attendance', error: err.message });
  }
};
