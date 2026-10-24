// Clerk text-to-speech (SpeechSynthesis) and push-to-talk recognition (SpeechRecognition).
import { store } from './store.js';
import { splitSentences } from './text.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

let token = 0;          // bumped by cancelSpeech so stale callbacks are ignored
const live = new Set(); // keep utterances referenced (Chrome may GC them mid-speech)

// Voices load async in Chrome; touching getVoices + listening primes the list.
if (synth) {
  try {
    synth.getVoices();
    synth.addEventListener?.('voiceschanged', () => synth.getVoices());
  } catch (e) { /* ignore */ }
}

// R11 order: Google US English, Aria/Jenny, Microsoft Zira, first en-US, any en-*.
export function pickVoice(voices) {
  if (!voices || !voices.length) return null;
  return (
    voices.find((v) => v.name === 'Google US English') ||
    voices.find((v) => /aria|jenny/i.test(v.name) && /^en/i.test(v.lang || '')) ||
    voices.find((v) => /microsoft zira/i.test(v.name)) ||
    voices.find((v) => v.lang === 'en-US' || v.lang === 'en_US') ||
    voices.find((v) => /^en([-_]|$)/i.test(v.lang)) ||
    null
  );
}

export function cancelSpeech() {
  token++;
  live.clear();
  try { synth?.cancel(); } catch (e) { /* ignore */ }
}

// onStart fires when audio starts (or immediately when muted/unsupported);
// onEnd fires once after the last sentence. cancelSpeech() suppresses both.
export function speak(text, { onStart, onEnd } = {}) {
  const myToken = ++token;
  let ended = false;
  const done = () => {
    if (ended || myToken !== token) return;
    ended = true;
    onEnd?.();
  };
  const chunks = splitSentences(text);

  if (!synth || store.get().voice.ttsMuted || chunks.length === 0) {
    onStart?.();
    done();
    return;
  }

  try { synth.cancel(); } catch (e) { /* ignore */ }
  const voice = pickVoice(synth.getVoices()); // chosen at speak time
  let started = false;
  let i = 0;
  const markStarted = () => {
    if (!started && myToken === token) { started = true; onStart?.(); }
  };

  const next = () => {
    if (myToken !== token) return;
    if (i >= chunks.length) { done(); return; }
    const chunk = chunks[i++];
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
    live.add(u);
    let advanced = false;
    // Safety net: some engines never fire onend.
    const watchdog = setTimeout(() => advance(), 4000 + chunk.length * 120);
    function advance() {
      if (advanced) return;
      advanced = true;
      clearTimeout(watchdog);
      live.delete(u);
      next();
    }
    u.onstart = markStarted;
    u.onend = advance;
    u.onerror = advance;
    try { synth.speak(u); } catch (e) { advance(); }
  };

  // If audio never starts (blocked), still report start so the UI is not stuck.
  setTimeout(markStarted, 1500);
  next();
}

// Push-to-talk recognizer. Returns null when the browser has no SpeechRecognition (e.g. Firefox).
// onPartial(text): transcript so far (final + interim). onFinal(text): once per start(), when the
// utterance is final (or when recognition ends with unfinalized text). onError(code): SpeechRecognition error code.
// onEnd() (optional): recognition has fully ended. start() returns false if it did not start.
export function createRecognizer({ onPartial, onFinal, onError, onEnd } = {}) {
  const Ctor = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!Ctor) return null;
  let rec;
  try { rec = new Ctor(); } catch (e) { return null; }
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.continuous = false;

  let running = false;
  let transcript = '';
  let delivered = false;
  const deliver = () => {
    if (delivered) return;
    delivered = true;
    if (transcript.trim()) onFinal?.(transcript.trim());
  };

  rec.onresult = (e) => {
    let text = '';
    let isFinal = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) isFinal = true;
    }
    transcript = text;
    if (isFinal) deliver();
    else onPartial?.(text.trim());
  };
  rec.onerror = (e) => { onError?.(e.error); };
  rec.onend = () => {
    running = false;
    deliver();
    onEnd?.();
  };

  return {
    start() {
      if (running) return false;
      transcript = '';
      delivered = false;
      try { rec.start(); running = true; return true; } catch (e) { return false; /* InvalidStateError: already started */ }
    },
    stop() {
      if (!running) return;
      try { rec.stop(); } catch (e) { /* ignore */ }
    },
  };
}
