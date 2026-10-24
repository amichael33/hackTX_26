// DEFAULT_CITY and normalizeTypedLocation live in public/js/text.js (single source of
// truth, since the browser can only import from the static root).
export { DEFAULT_CITY, normalizeTypedLocation } from '../../public/js/text.js';

export async function reverseGeocode(lat, lng, fetchImpl = fetch, timeoutMs = 4000) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lng}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'hacktx-store/1.0' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const a = (await res.json())?.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.county;
  if (!city) throw new Error('no city in geocode result');
  return [city, a.state, a.country].filter(Boolean).join(', ');
}
