// Full-screen picture viewer shared by both tools, plus phone share-sheet helpers.
import { $ } from './dom.js';

export const onPhone = () => matchMedia('(pointer: coarse)').matches;

/** Opens the phone share sheet for an image (save to Photos, send in chat). False if unsupported. */
export async function shareImage(url, filename, title) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], filename, { type: blob.type });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    return err?.name === 'AbortError'; // closing the sheet is not a failure
  }
}

const close = () => { $('lightbox').hidden = true; };

export function initLightbox() {
  $('lbClose').addEventListener('click', close);
  $('lightbox').addEventListener('click', (e) => { if (e.target === $('lightbox')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/**
 * Show a picture. `shot` is { name, url }. Options:
 *  - onPin:    adds a "Pin to a shoot" button that runs this
 *  - onDelete: adds a "Remove" button; return true from it to close the viewer
 */
export function openLightbox(shot, name, opts = {}) {
  $('lbPin').hidden = !opts.onPin;
  $('lbPin').onclick = () => { close(); opts.onPin(); };
  $('lbDel').hidden = !opts.onDelete;
  $('lbDel').onclick = async () => { if (await opts.onDelete()) close(); };
  $('lbTitle').textContent = shot.name;
  $('lbImg').src = shot.url;
  $('lbImg').alt = shot.alt || shot.name;
  $('lbSave').href = shot.url;
  const file = `${name}-${shot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.jpg`;
  $('lbSave').download = file;
  $('lbShare').hidden = !(onPhone() && navigator.canShare);
  $('lbShare').onclick = async () => { if (!(await shareImage(shot.url, file, shot.name))) $('lbSave').click(); };
  $('lightbox').hidden = false;
}
