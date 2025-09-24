const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function normalisePrivateKey(key) {
  if (typeof key !== 'string') return key;
  return key.replace(/\\n/g, '\n');
}

function buildCredentialsFromFields(emailKey, keyKey) {
  const clientEmail = process.env[emailKey];
  const privateKey = process.env[keyKey];
  if (!clientEmail || !privateKey) return null;
  const creds = {
    client_email: clientEmail,
    private_key: normalisePrivateKey(privateKey),
  };
  const optionalFields = {
    type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE,
    project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
    private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    token_uri: process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI,
    auth_uri: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL,
    client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
    client_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL,
    universe_domain: process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN,
  };
  Object.entries(optionalFields).forEach(([field, value]) => {
    if (value) creds[field] = value;
  });
  return creds;
}

function tryParseCredentials(raw) {
  if (!raw) return null;
  const candidates = [];
  const trimmed = raw.trim();
  candidates.push(trimmed);
  if (!trimmed.startsWith('{')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      candidates.push(decoded.trim());
    } catch (_) {}
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.private_key) {
        parsed.private_key = normalisePrivateKey(parsed.private_key);
      }
      return parsed;
    } catch (_) {}
  }
  return null;
}

function loadCredentials() {
  const envKeys = [
    'GOOGLE_CALENDAR_CREDENTIALS',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_SERVICE_ACCOUNT'
  ];

  for (const key of envKeys) {
    const value = process.env[key];
    if (!value) continue;
    const parsed = tryParseCredentials(value);
    if (parsed) return parsed;
  }

  const fieldCombos = [
    ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'],
    ['GOOGLE_CALENDAR_CLIENT_EMAIL', 'GOOGLE_CALENDAR_PRIVATE_KEY'],
    ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY'],
  ];
  for (const [emailKey, keyKey] of fieldCombos) {
    const creds = buildCredentialsFromFields(emailKey, keyKey);
    if (creds) return creds;
  }

  return null;
}

const credentials = loadCredentials();
const GENERATED_CREDENTIALS_PATH = path.join(__dirname, '../config/google-credentials.json');

function persistCredentialsFile(creds) {
  if (!creds) return;
  try {
    fs.mkdirSync(path.dirname(GENERATED_CREDENTIALS_PATH), { recursive: true });
    fs.writeFileSync(GENERATED_CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = GENERATED_CREDENTIALS_PATH;
    }
  } catch (err) {
    console.warn('Failed to persist Google credentials file:', err.message);
  }
}

persistCredentialsFile(credentials);

function buildJwtCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  const auth = new google.auth.JWT(
    email,
    undefined,
    normalisePrivateKey(rawKey),
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

// Helper to get Google Calendar client (service account example)
function getCalendarClient() {
  if (!process.env.GOOGLE_CALENDAR_ID) return null;

  const jwtClient = buildJwtCalendarClient();
  if (jwtClient) return jwtClient;

  if (!credentials) {
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
    console.error('Calendar events fetch failed:', error.response?.data || error.message || error);
    res.status(500).json({
      message: 'Error fetching calendar events',
      error: error.message,
      code: error.code || error.status || error?.response?.status,
      details: error?.response?.data || null,
    });
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
