// Small DOM helpers shared by the app's screens.

export const $ = (id) => document.getElementById(id);

/** Tiny element builder. Text always goes in as text nodes, never as HTML. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

/** A bottom sheet (a dialog on wide screens). Returns a close function. */
export function openSheet(label, ...content) {
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('div', { class: 'sheet-in' }, ...content));
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  box.querySelector('input, select, textarea, button')?.focus();
  return close;
}
