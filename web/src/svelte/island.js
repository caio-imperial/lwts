// Shared Svelte island lifecycle for settings sections (spike).
//
// An island takes over an existing settings-section node and stashes the legacy
// markup, so `?legacy-<section>=1`, a mount failure, or the raw-module dev
// server (`DEV=true`, no Vite transform) all fall back to the untouched
// renderer.
//
// Both the `svelte` runtime and the component are imported dynamically: the Go
// dev server hands web/src/*.js to the browser as raw ES modules, where bare
// specifiers and .svelte files cannot be resolved. In that mode the island is
// simply skipped.
//
// `createIsland({ id, sectionId, legacyParam, load })` returns
// `{ mount, unmount, isActive }`; `onFallback` (optional) runs after a failed
// dynamic import once the legacy markup is back in the document.

export function createIsland({ id, sectionId, legacyParam, load, onFallback }) {
  let instance = null;
  let hostEl = null;
  let stashEl = null;
  let token = 0;
  let svelteUnmount = null;

  function legacyRequested() {
    try {
      return new URLSearchParams(window.location.search).get(legacyParam) === '1';
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

  function isActive() {
    return instance !== null;
  }

  async function mount() {
    if (instance || legacyRequested() || !viteAvailable()) return;
    const host = document.getElementById(sectionId);
    if (!host) return;

    const myToken = ++token;
    hostEl = host;
    stashEl = document.createDocumentFragment();
    while (host.firstChild) stashEl.appendChild(host.firstChild);

    const target = document.createElement('div');
    target.dataset.island = id;
    host.appendChild(target);

    try {
      const [svelte, mod] = await Promise.all([import('svelte'), load()]);
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
      if (typeof onFallback === 'function') onFallback();
    }
  }

  function unmount() {
    if (!instance) return;
    token += 1;
    if (svelteUnmount) svelteUnmount(instance);
    instance = null;

    const target = hostEl && hostEl.querySelector('[data-island="' + id + '"]');
    if (target) target.remove();
    if (stashEl && hostEl) {
      while (stashEl.firstChild) hostEl.appendChild(stashEl.firstChild);
    }
    stashEl = null;
    hostEl = null;
  }

  return { mount, unmount, isActive };
}
