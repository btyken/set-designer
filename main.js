// B-roll Production Tools: starts both tools and switches between them.
//   Set Designer   (#set-designer, the default)  set-designer/
//   Shoot Dashboard (#shoots)                      shoot-dashboard/
import { $ } from './shared/dom.js';
import { passGate } from './shared/gate.js';
import { initLightbox, openLightbox } from './shared/lightbox.js';
import { initSetDesigner, showSetDesigner } from './set-designer/app.js';
import { initDashboard, showDashboard, pinImage, canPin } from './shoot-dashboard/dashboard.js';
import { tracker, tokenFor } from './shoot-dashboard/tracker.js';

const TOOLS = {
  'set-designer': { hash: '', show: showSetDesigner },
  shoots: { hash: '#shoots', show: showDashboard },
};
let current = null;

function showTool(name) {
  if (!TOOLS[name]) name = 'set-designer';
  const changed = current !== name;
  current = name;
  for (const key of Object.keys(TOOLS)) $(`tool-${key}`).hidden = key !== name;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === name));
  document.body.dataset.tool = name;
  const hash = TOOLS[name].hash;
  if (location.hash !== hash && !(name === 'set-designer' && location.hash === '#set-designer')) {
    history.replaceState(null, '', location.pathname + location.search + hash);
  }
  if (changed) window.scrollTo(0, 0);
  TOOLS[name].show();
}

async function boot() {
  // The team passcode also unlocks the tracker, so nobody has to type it twice.
  await passGate({ onUnlock: async (pass) => { if (!tracker.token) tracker.setToken(await tokenFor(pass)); } });
  initLightbox();
  initDashboard({ openLightbox });
  await initSetDesigner({
    openLightbox,
    // A sample frame can go straight onto a shoot's moodboard.
    pinToShoot: (url, note) => (canPin() ? () => pinImage(url, note) : null),
  });
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => showTool(b.dataset.tool));
  window.addEventListener('hashchange', () => showTool(location.hash === '#shoots' ? 'shoots' : 'set-designer'));
  showTool(location.hash === '#shoots' ? 'shoots' : 'set-designer');
}

boot();
