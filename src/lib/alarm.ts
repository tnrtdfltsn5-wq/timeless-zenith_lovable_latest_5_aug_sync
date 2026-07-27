/**
 * Background-capable alarm helpers.
 *
 * Mobile browsers throttle WebAudio and JS timers when the screen is off, and
 * silently drop AudioContext beeps. The reliable trick is to keep a silent
 * looping <audio> element playing (started from a user gesture) so the tab
 * stays an active media session, then play a real tone element for alerts.
 * A screen wake lock is also requested while the timer runs.
 */

function makeWav(freq: number, seconds: number, volume = 0.6): string {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const bytes = 44 + samples * 2;
  const buf = new ArrayBuffer(bytes);
  const view = new DataView(buf);
  const w = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  w(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    // gentle envelope so it doesn't click
    const env = Math.min(1, t * 20) * Math.min(1, (seconds - t) * 8);
    const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t);
    const v = Math.sin(2 * Math.PI * freq * t) * env * pulse * volume;
    view.setInt16(44 + i * 2, v * 32767, true);
  }
  let binary = "";
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let silentEl: HTMLAudioElement | null = null;
let toneEl: HTMLAudioElement | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;

function silentSrc() {
  return makeWav(1, 1, 0.0001);
}

/** Call from a user gesture (start button) to unlock background audio. */
export function primeAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!silentEl) {
      silentEl = new Audio(silentSrc());
      silentEl.loop = true;
      silentEl.volume = 0.01;
    }
    void silentEl.play().catch(() => {});
    if (!toneEl) {
      toneEl = new Audio(makeWav(880, 2.2, 0.7));
      toneEl.volume = 1;
      // warm up the element so later plays don't need a gesture
      toneEl.muted = true;
      void toneEl
        .play()
        .then(() => {
          toneEl!.pause();
          toneEl!.currentTime = 0;
          toneEl!.muted = false;
        })
        .catch(() => {
          toneEl!.muted = false;
        });
    }
  } catch {
    /* ignore */
  }
}

export function stopBackgroundAudio() {
  silentEl?.pause();
}

export function playAlert(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    if (!toneEl) toneEl = new Audio(makeWav(880, 2.2, 0.7));
    toneEl.currentTime = 0;
    void toneEl.play().catch(() => {});
  } catch {
    /* ignore */
  }
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);
}

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, silent: false });
    }
  } catch {
    /* ignore */
  }
}

export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export async function requestWakeLock() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && !wakeLock) {
      wakeLock = await nav.wakeLock.request("screen");
    }
  } catch {
    /* ignore */
  }
}

export async function releaseWakeLock() {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

export function haptic(pattern: number | number[] = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
}
