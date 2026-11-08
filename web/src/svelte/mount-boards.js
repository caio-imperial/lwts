// Svelte island lifecycle for the Boards settings section (spike).
//
// Mirrors `mount-appearance.js`: the shared factory stashes the legacy markup,
// skips the island on the raw Go dev server, and restores the fallback when
// `?legacy-boards=1` is set or the dynamic import fails. On a failed import we
// also re-run the legacy board renderer, since the shell may have already
// called it while the section was stashed.

import { createIsland } from './island.js';

const island = createIsland({
  id: 'boards',
  sectionId: 'settings-boards',
  legacyParam: 'legacy-boards',
  load: () => import('./SettingsBoards.svelte'),
  onFallback: () => {
    if (typeof window.loadBoardsSettings === 'function') window.loadBoardsSettings();
  },
});

export const isBoardsIslandActive = island.isActive;
export const mountBoardsIsland = island.mount;
export const unmountBoardsIsland = island.unmount;

window.mountBoardsIsland = mountBoardsIsland;
window.unmountBoardsIsland = unmountBoardsIsland;
window.isBoardsIslandActive = isBoardsIslandActive;
