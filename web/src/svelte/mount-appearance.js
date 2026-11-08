// Svelte island lifecycle for the Appearance settings section (spike).
//
// The island takes over the existing #settings-appearance node and stashes the
// legacy markup, so `?legacy-appearance=1`, a mount failure, or the raw-module
// dev server (`DEV=true`, no Vite transform) all fall back to the untouched
// renderer.
//
// Both the `svelte` runtime and the component are imported dynamically: the Go
// dev server hands web/src/*.js to the browser as raw ES modules, where bare
// specifiers and .svelte files cannot be resolved. In that mode the island is
// simply skipped.

let instance = null;
let hostEl = null;
let stashEl = null;
let token = 0;
let svelteUnmount = null;

function legacyRequested() {
  try {
    return new URLSearchParams(window.location.search).get('legacy-appearance') === '1';
  } catch (e) {
    return false;
  }
}

function viteAvailable() {
  try {
    return typeof import.meta.env !== 'undefined';
  } catch (e) {
    return false;
  }
}

export function isAppearanceIslandActive() {
  return instance !== null;
}

export async function mountAppearanceIsland() {
  if (instance || legacyRequested() || !viteAvailable()) return;
  const host = document.getElementById('settings-appearance');
  if (!host) return;

  const myToken = ++token;
  hostEl = host;
  stashEl = document.createDocumentFragment();
  while (host.firstChild) stashEl.appendChild(host.firstChild);

  const target = document.createElement('div');
  target.dataset.island = 'appearance';
  host.appendChild(target);

  try {
    const [svelte, mod] = await Promise.all([
      import('svelte'),
      import('./SettingsAppearance.svelte'),
    ]);
    if (myToken !== token) return;
    svelteUnmount = svelte.unmount;
    instance = svelte.mount(mod.default, { target });
  } catch (e) {
    // Fall back to the legacy renderer rather than leaving an empty section.
    if (myToken !== token) return;
    target.remove();
    if (stashEl && hostEl) {
      while (stashEl.firstChild) hostEl.appendChild(stashEl.firstChild);
    }
    stashEl = null;
    hostEl = null;
  }
}

export function unmountAppearanceIsland() {
  if (!instance) return;
  token += 1;
  if (svelteUnmount) svelteUnmount(instance);
  instance = null;

  const target = hostEl && hostEl.querySelector('[data-island="appearance"]');
  if (target) target.remove();
  if (stashEl && hostEl) {
    while (stashEl.firstChild) hostEl.appendChild(stashEl.firstChild);
  }
  stashEl = null;
  hostEl = null;
}

window.mountAppearanceIsland = mountAppearanceIsland;
window.unmountAppearanceIsland = unmountAppearanceIsland;
window.isAppearanceIslandActive = isAppearanceIslandActive;
