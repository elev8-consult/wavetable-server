// server/config/services.js
// Central definition for services and default pricing guidance.

const SERVICE_CATALOG = [
  {
    code: 'room_rental',
    name: 'Room Rental',
    category: 'room', // ties back to Booking.serviceType logic
    defaults: {
      fullPrice: 20,
      priceUnit: 'hour',
      durationMinutes: 60,
    },
    description: 'Studio room rental, billed per hour.',
  },
  {
    code: 'private_dj_class',
    name: 'Private DJ Class',
    category: 'class',
    defaults: {
      fullPrice: 45,
      priceUnit: 'session',
      durationMinutes: 90, // 1.5 hours
      sessions: 1,
    },
    description: '1.5 hour private DJ coaching session.',
    requiresClassId: false,
  },
  {
    code: 'video_recording',
    name: 'Video Recording',
    category: 'service',
    defaults: {
      fullPrice: 60,
      priceUnit: 'hour',
      durationMinutes: 60,
      addOns: [
        { code: 'extra_cam', name: 'Extra Camera', amount: 20 },
      ],
    },
    description: 'Video recording session, base rate per hour. Add $20 for an extra camera.',
  },
  {
    code: 'equipment_rental',
    name: 'Equipment Rental',
    category: 'equipment',
    defaults: {
      priceUnit: 'custom',
    },
    description: 'Rental of studio equipment. Pricing entered manually per item.',
  },
  {
    code: 'production_consulting',
    name: 'Production Consulting',
    category: 'service',
    defaults: {
      fullPrice: 60,
      priceUnit: 'hour',
      durationMinutes: 60,
    },
    description: 'Music production consulting, billed per hour.',
  },
  {
    code: 'dj_class_level1',
    name: 'DJ Class Level 1 Bundle (10 sessions)',
    category: 'class',
    defaults: {
      fullPrice: 400,
      priceUnit: 'bundle',
      totalSessions: 10,
      durationMinutes: 90,
    },
    description: 'Level 1 DJ course consisting of 10 sessions.',
    requiresEnrollmentTracking: true,
    requiresClassId: false,
  },
  {
    code: 'dj_class_level2',
    name: 'DJ Class Level 2 Bundle (10 sessions)',
    category: 'class',
    defaults: {
      fullPrice: 500,
      priceUnit: 'bundle',
      totalSessions: 10,
      durationMinutes: 90,
    },
    description: 'Level 2 DJ course consisting of 10 sessions.',
    requiresEnrollmentTracking: true,
    requiresClassId: false,
  },
];

const SERVICE_CODES = SERVICE_CATALOG.map(service => service.code);

function findServiceByCode(code) {
  if (!code) return null;
  return SERVICE_CATALOG.find(service => service.code === code) || null;
}

function getServiceCategory(code) {
  return findServiceByCode(code)?.category || null;
}

module.exports = {
  SERVICE_CATALOG,
  SERVICE_CODES,
  findServiceByCode,
  getServiceCategory,
};
