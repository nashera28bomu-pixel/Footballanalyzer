// East African Time = UTC+3
const EAT_OFFSET = 3 * 60 * 60 * 1000; // 3 hours in ms

function toEAT(utcDateStr) {
  const date = new Date(utcDateStr);
  const eat = new Date(date.getTime() + EAT_OFFSET);
  return eat;
}

function formatMatchTime(utcDateStr) {
  const eat = toEAT(utcDateStr);
  const hours = eat.getUTCHours().toString().padStart(2, '0');
  const mins = eat.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${mins} EAT`;
}

function formatMatchDate(utcDateStr) {
  const eat = toEAT(utcDateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[eat.getUTCDay()];
  const date = eat.getUTCDate();
  const month = months[eat.getUTCMonth()];
  return `${day}, ${date} ${month}`;
}

function formatFullDateTime(utcDateStr) {
  return `${formatMatchDate(utcDateStr)} at ${formatMatchTime(utcDateStr)}`;
}

function isToday(utcDateStr) {
  const eat = toEAT(utcDateStr);
  const now = toEAT(new Date().toISOString());
  return (
    eat.getUTCFullYear() === now.getUTCFullYear() &&
    eat.getUTCMonth() === now.getUTCMonth() &&
    eat.getUTCDate() === now.getUTCDate()
  );
}

function isTomorrow(utcDateStr) {
  const eat = toEAT(utcDateStr);
  const now = toEAT(new Date().toISOString());
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return (
    eat.getUTCFullYear() === tomorrow.getUTCFullYear() &&
    eat.getUTCMonth() === tomorrow.getUTCMonth() &&
    eat.getUTCDate() === tomorrow.getUTCDate()
  );
}

function isYesterday(utcDateStr) {
  const eat = toEAT(utcDateStr);
  const now = toEAT(new Date().toISOString());
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return (
    eat.getUTCFullYear() === yesterday.getUTCFullYear() &&
    eat.getUTCMonth() === yesterday.getUTCMonth() &&
    eat.getUTCDate() === yesterday.getUTCDate()
  );
}

function statusLabel(status) {
  const map = {
    'SCHEDULED': '🕐 Upcoming',
    'TIMED': '🕐 Upcoming',
    'IN_PLAY': '🟢 LIVE',
    'PAUSED': '⏸ Half Time',
    'FINISHED': '✅ FT',
    'SUSPENDED': '⚠️ Suspended',
    'POSTPONED': '⏭ Postponed',
    'CANCELLED': '❌ Cancelled',
    'AWARDED': '🏆 Awarded'
  };
  return map[status] || status;
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = {
  toEAT,
  formatMatchTime,
  formatMatchDate,
  formatFullDateTime,
  isToday,
  isTomorrow,
  isYesterday,
  statusLabel,
  escapeMarkdown
};
