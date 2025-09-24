Google Calendar Integration (Service Account)

Overview
- Uses a Google service account via `googleapis` to sync bookings to a shared Google Calendar.
- On create/update/delete of a booking, an event is inserted/updated/removed in Google Calendar.
- Client has a Calendar page to view events and trigger a manual sync action.

Setup
1) Enable API: In Google Cloud Console, enable the "Google Calendar API" for your project.
2) Service Account: Create a service account and download a JSON key.
3) Place Credentials: Save the JSON key at `wavetable-server/config/google-credentials.json`.
4) Share Calendar: In Google Calendar, share the target calendar with the service account email ("Make changes to events").
5) Env Vars: In `.env`, set:
   - `GOOGLE_CALENDAR_ID` to the calendar's ID (e.g., `your@gmail.com` or `abc123@group.calendar.google.com`).
   - Optional: `GOOGLE_CALENDAR_TZ` (default `UTC`).
6) Restart the server.

Behavior
- Creates events for bookings with start/end times.
- Derives titles and descriptions from the booking (room/equipment/class and client when available).
- If a class booking has no end time, it uses the class `sessionLength` (or 60 minutes by default).
- Updates events on booking changes; removes events on cancel/delete.

Troubleshooting
- If events do not appear, verify the service account has access and `GOOGLE_CALENDAR_ID` is correct.
- Check server logs for warnings from the calendar sync helper.
