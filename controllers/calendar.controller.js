const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const CREDENTIALS_PATH = path.join(__dirname, '../config/google-credentials.json');
let credentials = null;

function loadCredentials() {
  if (credentials) return credentials;
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    } else {
      console.warn('Google credentials file not found at', CREDENTIALS_PATH);
      credentials = null;
    }
  } catch (err) {
    console.error('Failed to load Google credentials:', err.message);
    credentials = null;
  }
  return credentials;
}

function getCalendarClient() {
  const creds = loadCredentials();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!creds || !calendarId) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

exports.getCalendarClient = getCalendarClient;

exports.getEvents = async (req, res) => {
  try {
    const calendar = getCalendarClient();
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
    const response = await calendar.events.list(params);
    let events = response.data.items;
    if (room) {
      events = events.filter(e => (e.summary && e.summary.includes(room)) || (e.description && e.description.includes(room)));
    }
    res.json(events);
  } catch (error) {
    console.error('Calendar events fetch failed:', error.response?.data || error.message || error);
    res.status(500).json({
      message: 'Error fetching calendar events',
      error: error.message,
      code: error.code || error.status || error?.response?.status,
      details: error?.response?.data || null,
    });
  }
};

exports.syncCalendar = async (req, res) => {
  try {
    res.json({ message: 'Calendar sync triggered (implement logic as needed)' });
  } catch (error) {
    res.status(500).json({ message: 'Error syncing calendar', error: error.message });
  }
};
