// Sender half of the usage measurement (receiver: scripts/usage-metrics.mjs). Browser-ready, no imports.
// One function is the whole interface, copied as-is into the published app once the owner approves:
//   trackScreen(screen, { version, send, storage?, today? }) -> event | null
//     Sends { id, day, version, screen } at most once per device, day and screen. The id is a random UUID
//     kept in storage (localStorage by default) and is the only thing that ties visits together.
//     `send(event)` is supplied by the caller (endpoint not decided yet; e.g. navigator.sendBeacon).
//     Never throws: blocked storage or a failing send (throws or returns false) returns null so measurement
//     cannot break the app; the screen is not marked sent, so the next visit retries.
//     `today` defaults to the device's local date (YYYY-MM-DD), the day a learner would call "today".
const ID_KEY = 'usage.id';
const SENT_KEY = 'usage.sent'; // { day, screens: [] } for the current day only

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function trackScreen(screen, { version, send, storage = globalThis.localStorage, today = localDay() }) {
  try {
    let id = storage.getItem(ID_KEY);
    if (!id) { id = crypto.randomUUID(); storage.setItem(ID_KEY, id); }
    let sent = JSON.parse(storage.getItem(SENT_KEY) || 'null');
    if (!sent || sent.day !== today) sent = { day: today, screens: [] };
    if (sent.screens.includes(screen)) return null;
    const event = { id, day: today, version, screen };
    if (send(event) === false) return null; // navigator.sendBeacon reports a refused queue as false
    sent.screens.push(screen);
    storage.setItem(SENT_KEY, JSON.stringify(sent));
    return event;
  } catch {
    return null;
  }
}
