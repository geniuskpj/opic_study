/* keepawake.js — stop the phone from sleeping (and the browser from muting the mic) while recording.
 *
 * Why this matters: when the screen locks, browsers suspend the page — Chrome mutes getUserMedia
 * tracks and MediaRecorder stops receiving audio, which is the "recording is muted after the screen
 * goes off" bug. The Screen Wake Lock API prevents the lock in the first place; where it is missing
 * (older iOS Safari) a looping silent audio element keeps the device awake the way NoSleep does.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

export async function holdScreen() {
  let sentinel = null;
  let audio = null;
  let released = false;

  /* 1. screen wake lock (Chrome/Edge/Safari 16.4+) */
  try {
    if (navigator.wakeLock && navigator.wakeLock.request) {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener?.('release', () => { sentinel = null; });
    }
  } catch (e) { sentinel = null; }

  /* 2. fallback: an inaudible looping clip keeps the page "playing audio" */
  if (!sentinel) {
    try {
      audio = new Audio(SILENT_WAV);
      audio.loop = true;
      audio.volume = 0.001;
      audio.setAttribute('playsinline', '');
      await audio.play();
    } catch (e) { audio = null; }
  }

  /* 3. re-acquire after the tab becomes visible again (locks are dropped on hide) */
  const onVisible = () => {
    if (released) return;
    if (!sentinel && document.visibilityState === 'visible' && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then((s) => { sentinel = s; }).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    kind: sentinel ? 'wakeLock' : audio ? 'silentAudio' : 'none',
    release() {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { sentinel && sentinel.release && sentinel.release(); } catch (e) { /* ignore */ }
      try { audio && audio.pause(); } catch (e) { /* ignore */ }
      sentinel = null; audio = null;
    },
  };
}

/** Is the page currently hidden (phone locked / app switched)? */
export const pageHidden = () => document.visibilityState !== 'visible';
