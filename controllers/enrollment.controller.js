const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');

// Enroll student in class
exports.createEnrollment = async (req, res) => {
  try {
    const { studentId, classId } = req.body || {};
    if (!studentId || !classId) {
      return res.status(400).json({ message: 'studentId and classId are required' });
    }

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (typeof cls.capacity === 'number' && cls.capacity > 0) {
      const currentCount = await Enrollment.countDocuments({ classId });
      if (currentCount >= cls.capacity) {
        return res.status(409).json({ message: 'Class capacity reached' });
      }
    }

    const enrollment = new Enrollment({ ...req.body, enrolledOn: new Date() });
    await enrollment.save();
    res.status(201).json(enrollment);
  } catch (error) {
    res.status(400).json({ message: 'Error creating enrollment', error: error.message });
  }
};

// List all enrollments (optionally filter by student or class)
exports.getEnrollments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.classId) filter.classId = req.query.classId;
    const enrollments = await Enrollment.find(filter)
      .populate('classId')
      .populate('studentId');
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching enrollments', error: error.message });
  }
};

// Get enrollment details
exports.getEnrollmentById = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id)
      .populate('classId')
      .populate('studentId');
    if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
    res.json(enrollment);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching enrollment', error: error.message });
  }
};

// Update enrollment (status, feedback, etc.)
exports.updateEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
    res.json(enrollment);
  } catch (error) {
    res.status(400).json({ message: 'Error updating enrollment', error: error.message });
  }
};

// Remove enrollment
exports.deleteEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByIdAndDelete(req.params.id);
    if (!enrollment) return res.status(404).json({ message: 'Enrollment not found' });
    res.json({ message: 'Enrollment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting enrollment', error: error.message });
  }
};
