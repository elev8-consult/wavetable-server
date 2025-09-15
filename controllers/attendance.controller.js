const Attendance = require('../models/Attendance');

// Create a single attendance record
exports.createAttendance = async (req, res) => {
  try {
    const attendance = new Attendance(req.body);
    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    res.status(400).json({ message: 'Error creating attendance', error: error.message });
  }
};

// List/search attendance
exports.getAttendances = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.bookingId) filter.bookingId = req.query.bookingId;
    if (req.query.sessionDate) filter.sessionDate = new Date(req.query.sessionDate);
    if (req.query.studentId) filter.studentId = req.query.studentId;
    const items = await Attendance.find(filter)
      .populate('studentId')
      .populate('classId')
      .populate('bookingId')
      .populate('roomId');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching attendance', error: err.message });
  }
};

// Get one attendance by id
exports.getAttendanceById = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('studentId')
      .populate('classId')
      .populate('bookingId')
      .populate('roomId');
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching attendance', error: err.message });
  }
};

// Update attendance
exports.updateAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(attendance);
  } catch (err) {
    res.status(400).json({ message: 'Error updating attendance', error: err.message });
  }
};

// Delete attendance
exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting attendance', error: err.message });
  }
};

// Bulk mark all attendances for a given class/sessionDate as present
exports.bulkMarkSessionPresent = async (req, res) => {
  try {
    const { classId, sessionDate } = req.body;
    if (!classId || !sessionDate) return res.status(400).json({ message: 'classId and sessionDate are required' });
    const date = new Date(sessionDate);
    const result = await Attendance.updateMany(
      { classId, sessionDate: date },
      { $set: { status: 'present' } }
    );
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: 'Error bulk marking attendance', error: err.message });
  }
};
