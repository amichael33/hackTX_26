// Pure text helpers. No DOM.

export function splitSentences(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const money = (min, max) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: min, maximumFractionDigits: max,
});

export function formatPrice(n) {
  const whole = Number.isInteger(n);
  return (whole && n >= 100 ? money(0, 0) : money(2, 2)).format(n);
}

// "4.6" for a rating out of 5, or '' when the product has none (no rating sticker then).
export function formatRating(r) {
  const n = Number(r);
  return r == null || r === '' || !Number.isFinite(n) || n <= 0 ? '' : (Math.round(Math.min(5, n) * 10) / 10).toFixed(1);
}

export const DEFAULT_CITY = 'Austin, Texas, United States';

// Trim and collapse whitespace; empty input falls back to the default city.
export function normalizeTypedLocation(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t || DEFAULT_CITY;
}

// Relative time for the Past searches list.
export function timeAgo(ms, now = Date.now()) {
  const s = (now - ms) / 1000;
  if (!(s >= 60)) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
