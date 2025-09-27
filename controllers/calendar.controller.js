const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const CREDENTIALS_PATH = path.join(__dirname, '../config/google-credentials.json');
let cachedCredentials = null;

function normalisePrivateKey(key) {
  if (typeof key !== 'string') return key;
  return key.replace(/\\n/g, '\n');
}

function loadCredentials() {
  if (cachedCredentials) return cachedCredentials;
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
      cachedCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      return cachedCredentials;
    } catch (err) {
      console.error('Failed to load Google credentials file:', err.message);
    }
  }

  const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      cachedCredentials = JSON.parse(envJson);
      persistCredentialsFile(cachedCredentials);
      return cachedCredentials;
    } catch (err) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!privateKey && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64) {
    try {
      privateKey = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64, 'base64').toString('utf8');
    } catch (err) {
      console.error('Failed to decode GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64:', err.message);
    }
  }
  if (email && privateKey) {
    cachedCredentials = {
      type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
      project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
      private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
      private_key: normalisePrivateKey(privateKey),
      client_email: email,
      client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
      auth_uri: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL,
      universe_domain: process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN || 'googleapis.com',
    };
    persistCredentialsFile(cachedCredentials);
    return cachedCredentials;
  }

  console.warn('Google credentials not found. Provide config/google-credentials.json or service account env vars.');
  return null;
}

function persistCredentialsFile(creds) {
  if (!creds) return;
  try {
    fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist Google credentials file:', err.message);
  }
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
