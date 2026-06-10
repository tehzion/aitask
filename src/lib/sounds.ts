/**
 * Sound engine using Web Audio API.
 * Generates notification tones synthetically — no audio files required.
 */

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
};

/** Resume context after user gesture (required by browsers) */
export const resumeAudio = async () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
};

const playTone = (
  frequency: number,
  startTime: number,
  duration: number,
  gainPeak: number,
  ctx: AudioContext
) => {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
};

/** 
 * Soft two-note chime — used for new notifications.
 */
export const playNotificationChime = async () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  await resumeAudio();

  const now = ctx.currentTime;
  // Two ascending notes: E5 → G#5
  playTone(659.25, now,        0.35, 0.18, ctx);
  playTone(830.61, now + 0.18, 0.45, 0.14, ctx);
};

/**
 * Subtle single ping — used for less important events.
 */
export const playSubtlePing = async () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  await resumeAudio();

  const now = ctx.currentTime;
  playTone(880, now, 0.3, 0.12, ctx);
};

/**
 * Success arpeggio — used for task completions / approvals.
 */
export const playSuccessSound = async () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  await resumeAudio();

  const now = ctx.currentTime;
  // C5 → E5 → G5
  playTone(523.25, now,        0.25, 0.15, ctx);
  playTone(659.25, now + 0.12, 0.25, 0.13, ctx);
  playTone(783.99, now + 0.24, 0.40, 0.12, ctx);
};

/** Sound preference key in localStorage */
const SOUND_PREF_KEY = 'aitask_sound_enabled';

export const getSoundEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored === null ? true : stored === 'true'; // default ON
  } catch {
    return true;
  }
};

export const setSoundEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {
    // ignore
  }
};

/** Play appropriate sound based on notification iconType, if sounds are enabled */
export const playNotificationSound = async (iconType?: string) => {
  if (!getSoundEnabled()) return;

  switch (iconType) {
    case 'success':
      await playSuccessSound();
      break;
    case 'task':
      await playNotificationChime();
      break;
    default:
      await playSubtlePing();
      break;
  }
};
