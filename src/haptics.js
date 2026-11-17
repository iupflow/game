// Vibration feedback.
// Store build: the Capacitor Haptics plugin (real Taptic Engine / vibrator).
import { Capacitor } from '@capacitor/core';
import { Haptics as NativeHaptics } from '@capacitor/haptics';

const NATIVE = Capacitor.isNativePlatform();
// Android browsers: navigator.vibrate.
// iOS Safari has no vibration API; toggling a hidden "switch" checkbox makes the
// system play a light tick on recent iOS versions, so that is used as a fallback.

let label = null;
let last = 0;

function iosTick() {
  if (!label) {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
  }
  label.click();
}

const NATIVE_STYLE = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
const VIBRATE_MS = { light: 10, medium: 22, heavy: 40 };

function fire(level) {
  const now = performance.now();
  if (now - last < 35) return;
  last = now;
  try {
    if (NATIVE) {
      NativeHaptics.impact({ style: NATIVE_STYLE[level] }).catch(() => {});
    } else if (navigator.vibrate) {
      navigator.vibrate(VIBRATE_MS[level]);
    } else {
      iosTick();
      if (level !== 'light') setTimeout(iosTick, 70);
      if (level === 'heavy') setTimeout(iosTick, 140);
    }
  } catch {
    /* haptics are optional */
  }
}

export const Haptics = {
  light: () => fire('light'),
  medium: () => fire('medium'),
  heavy: () => fire('heavy'),
  /** Merge feedback grows with the size of the jelly that was made. */
  merge(tier) {
    fire(tier >= 6 ? 'heavy' : tier >= 3 ? 'medium' : 'light');
  },
  success() {
    fire('heavy');
    setTimeout(() => {
      last = 0;
      fire('medium');
    }, 120);
    setTimeout(() => {
      last = 0;
      fire('heavy');
    }, 240);
  },
};
