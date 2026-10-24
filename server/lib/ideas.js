// "Try Next" post-its: Gemini suggests follow-up searches. No SerpApi calls; only the LLM.
const SYSTEM =
  "You help a shopper in a toy store decide what to look for next. Given what they just searched for (and a few titles of what turned up), suggest 8 short follow-up shopping searches: accessories, things that go with it, and close alternatives. Each is 1-4 words, plain, no brand-new product categories unrelated to the search. Example: for 'gaming mouse' -> 'mouse pad', 'gaming keyboard', 'wrist rest', 'mouse bungee'.";

export const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: { type: 'array', items: { type: 'string', description: 'A short follow-up search, 1-4 words.' } },
  },
  required: ['ideas'],
};

export const MAX_IDEAS = 8;
const MAX_LEN = 40;

// Trim, drop empties and duplicates (also of the query itself), cap length and count.
export function cleanIdeas(raw, query) {
  const seen = new Set([query?.query, ...(query?.extra_queries ?? [])].map((q) => String(q ?? '').trim().toLowerCase()));
  const out = [];
  for (const i of Array.isArray(raw) ? raw : []) {
    const t = typeof i === 'string' ? i.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN) : '';
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_IDEAS);
}

export async function generateIdeas({ query, titles }, llm) {
  try {
    if (typeof llm !== 'function') throw new Error('no llm configured');
    const raw = await llm({
      system: SYSTEM,
      messages: [{ role: 'user', text: JSON.stringify({ query: query?.query ?? '', titles: titles ?? [] }) }],
      schema: IDEAS_SCHEMA,
    });
    return cleanIdeas(raw?.ideas, query);
  } catch (err) {
    console.error('generateIdeas failed:', err.message);
    return [];
  }
}
