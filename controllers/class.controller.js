const Class = require('../models/Class');
const Booking = require('../models/Booking');

async function syncRoomBookingsForClass(cls) {
  // Remove all previous class-linked room bookings if no room or schedule
  const bufferMinutes = parseInt(process.env.BOOKING_BUFFER_MINUTES || '0', 10);
  const defaultLen = parseInt(process.env.DEFAULT_CLASS_SESSION_MINUTES || '90', 10);
  const sessionMinutes = typeof cls.sessionLength === 'number' && cls.sessionLength > 0 ? cls.sessionLength : defaultLen;

  const existing = await Booking.find({ serviceType: 'room', classId: cls._id });

  if (!cls.roomId || !Array.isArray(cls.schedule) || cls.schedule.length === 0) {
    if (existing.length) {
      await Booking.deleteMany({ _id: { $in: existing.map(b => b._id) } });
    }
    return { created: 0, removed: existing.length, skipped: 0 };
  }

  const desiredSessions = (cls.schedule || []).map(s => {
    const start = new Date(s);
    const end = new Date(start.getTime() + sessionMinutes * 60000);
    return { start, end };
  });

  // Remove outdated/mismatched bookings
  const desiredStartsISO = new Set(desiredSessions.map(d => d.start.toISOString()));
  const toRemove = existing.filter(b => {
    const startISO = new Date(b.startDate).toISOString();
    return !desiredStartsISO.has(startISO) || String(b.roomId) !== String(cls.roomId);
  });
  if (toRemove.length) await Booking.deleteMany({ _id: { $in: toRemove.map(b => b._id) } });

  let created = 0, skipped = 0;
  for (const { start, end } of desiredSessions) {
    const startBuffered = new Date(start.getTime() - bufferMinutes * 60000);
    const endBuffered = new Date(end.getTime() + bufferMinutes * 60000);

    const conflict = await Booking.findOne({
      serviceType: 'room',
      roomId: cls.roomId,
      status: { $ne: 'canceled' },
      classId: { $ne: cls._id },
      startDate: { $lt: endBuffered },
      endDate: { $gt: startBuffered }
    });
    if (conflict) {
      skipped++;
      continue;
    }

    // Upsert a room booking for this class session
    const found = await Booking.findOne({ serviceType: 'room', classId: cls._id, roomId: cls.roomId, startDate: start });
    if (!found) {
      const b = new Booking({
        serviceType: 'room',
        classId: cls._id,
        roomId: cls.roomId,
        startDate: start,
        endDate: end,
        status: 'scheduled',
        paymentStatus: 'unpaid'
      });
      await b.save();
      created++;
    }
  }

  return { created, removed: toRemove.length, skipped };
}

// Create class/course
exports.createClass = async (req, res) => {
  try {
    const newClass = new Class(req.body);
    await newClass.save();
    // Attempt to sync room bookings for class sessions (non-fatal)
    try {
      await syncRoomBookingsForClass(newClass);
    } catch (e) { console.warn('Class booking sync (create) failed:', e.message); }
    res.status(201).json(newClass);
  } catch (error) {
    res.status(400).json({ message: 'Error creating class', error: error.message });
  }
};

// List/search classes
exports.getClasses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.name) filter.name = { $regex: req.query.name, $options: 'i' };
    if (req.query.instructor) filter.instructor = { $regex: req.query.instructor, $options: 'i' };
    const classes = await Class.find(filter).populate('roomId');
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching classes', error: error.message });
  }
};

// Get class details
exports.getClassById = async (req, res) => {
  try {
    const foundClass = await Class.findById(req.params.id).populate('roomId');
    if (!foundClass) return res.status(404).json({ message: 'Class not found' });
    res.json(foundClass);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching class', error: error.message });
  }
};

// Update class
exports.updateClass = async (req, res) => {
  try {
    const updatedClass = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedClass) return res.status(404).json({ message: 'Class not found' });
    try {
      await syncRoomBookingsForClass(updatedClass);
    } catch (e) { console.warn('Class booking sync (update) failed:', e.message); }
    res.json(updatedClass);
  } catch (error) {
    res.status(400).json({ message: 'Error updating class', error: error.message });
  }
};

// Delete class (admin only)
exports.deleteClass = async (req, res) => {
  try {
    const deletedClass = await Class.findByIdAndDelete(req.params.id);
    if (!deletedClass) return res.status(404).json({ message: 'Class not found' });
    // Clean up class-linked room bookings
    try { await Booking.deleteMany({ serviceType: 'room', classId: req.params.id }); } catch (e) {}
    res.json({ message: 'Class deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting class', error: error.message });
  }
};
