const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function makeGeminiLlm(apiKey, model, fetchImpl = fetch) {
  return async function llm({ system, messages, schema }) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    const res = await fetchImpl(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === 'clerk' ? 'model' : 'user',
          parts: [{ text: m.text }],
        })),
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Gemini request failed with status ${res.status}`);
    const json = await res.json();
    return JSON.parse(json.candidates[0].content.parts[0].text);
  };
}
