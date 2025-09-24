Google Calendar Integration (Service Account)

Overview
- Uses a Google service account via `googleapis` to sync bookings to a shared Google Calendar.
- On create/update/delete of a booking, an event is inserted/updated/removed in Google Calendar.
- Client has a Calendar page to view events and trigger a manual sync action.

Setup
1) Enable API: In Google Cloud Console, enable the "Google Calendar API" for your project.
2) Service Account: Create a service account and a JSON key. Download the key.
3) Share Calendar: In Google Calendar UI, share the target calendar with the service account's email ("Make changes to events").
4) Env Vars: In `server/.env`, provide the service account credentials and calendar metadata. Pick one of:
 - `GOOGLE_SERVICE_ACCOUNT_JSON` set to the raw JSON (or base64-encoded JSON) for the service account key, **or**
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (use `\n` for newlines inside the private key).
  - Optional aliases: `GOOGLE_CALENDAR_CREDENTIALS` or `GOOGLE_CLIENT_EMAIL`/`GOOGLE_PRIVATE_KEY` are also accepted.
  - Optional metadata envs (used to mirror the JSON file) are supported: `GOOGLE_SERVICE_ACCOUNT_TYPE`, `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID`, `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID`, `GOOGLE_SERVICE_ACCOUNT_AUTH_URI`, `GOOGLE_SERVICE_ACCOUNT_TOKEN_URI`, `GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL`, `GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL`, `GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN`.
  - Always set `GOOGLE_CALENDAR_ID` to the calendar's ID (e.g., `your@gmail.com` or `abc123@group.calendar.google.com`).
  - Optional: `GOOGLE_CALENDAR_TZ` (default `UTC`).
5) Restart the server.

Runtime Notes
- If credentials are provided via env vars, the server now materialises `config/google-credentials.json` on startup (and exports its path via `GOOGLE_APPLICATION_CREDENTIALS` when unset) so file-based tools keep working without committing sensitive JSON to git.

Behavior
- Creates events for bookings with start/end times.
- Derives titles and descriptions from the booking (room/equipment/class and client when available).
- If a class booking has no end time, it uses the class `sessionLength` (or 60 minutes by default).
- Updates events on booking changes; removes events on cancel/delete.

Troubleshooting
- If events do not appear, verify the service account has access, `GOOGLE_CALENDAR_ID` is correct, and the credentials env vars are present at runtime.
- Check server logs for warnings from the calendar sync helper.
