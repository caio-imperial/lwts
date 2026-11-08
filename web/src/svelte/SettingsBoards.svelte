<script>
  // Boards settings island. Reproduces legacy `loadBoardsSettings()`: loads the
  // workspace boards, keeps `window.boardList` as the source of truth, and
  // delegates the per-board card to BoardCard.svelte.

  import { onMount, tick } from 'svelte';
  import BoardCard from './BoardCard.svelte';

  const EMPTY_TRIGGERS = {
    on_create: { notify: false, webhook: '' },
    on_transition: { notify: false, webhook: '' },
    on_done: { notify: false, webhook: '' },
    on_closed: { notify: false, webhook: '' },
  };

  let status = $state('loading');
  let items = $state([]);

  function toggle(item) {
    const wasOpen = item.open;
    for (const other of items) other.open = false;
    item.open = !wasOpen;
  }

  onMount(async () => {
    try {
      const boards = window.currentWorkspace
        ? await window.API.listWorkspaceBoards(window.currentWorkspace.slug)
        : await window.API.listBoards();
      if (!boards || boards.length === 0) {
        status = 'empty';
        return;
      }
      window.boardList = boards;
      if (typeof window.syncCurrentBoardTheme === 'function') window.syncCurrentBoardTheme();

      // Card counts per board, fetched in parallel (legacy behavior).
      const details = await Promise.all(boards.map((b) => window.API.getBoard(b.id).catch(() => null)));

      items = boards.map((board, idx) => {
        const settings = window.parseBoardSettings
          ? window.parseBoardSettings(board.settings)
          : JSON.parse(board.settings || '{}');
        return {
          board,
          isDefault: idx === 0,
          cardCounts: details[idx] ? details[idx].card_counts || {} : {},
          settings,
          columns: JSON.parse(board.columns || '[]'),
          triggers: window.Notifier ? window.Notifier.normalizeTriggers(settings) : { ...EMPTY_TRIGGERS },
          open: false,
        };
      });
      status = 'ok';

      // Bind the trusted legacy custom-fields renderer once per board. The
      // legacy helper expects the group container: the add/remove controls live
      // next to the field list, not inside it.
      await tick();
      if (typeof window._bindCustomFieldInputs === 'function') {
        for (const item of items) {
          const list = document.querySelector('.settings-custom-fields-list[data-board-id="' + item.board.id + '"]');
          const group = list && list.closest('.settings-group');
          if (group) window._bindCustomFieldInputs(group);
        }
      }
    } catch (e) {
      status = 'error';
    }
  });
</script>

<div class="settings-section-title">Boards</div>
<div class="settings-section-desc">Each board has its own key, columns, and triggers.</div>

{#if status === 'empty'}
  <div class="settings-board-empty" style="color:var(--text-dimmed);font-size:0.85rem;padding:8px 0">No boards yet</div>
{:else if status === 'error'}
  <div style="color:var(--text-dimmed);font-size:0.85rem;padding:8px 0">Failed to load boards</div>
{:else if status === 'ok'}
  {#each items as item (item.board.id)}
    <BoardCard {item} onToggle={toggle} />
  {/each}
{/if}
