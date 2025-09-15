const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Load credentials (service account or OAuth2 client)
const CREDENTIALS_PATH = path.join(__dirname, '../config/google-credentials.json');
let credentials = null;
if (fs.existsSync(CREDENTIALS_PATH)) {
  credentials = require(CREDENTIALS_PATH);
}

// Helper to get Google Calendar client (service account example)
function getCalendarClient() {
  if (!credentials || !process.env.GOOGLE_CALENDAR_ID) {
    // No credentials or calendar configured — return null and let callers handle gracefully
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

// Export helper so other controllers can reuse it safely
exports.getCalendarClient = getCalendarClient;

// Fetch Google Calendar events (by date, room, etc.)
exports.getEvents = async (req, res) => {
  try {
    const calendar = getCalendarClient();
    // If calendar is not configured, return empty list so frontend pages remain stable
    if (!calendar) {
      return res.json([]);
    }
    const { start, end, room } = req.query;
    const params = {
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: start ? new Date(start).toISOString() : undefined,
      timeMax: end ? new Date(end).toISOString() : undefined,
      singleEvents: true,
      orderBy: 'startTime',
    };
    // Optionally filter by room (assuming room info is in event summary or description)
    const response = await calendar.events.list(params);
    let events = response.data.items;
    if (room) {
      events = events.filter(e => (e.summary && e.summary.includes(room)) || (e.description && e.description.includes(room)));
    }
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching calendar events', error: error.message });
  }
};

// Manually trigger sync (placeholder)
exports.syncCalendar = async (req, res) => {
  try {
    // Implement your sync logic here (e.g., push local bookings to Google Calendar)
    res.json({ message: 'Calendar sync triggered (implement logic as needed)' });
  } catch (error) {
    res.status(500).json({ message: 'Error syncing calendar', error: error.message });
  }
};
