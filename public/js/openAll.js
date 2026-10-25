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

const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());

// Like openAll, but an item that carries a `page_token` goes straight to the seller instead of its Google Shopping link.
// Finding the seller takes a server round trip, and a pop-up is only allowed inside the click, so every tab is opened now
// (an item with a lookup opens blank) and the blank ones are pointed at the seller when `resolve(item)` answers.
// `resolve` may be null (demo pages: nothing to look up). It returns the seller's URL, or null/undefined to use the item's own link.
// Returns { total, opened, skipped } right away, plus `done`, which settles once every blank tab has been sent somewhere.
export function openAllToSellers(items, { open, resolve = null }) {
  const seen = new Set();
  const jobs = [];
  let total = 0, opened = 0, skipped = 0;
  const tryOpen = (url) => {
    let w = null;
    try { w = open(url, '_blank'); } catch (e) { w = null; }
    if (w) { opened++; try { w.opener = null; } catch (e) { /* cross-origin tab: nothing to clear */ } }
    return w;
  };
  for (const item of items ?? []) {
    const fallback = linkOf(item);
    const lookup = typeof resolve === 'function' && typeof item?.page_token === 'string' && item.page_token !== '';
    if (!fallback && !lookup) { skipped++; continue; }
    const key = lookup ? `t:${item.page_token}` : fallback;
    if (seen.has(key)) continue;
    seen.add(key);
    total++;
    if (!lookup) { tryOpen(fallback); continue; }
    const tab = tryOpen('about:blank');
    jobs.push(Promise.resolve().then(() => resolve(item)).catch(() => null).then((found) => {
      const url = isHttp(found) ? found.trim() : fallback;
      if (!tab) return;
      try { if (url) tab.location.href = url; else tab.close(); } catch (e) { /* the tab was closed or is unreachable */ }
    }));
  }
  return { total, opened, skipped, done: Promise.all(jobs).then(() => undefined) };
}
