const Booking = require('../models/Booking');
const Equipment = require('../models/Equipment');
const Attendance = require('../models/Attendance');
const Room = require('../models/Room');
const Client = require('../models/Client');
const { getCalendarClient } = require('./calendar.controller');
const { findServiceByCode, getServiceCategory } = require('../config/services');

const PAYMENT_STATUS_VALUES = ['paid', 'unpaid', 'partial'];
const PAYMENT_STATUS_SET = new Set(PAYMENT_STATUS_VALUES);

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const CALENDAR_TZ = process.env.GOOGLE_CALENDAR_TZ || 'UTC';

async function buildCalendarEventFromBooking(booking) {
  // Guard: only create if we have times and calendar configured
  if (!CALENDAR_ID) return null;
  if (!booking.startDate) return null;

  let endDate = booking.endDate ? new Date(booking.endDate) : null;
  const startDate = new Date(booking.startDate);
  const serviceDef = findServiceByCode(booking.serviceCode);
  if (!endDate) {
    const durationMinutes = serviceDef?.defaults?.durationMinutes || 60;
    endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  }

  let roomName = '';
  let equipmentName = '';
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
    if (booking.clientId) {
      const cl = await Client.findById(booking.clientId).select('name');
      clientName = cl?.name || '';
    }
  } catch (_) {}

  const serviceLabel = serviceDef?.name || booking.serviceType;

  let summary = serviceLabel || 'Booking';
  switch (booking.serviceType) {
    case 'room':
      summary = `Room: ${roomName || serviceLabel || booking.roomId || ''}`.trim();
      break;
    case 'equipment':
      summary = `Equipment: ${equipmentName || serviceLabel || booking.equipmentId || ''}`.trim();
      break;
    default:
      summary = serviceLabel || 'Booking';
  }

  if (clientName) summary = `${summary} — ${clientName}`;

  const descriptionLines = [
    `Service category: ${booking.serviceType}`,
    `Booking ID: ${booking._id}`,
  ];
  if (serviceDef) descriptionLines.push(`Service: ${serviceDef.name}`);
  if (roomName) descriptionLines.push(`Room: ${roomName}`);
  if (equipmentName) descriptionLines.push(`Equipment: ${equipmentName}`);
  if (typeof booking.totalFee === 'number') {
    const currency = booking.priceCurrency ? ` ${booking.priceCurrency}` : '';
    descriptionLines.push(`Price: ${booking.totalFee}${currency}`);
  }

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

async function fetchCalendarConflicts(startDate, endDate, { excludeBookingId, existingGoogleIds = [] } = {}) {
  const calendar = getCalendarClient();
  if (!calendar || !CALENDAR_ID) return [];
  try {
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    let excludeGoogleId = null;
    if (excludeBookingId) {
      const booking = await Booking.findById(excludeBookingId).select('googleEventId');
      excludeGoogleId = booking?.googleEventId || null;
    }
    const conflicts = (response.data.items || []).filter(event => {
      const eventId = event.id;
      if (!eventId) return false;
      if (excludeGoogleId && eventId === excludeGoogleId) return false;
      if (existingGoogleIds.includes(eventId)) return false;
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      if (!start || !end) return false;
      const eventStart = new Date(start);
      const eventEnd = new Date(end);
      if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) return false;
      if (event.start?.date && !event.start?.dateTime) {
        eventEnd.setDate(eventEnd.getDate() - 1);
        eventEnd.setHours(23, 59, 59, 999);
      }
      return eventStart < endDate && eventEnd > startDate;
    }).map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start,
      end: event.end
    }));
    return conflicts;
  } catch (err) {
    console.warn('Calendar availability check failed:', err.message);
    return [];
  }
}

// Create new booking with basic conflict checks
exports.createBooking = async (req, res) => {
  try {
    const payload = req.body || {};
    const {
      clientId,
      staffId,
      equipmentId,
      roomId,
      startDate: startRaw,
      endDate: endRaw,
      serviceCode,
      priceCurrency,
      priceNotes,
      addOns,
      paymentStatus: paymentStatusRaw,
    } = payload;

    let serviceType = payload.serviceType || null;
    const serviceDef = findServiceByCode(serviceCode);
    const derivedType = getServiceCategory(serviceCode);
    if (derivedType) {
      serviceType = derivedType;
    }

    if (!serviceType) {
      return res.status(400).json({ message: 'serviceType is required' });
    }

    if (!['equipment', 'room', 'class', 'service'].includes(serviceType)) {
      return res.status(400).json({ message: 'Unsupported serviceType' });
    }

    let paymentStatus = undefined;
    if (paymentStatusRaw !== undefined && paymentStatusRaw !== null && paymentStatusRaw !== '') {
      const normalized = String(paymentStatusRaw).toLowerCase();
      if (!PAYMENT_STATUS_SET.has(normalized)) {
        return res.status(400).json({ message: 'Invalid paymentStatus' });
      }
      paymentStatus = normalized;
    }

    const parseNumber = (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    let fullPrice = parseNumber(payload.fullPrice);
    if (fullPrice === null) {
      return res.status(400).json({ message: 'fullPrice must be a valid number' });
    }
    if (fullPrice === undefined && typeof serviceDef?.defaults?.fullPrice === 'number') {
      fullPrice = serviceDef.defaults.fullPrice;
    }
    if (fullPrice === undefined) {
      return res.status(400).json({ message: 'fullPrice is required for manual pricing' });
    }
    if (fullPrice < 0) {
      return res.status(400).json({ message: 'fullPrice cannot be negative' });
    }

    const discountedPriceParsed = parseNumber(payload.discountedPrice);
    if (discountedPriceParsed === null) {
      return res.status(400).json({ message: 'discountedPrice must be a valid number when provided' });
    }
    if (typeof discountedPriceParsed === 'number' && discountedPriceParsed < 0) {
      return res.status(400).json({ message: 'discountedPrice cannot be negative' });
    }
    const discountedPrice = discountedPriceParsed;

    const startDate = startRaw ? new Date(startRaw) : null;
    const endDateInitial = endRaw ? new Date(endRaw) : null;
    const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());
    const startDateValid = startDate && isValidDate(startDate) ? startDate : null;
    let endDate = endDateInitial && isValidDate(endDateInitial) ? endDateInitial : null;

    if (startDate && !startDateValid) {
      return res.status(400).json({ message: 'startDate is invalid' });
    }
    if (endDateInitial && !endDate) {
      return res.status(400).json({ message: 'endDate is invalid' });
    }

    if (!endDate && startDateValid && typeof serviceDef?.defaults?.durationMinutes === 'number') {
      endDate = new Date(startDateValid.getTime() + serviceDef.defaults.durationMinutes * 60000);
    }

    const bufferMinutes = parseInt(process.env.BOOKING_BUFFER_MINUTES || '0', 10);
    const startBuffered = startDateValid ? new Date(startDateValid.getTime() - bufferMinutes * 60000) : null;
    const endBuffered = endDate ? new Date(endDate.getTime() + bufferMinutes * 60000) : null;

    if (serviceType === 'room') {
      if (!roomId) return res.status(400).json({ message: 'roomId is required for room bookings' });
      if (!startDateValid || !endDate) return res.status(400).json({ message: 'startDate and endDate are required for room bookings' });
      if (endDate <= startDateValid) return res.status(400).json({ message: 'endDate must be after startDate' });
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
      if (!startDateValid || !endDate) return res.status(400).json({ message: 'startDate and endDate are required for equipment bookings' });
      if (endDate <= startDateValid) return res.status(400).json({ message: 'endDate must be after startDate' });
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
    } else if (serviceType === 'service' || serviceType === 'class') {
      if (!startDateValid) return res.status(400).json({ message: 'startDate is required for service bookings' });
      if (!endDate) return res.status(400).json({ message: 'endDate is required for service bookings' });
      if (endDate <= startDateValid) return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    if (startDateValid && endDate) {
      const calendarConflicts = await fetchCalendarConflicts(startDateValid, endDate);
      if (calendarConflicts.length) {
        return res.status(409).json({ message: 'Selected time conflicts with existing calendar events', conflicts: calendarConflicts });
      }
    }

    if (typeof discountedPrice === 'number' && discountedPrice > fullPrice) {
      return res.status(400).json({ message: 'discountedPrice cannot exceed fullPrice' });
    }

    const sanitizedNotes = typeof priceNotes === 'string' && priceNotes.trim() ? priceNotes.trim() : undefined;
    const currency = typeof priceCurrency === 'string' && priceCurrency.trim() ? priceCurrency.trim().toUpperCase() : undefined;
    const normalizedAddOns = Array.isArray(addOns)
      ? addOns
          .map(item => {
            const name = typeof item?.name === 'string' ? item.name.trim() : '';
            const amount = parseNumber(item?.amount);
            if (!name) return null;
            if (amount === null) return null;
            if (amount === undefined) return { name };
            return { name, amount };
          })
          .filter(Boolean)
      : undefined;

    const booking = new Booking({
      serviceType,
      serviceCode,
      clientId,
      staffId,
      equipmentId,
      roomId,
      startDate: startDateValid,
      endDate,
      fullPrice,
      discountedPrice,
      priceCurrency: currency,
      priceNotes: sanitizedNotes,
      addOns: normalizedAddOns,
      paymentStatus: paymentStatus ?? undefined,
    });

    await booking.save();
    // Attempt to sync to Google Calendar
    try {
      await createOrUpdateCalendarEvent(booking);
    } catch (_) {}

    try {
      if (booking.clientId && booking.startDate) {
        await Attendance.findOneAndUpdate(
          { bookingId: booking._id, clientId: booking.clientId },
          {
            sessionDate: booking.startDate,
            status: 'scheduled'
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (err) {
      console.error('Attendance create error', err.message);
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

exports.getBookings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.serviceCode) filter.serviceCode = req.query.serviceCode;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate && req.query.endDate) {
      filter.startDate = { $gte: new Date(req.query.startDate) };
      filter.endDate = { $lte: new Date(req.query.endDate) };
    }
    const bookings = await Booking.find(filter)
      .populate('clientId')
      .populate('staffId')
      .populate('equipmentId')
      .populate('roomId');
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
      .populate('roomId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching booking', error: error.message });
  }
};

// Update booking
exports.updateBooking = async (req, res) => {
  try {
    const payload = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const parseNumber = (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const parseDate = (value) => {
      if (value === null || value === undefined || value === '') return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    };

    const allowedServiceTypes = ['equipment', 'room', 'class', 'service'];

    if (payload.serviceCode !== undefined) {
      booking.serviceCode = payload.serviceCode || undefined;
    }
    if (payload.serviceType) {
      booking.serviceType = payload.serviceType;
    }

    const derivedType = getServiceCategory(booking.serviceCode);
    if (derivedType) {
      booking.serviceType = derivedType;
    }

    if (!booking.serviceType) {
      return res.status(400).json({ message: 'serviceType is required' });
    }
    if (!allowedServiceTypes.includes(booking.serviceType)) {
      return res.status(400).json({ message: 'Unsupported serviceType' });
    }

    const serviceDef = findServiceByCode(booking.serviceCode);

    const directFields = ['clientId', 'staffId', 'equipmentId', 'roomId', 'status', 'priceNotes'];
    for (const field of directFields) {
      if (payload[field] !== undefined) {
        if (field === 'priceNotes') {
          booking[field] = typeof payload[field] === 'string' && payload[field].trim() ? payload[field].trim() : undefined;
        } else {
          booking[field] = payload[field] || undefined;
        }
      }
    }

    if (payload.paymentStatus !== undefined) {
      const normalized = String(payload.paymentStatus).toLowerCase();
      if (!PAYMENT_STATUS_SET.has(normalized)) {
        return res.status(400).json({ message: 'Invalid paymentStatus' });
      }
      booking.paymentStatus = normalized;
    }

    if (payload.priceCurrency !== undefined) {
      booking.priceCurrency = typeof payload.priceCurrency === 'string' && payload.priceCurrency.trim()
        ? payload.priceCurrency.trim().toUpperCase()
        : undefined;
    }

    if (payload.fullPrice !== undefined) {
      const parsed = parseNumber(payload.fullPrice);
      if (parsed === null) {
        return res.status(400).json({ message: 'fullPrice must be a valid number' });
      }
      booking.fullPrice = parsed;
    }

    if (payload.discountedPrice !== undefined) {
      const parsed = parseNumber(payload.discountedPrice);
      if (parsed === null) {
        return res.status(400).json({ message: 'discountedPrice must be a valid number when provided' });
      }
      booking.discountedPrice = parsed;
    }

    if (typeof booking.fullPrice === 'number' && booking.fullPrice < 0) {
      return res.status(400).json({ message: 'fullPrice cannot be negative' });
    }
    if (typeof booking.discountedPrice === 'number' && booking.discountedPrice < 0) {
      return res.status(400).json({ message: 'discountedPrice cannot be negative' });
    }
    if (typeof booking.discountedPrice === 'number' && typeof booking.fullPrice === 'number' && booking.discountedPrice > booking.fullPrice) {
      return res.status(400).json({ message: 'discountedPrice cannot exceed fullPrice' });
    }

    if (payload.startDate !== undefined) {
      const parsed = parseDate(payload.startDate);
      if (parsed === null) {
        return res.status(400).json({ message: 'startDate is invalid' });
      }
      booking.startDate = parsed;
    }

    if (payload.endDate !== undefined) {
      const parsed = parseDate(payload.endDate);
      if (parsed === null) {
        return res.status(400).json({ message: 'endDate is invalid' });
      }
      booking.endDate = parsed;
    }

    if (payload.addOns !== undefined) {
      const normalizedAddOns = Array.isArray(payload.addOns)
        ? payload.addOns
            .map(item => {
              const name = typeof item?.name === 'string' ? item.name.trim() : '';
              const amount = parseNumber(item?.amount);
              if (!name) return null;
              if (amount === null) return null;
              if (amount === undefined) return { name };
              return { name, amount };
            })
            .filter(Boolean)
        : undefined;
      booking.addOns = normalizedAddOns;
    }

    const startDate = booking.startDate ? new Date(booking.startDate) : undefined;
    const endDate = booking.endDate ? new Date(booking.endDate) : undefined;

    const bufferMinutes = parseInt(process.env.BOOKING_BUFFER_MINUTES || '0', 10);
    const startBuffered = startDate ? new Date(startDate.getTime() - bufferMinutes * 60000) : null;
    const endBuffered = endDate ? new Date(endDate.getTime() + bufferMinutes * 60000) : null;

    if (booking.serviceType === 'room') {
      if (!booking.roomId) return res.status(400).json({ message: 'roomId is required for room bookings' });
      if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required for room bookings' });
      if (endDate <= startDate) return res.status(400).json({ message: 'endDate must be after startDate' });
      const conflict = await Booking.findOne({
        _id: { $ne: booking._id },
        serviceType: 'room',
        roomId: booking.roomId,
        status: { $ne: 'canceled' },
        startDate: { $lt: endBuffered },
        endDate: { $gt: startBuffered }
      });
      if (conflict) {
        return res.status(409).json({ message: 'Room is already booked for the selected time range' });
      }
    } else if (booking.serviceType === 'equipment') {
      if (!booking.equipmentId) return res.status(400).json({ message: 'equipmentId is required for equipment bookings' });
      if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required for equipment bookings' });
      if (endDate <= startDate) return res.status(400).json({ message: 'endDate must be after startDate' });
      const conflict = await Booking.findOne({
        _id: { $ne: booking._id },
        serviceType: 'equipment',
        equipmentId: booking.equipmentId,
        status: { $ne: 'canceled' },
        startDate: { $lt: endBuffered },
        endDate: { $gt: startBuffered }
      });
      if (conflict) {
        return res.status(409).json({ message: 'Equipment is already booked for the selected time range' });
      }
    } else if (booking.serviceType === 'service') {
      if (!startDate) return res.status(400).json({ message: 'startDate is required for service bookings' });
      if (!endDate) return res.status(400).json({ message: 'endDate is required for service bookings' });
      if (endDate <= startDate) return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    if (startDate && endDate) {
      const calendarConflicts = await fetchCalendarConflicts(startDate, endDate, {
        excludeBookingId: booking._id,
        existingGoogleIds: booking.googleEventId ? [booking.googleEventId] : []
      });
      if (calendarConflicts.length) {
        return res.status(409).json({ message: 'Selected time conflicts with existing calendar events', conflicts: calendarConflicts });
      }
    }

    await booking.save();
    try {
      if (booking.clientId && booking.startDate) {
        await Attendance.findOneAndUpdate(
          { bookingId: booking._id, clientId: booking.clientId },
          { $set: { sessionDate: booking.startDate } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (err) {
      console.error('Attendance sync error', err.message);
    }
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
    const { serviceType, roomId, equipmentId, startDate: startRaw, endDate: endRaw, excludeBookingId } = req.query || {};
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

    let conflicts = await Booking.find(filter).select('_id startDate endDate roomId equipmentId clientId googleEventId');
    if (excludeBookingId) {
      const excludeId = String(excludeBookingId);
      conflicts = conflicts.filter(conflict => String(conflict._id) !== excludeId);
    }

    const existingIds = conflicts.filter(c => c.googleEventId).map(c => c.googleEventId);
    const calendarConflicts = await fetchCalendarConflicts(startDate, endDate, {
      excludeBookingId,
      existingGoogleIds: existingIds
    });

    const available = conflicts.length === 0 && calendarConflicts.length === 0;
    res.json({ available, conflicts, calendarConflicts });
  } catch (error) {
    res.status(500).json({ message: 'Error checking availability', error: error.message });
  }
};
