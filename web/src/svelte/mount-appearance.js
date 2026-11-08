// Svelte island lifecycle for the Appearance settings section (spike).
//
// Shared lifecycle lives in `island.js`; this module only wires the section,
// the legacy query flag, and the dynamic component loader, then publishes the
// same globals the settings shell and the legacy renderers already use.
//
// The `svelte` runtime and the component are imported dynamically: the Go dev
// server hands web/src/*.js to the browser as raw ES modules, where bare
// specifiers and .svelte files cannot be resolved. In that mode the island is
// simply skipped.

import { createIsland } from './island.js';

const island = createIsland({
  id: 'appearance',
  sectionId: 'settings-appearance',
  legacyParam: 'legacy-appearance',
  load: () => import('./SettingsAppearance.svelte'),
});

export const isAppearanceIslandActive = island.isActive;
export const mountAppearanceIsland = island.mount;
export const unmountAppearanceIsland = island.unmount;

window.mountAppearanceIsland = mountAppearanceIsland;
window.unmountAppearanceIsland = unmountAppearanceIsland;
window.isAppearanceIslandActive = isAppearanceIslandActive;
