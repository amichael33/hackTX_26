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

export const DEFAULT_CITY = 'Austin, Texas, United States';

// Trim and collapse whitespace; empty input falls back to the default city.
export function normalizeTypedLocation(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t || DEFAULT_CITY;
}
