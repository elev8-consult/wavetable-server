const Booking = require('../models/Booking');
const Equipment = require('../models/Equipment');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Room = require('../models/Room');
const ClassModel = require('../models/Class');
const Client = require('../models/Client');
const { getCalendarClient } = require('./calendar.controller');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const CALENDAR_TZ = process.env.GOOGLE_CALENDAR_TZ || 'UTC';

async function buildCalendarEventFromBooking(booking) {
  // Guard: only create if we have times and calendar configured
  if (!CALENDAR_ID) return null;
  if (!booking.startDate) return null;

  let endDate = booking.endDate ? new Date(booking.endDate) : null;
  const startDate = new Date(booking.startDate);

  // If endDate missing and it's a class, try to infer from sessionLength (minutes)
  if (!endDate && booking.serviceType === 'class' && booking.classId) {
    try {
      const cls = await ClassModel.findById(booking.classId);
      if (cls && cls.sessionLength) {
        endDate = new Date(startDate.getTime() + cls.sessionLength * 60000);
      }
    } catch (e) {
      // ignore; will fallback below
    }
  }
  // Final fallback: default to 60 minutes if still missing
  if (!endDate) endDate = new Date(startDate.getTime() + 60 * 60000);

  // Fetch optional names
  let roomName = '';
  let equipmentName = '';
  let className = '';
  let clientName = '';
  try {
    if (booking.roomId) {
      const r = await Room.findById(booking.roomId).select('name');
      roomName = r?.name || '';
    }
    if (booking.equipmentId) {
      const eq = await Equipment.findById(booking.equipmentId).select('name');
      equipmentName = eq?.name || '';
    }
    if (booking.classId) {
      const cls = await ClassModel.findById(booking.classId).select('name');
      className = cls?.name || '';
    }
    if (booking.clientId) {
      const cl = await Client.findById(booking.clientId).select('name');
      clientName = cl?.name || '';
    }
  } catch (_) {}

  let summary = 'Booking';
  if (booking.serviceType === 'room') summary = `Room: ${roomName || booking.roomId || ''}`.trim();
  else if (booking.serviceType === 'equipment') summary = `Equipment: ${equipmentName || booking.equipmentId || ''}`.trim();
  else if (booking.serviceType === 'class') summary = `Class: ${className || booking.classId || ''}`.trim();

  if (clientName) summary = `${summary} — ${clientName}`;

  const descriptionLines = [
    `Service: ${booking.serviceType}`,
    `Booking ID: ${booking._id}`,
  ];
  if (roomName) descriptionLines.push(`Room: ${roomName}`);
  if (equipmentName) descriptionLines.push(`Equipment: ${equipmentName}`);
  if (className) descriptionLines.push(`Class: ${className}`);

  const event = {
    summary,
    description: descriptionLines.join('\n'),
    location: roomName || undefined,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: CALENDAR_TZ,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: CALENDAR_TZ,
    },
    // Keep busy by default
    transparency: 'opaque',
  };

  return event;
}

async function createOrUpdateCalendarEvent(booking) {
  const calendar = getCalendarClient();
  if (!calendar || !CALENDAR_ID) return; // silently skip if not configured
  try {
    const event = await buildCalendarEventFromBooking(booking);
    if (!event) return;
    if (booking.googleEventId) {
      // Update existing event
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: booking.googleEventId,
        requestBody: event,
      });
    } else {
      const insertRes = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: event,
      });
      const newEventId = insertRes?.data?.id;
      if (newEventId) {
        booking.googleEventId = newEventId;
        booking.googleCalendarId = CALENDAR_ID;
        try {
          await booking.save();
        } catch (_) {}
      }
    }
  } catch (e) {
    // Non-fatal: log and continue
    console.warn('Google Calendar sync (create/update) failed:', e.message);
  }
}

async function deleteCalendarEvent(booking) {
  const calendar = getCalendarClient();
  if (!calendar || !CALENDAR_ID) return;
  if (!booking.googleEventId) return;
  try {
    await calendar.events.delete({
      calendarId: booking.googleCalendarId || CALENDAR_ID,
      eventId: booking.googleEventId,
    });
  } catch (e) {
    console.warn('Google Calendar delete failed:', e.message);
  }
}

// Create new booking with basic conflict checks
exports.createBooking = async (req, res) => {
  try {
    const {
      serviceType,
      clientId,
      staffId,
      equipmentId,
      roomId,
      classId,
      startDate: startRaw,
      endDate: endRaw,
      totalFee
    } = req.body || {};

    if (!serviceType) return res.status(400).json({ message: 'serviceType is required' });

    // Normalize dates
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;

    // Validate required fields based on service type
    const bufferMinutes = parseInt(process.env.BOOKING_BUFFER_MINUTES || '0', 10);
    const startBuffered = startDate ? new Date(startDate.getTime() - bufferMinutes * 60000) : null;
    const endBuffered = endDate ? new Date(endDate.getTime() + bufferMinutes * 60000) : null;

    if (serviceType === 'room') {
      if (!roomId) return res.status(400).json({ message: 'roomId is required for room bookings' });
      if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required for room bookings' });
      if (endDate <= startDate) return res.status(400).json({ message: 'endDate must be after startDate' });
      // Check for overlapping room bookings (exclude canceled)
      const conflict = await Booking.findOne({
        serviceType: 'room',
        roomId,
        status: { $ne: 'canceled' },
        startDate: { $lt: endBuffered },
        endDate: { $gt: startBuffered }
      });
      if (conflict) {
        return res.status(409).json({ message: 'Room is already booked for the selected time range' });
      }
    } else if (serviceType === 'equipment') {
      if (!equipmentId) return res.status(400).json({ message: 'equipmentId is required for equipment bookings' });
      if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required for equipment bookings' });
      if (endDate <= startDate) return res.status(400).json({ message: 'endDate must be after startDate' });
      const conflict = await Booking.findOne({
        serviceType: 'equipment',
        equipmentId,
        status: { $ne: 'canceled' },
        startDate: { $lt: endBuffered },
        endDate: { $gt: startBuffered }
      });
      if (conflict) {
        return res.status(409).json({ message: 'Equipment is already booked for the selected time range' });
      }
    } else if (serviceType === 'class') {
      if (!classId) return res.status(400).json({ message: 'classId is required for class bookings' });
      // startDate may represent a specific session; optional endDate
    }

    const booking = new Booking({
      serviceType,
      clientId,
      staffId,
      equipmentId,
      roomId,
      classId,
      startDate,
      endDate,
      totalFee
    });
    await booking.save();
    // Attempt to sync to Google Calendar
    try {
      await createOrUpdateCalendarEvent(booking);
    } catch (_) {}

    // Auto-create attendance for class bookings: for each enrolled student create an Attendance for the session
    try {
      if (booking.serviceType === 'class' && booking.classId && booking.startDate) {
        // find enrollments for the class
        const enrollments = await Enrollment.find({ classId: booking.classId });

        // Determine which session dates to create attendance for.
        // If booking has an endDate, create for all class.schedule dates that fall between startDate and endDate (inclusive).
        // Otherwise, create only for booking.startDate.
        const classModel = require('../models/Class');
        const cls = await classModel.findById(booking.classId);
        let sessionDates = [];
        if (cls && Array.isArray(cls.schedule) && cls.schedule.length) {
          if (booking.endDate) {
            const start = new Date(booking.startDate);
            const end = new Date(booking.endDate);
            sessionDates = cls.schedule.map(d => new Date(d)).filter(d => d >= start && d <= end);
          } else {
            // use the booking.startDate as the session
            sessionDates = [new Date(booking.startDate)];
          }
        } else {
          // fallback: use booking.startDate
          sessionDates = [new Date(booking.startDate)];
        }

        for (const sessionDate of sessionDates) {
          for (const en of enrollments) {
            try {
              const att = new Attendance({
                classId: booking.classId,
                bookingId: booking._id,
                sessionDate,
                studentId: en.studentId,
                status: 'absent'
              });
              await att.save();
            } catch (err) {
              if (err.code && err.code === 11000) continue; // ignore duplicates
              console.error('Attendance create error', err.message);
            }
          }
        }
      }

      // For room bookings create an attendance entry for the booking client
      if (booking.serviceType === 'room' && booking.roomId && booking.clientId && booking.startDate) {
        try {
          const att = new Attendance({
            roomId: booking.roomId,
            bookingId: booking._id,
            sessionDate: booking.startDate,
            studentId: booking.clientId,
            status: 'absent'
          });
          await att.save();
        } catch (err) {
          if (!(err.code && err.code === 11000)) console.error('Attendance create error', err.message);
        }
      }
    } catch (err) {
      // non-fatal: log and continue
      console.error('Auto-attendance error', err.message);
    }

    // For equipment bookings, mark equipment as out
    try {
      if (booking.serviceType === 'equipment' && booking.equipmentId) {
        await Equipment.findByIdAndUpdate(booking.equipmentId, { status: 'out' });
      }
    } catch (e) {
      console.warn('Equipment status update failed:', e.message);
    }

    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ message: 'Error creating booking', error: error.message });
  }
};

// List/search all bookings
exports.getBookings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate && req.query.endDate) {
      filter.startDate = { $gte: new Date(req.query.startDate) };
      filter.endDate = { $lte: new Date(req.query.endDate) };
    }
    const bookings = await Booking.find(filter)
      .populate('clientId')
      .populate('staffId')
      .populate('equipmentId')
      .populate('roomId')
      .populate('classId');
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching bookings', error: error.message });
  }
};

// Get booking details
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('clientId')
      .populate('staffId')
      .populate('equipmentId')
      .populate('roomId')
      .populate('classId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching booking', error: error.message });
  }
};

// Update booking
exports.updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    // If canceled or deleted later, remove from calendar; otherwise upsert
    try {
      if (booking.status === 'canceled') await deleteCalendarEvent(booking);
      else await createOrUpdateCalendarEvent(booking);
    } catch (_) {}
    res.json(booking);
  } catch (error) {
    res.status(400).json({ message: 'Error updating booking', error: error.message });
  }
};

// Delete/cancel booking
exports.deleteBooking = async (req, res) => {
  try {
    // Find first to potentially delete calendar event
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    // Try removing calendar event (non-blocking)
    try { await deleteCalendarEvent(booking); } catch (_) {}
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting booking', error: error.message });
  }
};

// Mark equipment as returned
exports.returnEquipment = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking || booking.serviceType !== 'equipment') {
      return res.status(404).json({ message: 'Equipment booking not found' });
    }
    booking.returned = true;
    booking.status = 'completed';
    await booking.save();
    // Optionally update equipment status
    if (booking.equipmentId) {
      await Equipment.findByIdAndUpdate(booking.equipmentId, { status: 'available' });
    }
    res.json({ message: 'Equipment marked as returned', booking });
  } catch (error) {
    res.status(500).json({ message: 'Error returning equipment', error: error.message });
  }
};

// Check availability for room or equipment
exports.checkAvailability = async (req, res) => {
  try {
    const { serviceType, roomId, equipmentId, startDate: startRaw, endDate: endRaw } = req.query || {};
    if (!serviceType) return res.status(400).json({ message: 'serviceType is required' });
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required' });
    if (endDate <= startDate) return res.status(400).json({ message: 'endDate must be after startDate' });
    const bufferMinutes = parseInt(process.env.BOOKING_BUFFER_MINUTES || '0', 10);
    const startBuffered = new Date(startDate.getTime() - bufferMinutes * 60000);
    const endBuffered = new Date(endDate.getTime() + bufferMinutes * 60000);

    const filter = { status: { $ne: 'canceled' }, startDate: { $lt: endBuffered }, endDate: { $gt: startBuffered } };
    if (serviceType === 'room') {
      if (!roomId) return res.status(400).json({ message: 'roomId is required for room availability' });
      filter.roomId = roomId;
      // both 'room' service bookings and class-linked room bookings reserve the room
      filter.serviceType = 'room';
    } else if (serviceType === 'equipment') {
      if (!equipmentId) return res.status(400).json({ message: 'equipmentId is required for equipment availability' });
      filter.equipmentId = equipmentId;
      filter.serviceType = 'equipment';
    } else {
      return res.status(400).json({ message: 'Unsupported serviceType' });
    }

    const conflicts = await Booking.find(filter).select('_id startDate endDate roomId equipmentId classId clientId');
    res.json({ available: conflicts.length === 0, conflicts });
  } catch (error) {
    res.status(500).json({ message: 'Error checking availability', error: error.message });
  }
};
