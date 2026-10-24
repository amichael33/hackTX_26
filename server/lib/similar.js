// "Similar Finds": ask the LLM for two shopping searches near the main one.
const SYSTEM =
  'You help a shopper discover alternatives. Given their main shopping search and some titles of what it found, return exactly 2 shopping searches that are similar to the main query but not the same product, for example a different style, brand or form factor. Each is a short search phrase.';

export const SIMILAR_SCHEMA = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string', description: 'A short shopping search phrase.' } },
  },
  required: ['queries'],
};

export async function generateSimilarQueries({ query, titles }, llm) {
  try {
    if (typeof llm !== 'function') throw new Error('no llm configured');
    const raw = await llm({
      system: SYSTEM,
      messages: [{ role: 'user', text: JSON.stringify({ query: query?.query ?? '', titles: titles ?? [] }) }],
      schema: SIMILAR_SCHEMA,
    });
    const seen = new Set([query?.query, ...(query?.extra_queries ?? [])].map((q) => String(q ?? '').trim().toLowerCase()));
    const out = [];
    for (const q of Array.isArray(raw?.queries) ? raw.queries : []) {
      const t = typeof q === 'string' ? q.trim() : '';
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
    return out.slice(0, 2);
  } catch (err) {
    console.error('generateSimilarQueries failed:', err.message);
    return [];
  }
}
