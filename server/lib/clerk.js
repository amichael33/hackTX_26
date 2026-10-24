export const MAX_TURNS = 4;

const BASE_PROMPT =
  "You're a friendly store clerk. Keep replies to 1-2 short sentences. Ask at most 2-3 questions. When you know what the shopper wants, set ready to true.";
const LAST_TURN = 'This is the last turn: you MUST set ready to true and fill query.';
const FALLBACK_REPLY = "Sorry, I didn't catch that. What are you looking for?";

export const CLERK_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    query: { type: 'string' },
    min_price: { type: 'number', nullable: true },
    max_price: { type: 'number', nullable: true },
    preferences: { type: 'array', items: { type: 'string' } },
    extra_queries: { type: 'array', items: { type: 'string' } },
    reply_to_player: { type: 'string' },
  },
  required: ['reply_to_player', 'ready'],
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strings(v, max) {
  if (!Array.isArray(v)) return [];
  const out = v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
  return max ? out.slice(0, max) : out;
}

function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const query = typeof r.query === 'string' ? r.query.trim() : '';
  return {
    ready: r.ready === true && query !== '',
    query,
    min_price: num(r.min_price),
    max_price: num(r.max_price),
    preferences: strings(r.preferences),
    extra_queries: strings(r.extra_queries, 2),
    reply_to_player:
      typeof r.reply_to_player === 'string' && r.reply_to_player.trim()
        ? r.reply_to_player.trim()
        : FALLBACK_REPLY,
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
