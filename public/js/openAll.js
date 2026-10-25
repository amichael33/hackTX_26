// DOM-free: open every product in the cart in its own tab. `open` is window.open (or a fake in tests). Browsers only allow
// pop-ups from a click, and some let just the first tab through, so we count what was blocked and let the caller say so.
// An item's own link, else (demo stock has none) a shopping search for its title, so the button always has somewhere to go.
export function linkOf(i) {
  const link = typeof i?.link === 'string' ? i.link.trim() : '';
  if (/^https?:\/\//i.test(link)) return link;
  const title = typeof i?.title === 'string' ? i.title.trim() : '';
  return title ? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(title)}` : '';
}

export function linksOf(items) {
  const seen = new Set();
  const out = [];
  for (const i of items ?? []) {
    const link = linkOf(i);
    if (!link || seen.has(link)) continue;
    seen.add(link);
    out.push(link);
  }
  return out;
}

export function openAll(items, open) {
  const links = linksOf(items);
  let opened = 0;
  for (const url of links) {
    let w = null;
    try { w = open(url, '_blank'); } catch (e) { w = null; }
    if (w) { opened++; try { w.opener = null; } catch (e) { /* cross-origin tab: nothing to clear */ } } // not 'noopener': that makes open() return null even on success
  }
  return { total: links.length, opened, skipped: (items?.length ?? 0) - links.length };
}
