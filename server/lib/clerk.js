export const MAX_TURNS = 4;

const BASE_PROMPT =
  "You're a friendly store clerk. Keep replies to 1-2 short sentences. Ask at most 2-3 questions. When you know what the shopper wants, set ready to true. If ready is true, reply_to_player must be a one-sentence handoff like 'Great, let me pull some options for you!' and must NOT contain a question. If you still need info, set ready to false and ask. extra_queries are 0-2 related categories or accessories for a 'You might also need' shelf (e.g. a keyboard -> 'keycaps', 'wrist rest'; an apple watch -> 'apple watch band'); never the main query or a rewording of it.";
const LAST_TURN = 'This is the last turn: you MUST set ready to true and fill query.';
const HANDOFF_REPLY = 'Great, let me pull some options for you!';
const FALLBACK_REPLY = "Sorry, I didn't catch that. What are you looking for?";

export const CLERK_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean', description: 'True only when the need is clear and the search should start now.' },
    query: { type: 'string', description: 'Shopping search query for the main product. Required when ready is true.' },
    min_price: { type: 'number', nullable: true, description: 'Minimum price in dollars, or null.' },
    max_price: { type: 'number', nullable: true, description: 'Maximum price in dollars, or null.' },
    preferences: { type: 'array', items: { type: 'string' }, description: 'Short preference keywords such as wireless or quiet.' },
    extra_queries: { type: 'array', items: { type: 'string' }, description: '0-2 related categories or accessories for a You might also need shelf (keyboard -> keycaps, wrist rest). Never the main query or a rewording of it.' },
    reply_to_player: { type: 'string', description: '1-2 short sentences. If ready is true: a one-sentence handoff with no question.' },
  },
  required: ['reply_to_player', 'ready'],
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strings(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
}

function relatedQueries(v, query) {
  const seen = new Set([query.toLowerCase()]);
  const out = [];
  for (const s of strings(v)) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 2);
}

function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const query = typeof r.query === 'string' ? r.query.trim() : '';
  const ready = r.ready === true && query !== '';
  let reply =
    typeof r.reply_to_player === 'string' && r.reply_to_player.trim()
      ? r.reply_to_player.trim()
      : FALLBACK_REPLY;
  if (ready && reply.includes('?')) reply = HANDOFF_REPLY;
  return {
    ready,
    query,
    min_price: num(r.min_price),
    max_price: num(r.max_price),
    preferences: strings(r.preferences),
    extra_queries: relatedQueries(r.extra_queries, query),
    reply_to_player: reply,
  };
}

export async function chatTurn({ messages, location } = {}, llm) {
  const msgs = Array.isArray(messages) ? messages : [];
  const userCount = msgs.filter((m) => m && m.role === 'user').length;
  let system = BASE_PROMPT;
  if (location && typeof location.city === 'string' && location.city) {
    system += ` The shopper is in ${location.city}.`;
  }
  if (userCount >= MAX_TURNS) system += ` ${LAST_TURN}`;
  try {
    if (typeof llm !== 'function') throw new Error('no llm configured');
    return normalize(await llm({ system, messages: msgs, schema: CLERK_SCHEMA }));
  } catch (err) {
    console.error('chatTurn failed:', err.message);
    return normalize({ ready: false, reply_to_player: FALLBACK_REPLY });
  }
}
