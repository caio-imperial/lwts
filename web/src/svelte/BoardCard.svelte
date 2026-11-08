<script>
  // One board card inside the Boards settings island. Mirrors the legacy
  // `loadBoardsSettings()` markup and handlers; `window.boardList` stays the
  // source of truth for column JSON (the raw board object is `item.board`).

  const PALETTE = ['#8c8c8c', '#579DFF', '#fb8c00', '#4ade80', '#f44336', '#9f8fef', '#6cc3e0', '#f5cd47'];
  const PICKER_STYLE = 'position:absolute;top:calc(100% + 4px);left:0;display:flex;gap:6px;padding:8px;' +
    'background:var(--surface-dropdown,#222);border:1px solid var(--border-light);border-radius:8px;' +
    'box-shadow:var(--shadow-md);z-index:200';
  const SWATCH_STYLE = 'width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;';
  const TRIGGER_ROWS = [
    { key: 'on_create', title: 'On create', desc: 'A new card is created on this board' },
    { key: 'on_transition', title: 'On transition', desc: 'A card moves between columns' },
    { key: 'on_done', title: 'On done', desc: 'A card moves to a Done column' },
    { key: 'on_closed', title: 'On closed', desc: 'A card moves to Closed (cleared)' },
  ];
  const EMPTY_TRIGGERS = {
    on_create: { notify: false, webhook: '' },
    on_transition: { notify: false, webhook: '' },
    on_done: { notify: false, webhook: '' },
    on_closed: { notify: false, webhook: '' },
  };

  let { item, onToggle } = $props();

  let dragIndex = $state(null);
  let overIndex = $state(null);
  let colorPicker = $state(-1);
  // Intentionally captured once: the legacy renderer keeps showing the saved
  // key until the section is reloaded.
  // svelte-ignore state_referenced_locally
  let projectKey = $state(item.board.project_key || '');

  const totalCards = $derived(Object.values(item.cardCounts).reduce((sum, n) => sum + n, 0));

  function debounce(key, fn) {
    if (!window._boardSettingsDebounce) window._boardSettingsDebounce = {};
    clearTimeout(window._boardSettingsDebounce[key]);
    window._boardSettingsDebounce[key] = setTimeout(fn, 600);
  }

  function retype(columns) {
    columns.forEach((col, i) => {
      col.type = i === 0 ? 'start' : i === columns.length - 1 ? 'done' : 'active';
    });
  }

  function persistColumns(extra) {
    retype(item.columns);
    const columnsJSON = JSON.stringify(item.columns);
    // `window.boardList` holds the raw board objects (the Svelte state proxy is
    // not the same reference), so the matching entry must be mutated before the
    // legacy helper reads `board.columns` back.
    const entry = (window.boardList || []).find((b) => b.id === item.board.id);
    if (entry) entry.columns = columnsJSON;
    if (typeof window._saveBoardColumns === 'function') {
      window._saveBoardColumns(item.board.id, Object.assign({ silent: true, skipLabelSync: true }, extra || {}));
    }
  }

  function onProjectKeyInput(e) {
    projectKey = e.currentTarget.value;
    debounce('pk-' + item.board.id, () => {
      window.API.updateBoard(item.board.id, { project_key: projectKey.trim() })
        .catch(() => window.Toast && window.Toast.error('Failed to update project key'));
    });
  }

  function onLabelInput(col, e) {
    col.label = e.currentTarget.value;
    debounce('col-' + item.board.id, () => persistColumns());
  }

  function slugifyColumnId(label) {
    if (typeof window._slugifyColumnId === 'function') return window._slugifyColumnId(label);
    let slug = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || 'column';
  }

  function uniqueColumnId(slug, columns) {
    if (typeof window._uniqueColumnId === 'function') return window._uniqueColumnId(slug, columns);
    const ids = new Set(columns.map((c) => c.id));
    if (!ids.has(slug)) return slug;
    let n = 2;
    while (ids.has(slug + '-' + n)) n++;
    return slug + '-' + n;
  }

  function addColumn() {
    const label = 'New Column';
    item.columns.push({
      id: uniqueColumnId(slugifyColumnId(label), item.columns),
      label,
      color: PALETTE[item.columns.length % PALETTE.length],
      type: 'active',
    });
    persistColumns();
    setTimeout(() => {
      const inputs = document.querySelectorAll('.board-column-label-input[data-board-id="' + item.board.id + '"]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    }, 50);
  }

  function removeColumn(col) {
    const columns = item.columns;
    if (columns.length <= 2) {
      if (window.Toast) window.Toast.error('Board must have at least 2 columns');
      return;
    }
    const count = item.cardCounts[col.id] || 0;
    const remaining = columns.filter((c) => c.id !== col.id);
    const target = remaining[0];
    const drop = (migrateTo) => {
      item.columns = remaining;
      persistColumns(migrateTo ? { migrate_to: migrateTo } : undefined);
    };
    if (count > 0) {
      if (confirm('Column has ' + count + ' card(s). Move them to "' + target.label + '" and remove?')) {
        drop(target.id);
      }
      return;
    }
    drop(null);
  }

  function openPicker(e, index) {
    e.stopPropagation();
    colorPicker = colorPicker === index ? -1 : index;
  }

  function closePicker() {
    if (colorPicker !== -1) colorPicker = -1;
  }

  function chooseColor(index, color) {
    item.columns[index].color = color;
    colorPicker = -1;
    persistColumns();
  }

  function onDragStart(e, index) {
    dragIndex = index;
    overIndex = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      const row = e.currentTarget.closest('.settings-column-row');
      if (row) e.dataTransfer.setDragImage(row, 0, 0);
    }
  }

  function onDragEnd() {
    dragIndex = null;
    overIndex = null;
  }

  function onDragOver(e, index) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    overIndex = index;
  }

  function onDrop(e, index) {
    e.preventDefault();
    overIndex = null;
    if (dragIndex === null || dragIndex === index) return;
    const [moved] = item.columns.splice(dragIndex, 1);
    item.columns.splice(index, 0, moved);
    dragIndex = null;
    persistColumns();
  }

  function onNotifyChange(key, e) {
    item.triggers[key].notify = e.currentTarget.checked;
    if (typeof window._saveBoardTriggers === 'function') window._saveBoardTriggers(item.board.id);
  }

  function onWebhookInput(key, e) {
    item.triggers[key].webhook = e.currentTarget.value;
    debounce('tr-' + item.board.id, () => {
      if (typeof window._saveBoardTriggers === 'function') window._saveBoardTriggers(item.board.id);
    });
  }

  function testTrigger(e) {
    if (typeof window.testBoardTrigger === 'function') window.testBoardTrigger(e.currentTarget);
  }
</script>

<svelte:window onclick={closePicker} />

<div class="settings-board-card" class:open={item.open}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="settings-board-header" onclick={() => onToggle(item)}>
    <div class="settings-board-name">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text-dimmed);fill:none;stroke-width:2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
      {item.board.name}
      {#if item.isDefault}<span class="settings-board-badge">default</span>{/if}
    </div>
    <div class="settings-board-meta">
      {totalCards} card{totalCards !== 1 ? 's' : ''}
      <svg class="settings-board-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
    </div>
  </div>

  <div class="settings-board-config" class:hidden={!item.open} id={'board-config-' + item.board.id}>
    <div class="settings-group">
      <div class="settings-group-title">Configuration</div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-title">Project key</div>
          <div class="settings-row-desc">Prefix for ticket IDs (e.g. {item.board.project_key}-101)</div>
        </div>
        <div class="settings-row-control">
          <input
            class="settings-input board-project-key-input"
            data-board-id={item.board.id}
            value={projectKey}
            style="width:100px"
            oninput={onProjectKeyInput}
          />
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Columns</div>
      <div class="settings-columns-list" data-board-id={item.board.id}>
        {#each item.columns as col, ci (col.id)}
          {@const count = item.cardCounts[col.id] || 0}
          {@const typeLabel = ci === 0 ? 'Start' : ci === item.columns.length - 1 ? 'Done' : ''}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="settings-column-row"
            data-col-index={ci}
            data-col-id={col.id}
            style:opacity={dragIndex === ci ? 0.4 : null}
            style:box-shadow={overIndex === ci ? 'inset 0 2px 0 0 rgba(100,100,100,0.6)' : null}
            ondragover={(e) => onDragOver(e, ci)}
            ondragleave={() => { if (overIndex === ci) overIndex = null; }}
            ondrop={(e) => onDrop(e, ci)}
          >
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="settings-column-drag"
              draggable="true"
              title="Drag to reorder"
              ondragstart={(e) => onDragStart(e, ci)}
              ondragend={onDragEnd}
            >&#x2261;</span>
            <input
              class="settings-input board-column-label-input"
              data-board-id={item.board.id}
              data-col-index={ci}
              value={col.label}
              style="width:140px;height:30px;font-size:0.88rem;font-weight:500"
              oninput={(e) => onLabelInput(col, e)}
            />
            <span style="position:relative;display:inline-flex">
              <button
                class="settings-column-color-btn"
                data-col-index={ci}
                style="background:{col.color || PALETTE[ci % PALETTE.length]}"
                title="Change color"
                onclick={(e) => openPicker(e, ci)}
              ></button>
              {#if colorPicker === ci}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div class="settings-color-picker" style={PICKER_STYLE} onclick={(e) => e.stopPropagation()}>
                  {#each PALETTE as swatch}
                    <button
                      type="button"
                      title={swatch}
                      aria-label={swatch}
                      style="{SWATCH_STYLE}background:{swatch}"
                      onclick={() => chooseColor(ci, swatch)}
                    ></button>
                  {/each}
                </div>
              {/if}
            </span>
            <span class="settings-column-count">{count} card{count !== 1 ? 's' : ''}{typeLabel ? ' · ' + typeLabel : ''}</span>
            {#if item.columns.length > 2}
              <button
                class="settings-column-remove-btn"
                data-col-index={ci}
                data-col-id={col.id}
                data-card-count={count}
                title="Remove column"
                onclick={() => removeColumn(col)}
              >&times;</button>
            {/if}
          </div>
        {/each}
      </div>
      <button
        class="btn settings-column-add-btn"
        data-board-id={item.board.id}
        style="margin-top:10px;font-size:0.82rem;padding:4px 14px"
        onclick={addColumn}
      >+ Add column</button>
    </div>

    {@html window._renderCustomFieldsConfig(item.board.id, item.settings.custom_fields || [])}

    <div class="settings-group">
      <div class="settings-group-title">Triggers</div>
      <div class="settings-row-desc" style="padding:0 0 10px 0;color:var(--text-dimmed);font-size:0.8rem">
        For each event, enable a desktop notification and/or POST to a webhook.
        Desktop notifications require the global toggle in <em>Notifications</em>.
      </div>
      {#each TRIGGER_ROWS as row (row.key)}
        {@const trigger = (item.triggers && item.triggers[row.key]) || EMPTY_TRIGGERS[row.key]}
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-title">{row.title}</div>
            <div class="settings-row-desc">{row.desc}</div>
          </div>
          <div class="settings-row-control" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <label class="settings-toggle" title="Browser notification">
              <input
                type="checkbox"
                class="board-trigger-notify"
                data-board-id={item.board.id}
                data-trigger={row.key}
                checked={trigger.notify}
                onchange={(e) => onNotifyChange(row.key, e)}
              />
              <span class="toggle-track"></span>
            </label>
            <input
              class="settings-input board-trigger-webhook"
              data-board-id={item.board.id}
              data-trigger={row.key}
              value={trigger.webhook || ''}
              placeholder="Webhook URL (optional)"
              style="min-width:220px"
              oninput={(e) => onWebhookInput(row.key, e)}
            />
            <button
              class="btn board-trigger-test"
              data-board-id={item.board.id}
              data-trigger={row.key}
              style="font-size:0.78rem;flex-shrink:0"
              onclick={testTrigger}
            >Test</button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
