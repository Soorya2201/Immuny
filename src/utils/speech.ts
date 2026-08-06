// Thin wrapper over the Web Speech synthesis API used by the voice logger so
// Bea can read her questions out loud and the flow can start listening again
// the moment she stops talking (speaking into the mic while it's open would
// otherwise feed her own voice back into the transcript).

let cachedVoice: SpeechSynthesisVoice | null = null;

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;   // not loaded yet; onvoiceschanged will fire
  cachedVoice =
    voices.find(v => v.name === 'Google UK English Female') ??
    voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female')) ??
    voices.find(v => v.lang.startsWith('en-')) ??
    voices[0] ??
    null;
  return cachedVoice;
}

/** Warms up the voice list — Chrome populates it asynchronously. */
export function primeVoices(): void {
  if (!ttsSupported()) return;
  pickVoice();
  window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; pickVoice(); };
}

export function cancelSpeech(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/**
 * Speaks `text` and resolves when it finishes (or immediately if speech isn't
 * available or is muted), so callers can chain "ask → listen" reliably.
 */
export function speak(text: string, opts: { muted?: boolean } = {}): Promise<void> {
  if (opts.muted || !ttsSupported()) return Promise.resolve();
  return new Promise(resolve => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 400));
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 1.05;
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    u.onend = done;
    u.onerror = done;
    // Safari occasionally drops onend; don't strand the conversation if it does.
    setTimeout(done, Math.min(12_000, 900 + text.length * 90));
    window.speechSynthesis.speak(u);
  });
}
