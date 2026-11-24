// Team passcode gate for the static site. It keeps casual visitors out; it is not real security.
import { $ } from './dom.js';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolves once the right passcode is entered. `onUnlock(passcode)` runs first, for anything else it unlocks. */
export function passGate({ onUnlock } = {}) {
  const want = window.SD_CONFIG?.passHash;
  if (!want) return Promise.resolve();
  try {
    if (localStorage.getItem('sd-pass') === want) return Promise.resolve();
  } catch { /* fall through to the form */ }
  return new Promise((resolve) => {
    $('gate').hidden = false;
    $('gateInput').focus();
    $('gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = $('gateInput').value.trim();
      if ((await sha256(pass)) === want) {
        try { localStorage.setItem('sd-pass', want); } catch { /* not remembered */ }
        await onUnlock?.(pass);
        $('gate').hidden = true;
        resolve();
      } else {
        $('gateMsg').textContent = 'That passcode is not right. Check with the team and try again.';
        $('gateInput').select();
      }
    });
  });
}
