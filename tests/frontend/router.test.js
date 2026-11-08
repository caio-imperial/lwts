// Unit tests for web/src/router.js (pure route helpers).
// Run with: node --test tests/frontend/*.test.js
//
// router.js is an ES module (web/package.json has "type": "module"), so it is
// loaded through a dynamic import from this CommonJS test file.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let parseUrl;
let buildUrl;
let FILTER_PARAMS;

before(async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'web', 'src', 'router.js')).href
  );
  ({ parseUrl, buildUrl, FILTER_PARAMS } = mod);
});

// ── parseUrl ──────────────────────────────────────────────────────────────

test('parseUrl: route surface', () => {
  assert.deepEqual(parseUrl('/'), { name: 'root', query: new URLSearchParams() });

  const workspace = parseUrl('/default');
  assert.equal(workspace.name, 'workspace');
  assert.equal(workspace.workspaceRef, 'default');

  const board = parseUrl('/default/meu-board');
  assert.equal(board.name, 'board');
  assert.equal(board.workspaceRef, 'default');
  assert.equal(board.boardRef, 'meu-board');

  const boardById = parseUrl('/default/850946ec-91ca-41af-9c0a-da48f757eba0');
  assert.equal(boardById.name, 'board');
  assert.equal(boardById.boardRef, '850946ec-91ca-41af-9c0a-da48f757eba0');

  const card = parseUrl('/default/meu-board/cards/42');
  assert.equal(card.name, 'card');
  assert.equal(card.workspaceRef, 'default');
  assert.equal(card.boardRef, 'meu-board');
  assert.equal(card.cardRef, '42');

  const cardByKey = parseUrl('/default/abc/cards/MY-BOA-7');
  assert.equal(cardByKey.cardRef, 'MY-BOA-7');

  assert.deepEqual(
    { name: parseUrl('/settings').name, section: parseUrl('/settings').section },
    { name: 'settings', section: 'general' },
  );
  assert.equal(parseUrl('/settings/general').section, 'general');
  assert.equal(parseUrl('/settings/custom-fields').section, 'custom-fields');
});

test('parseUrl: normalizes slashes and accepts URL/location', () => {
  assert.equal(parseUrl('/default/abc/').name, 'board');
  assert.equal(parseUrl('/default//abc').boardRef, 'abc');
  assert.equal(parseUrl('http://localhost:8099/default/abc').boardRef, 'abc');
  assert.equal(parseUrl(new URL('http://x/default/abc')).boardRef, 'abc');
  assert.equal(parseUrl({ href: 'http://x/default/abc' }).boardRef, 'abc');
});

test('parseUrl: invalid routes become notFound', () => {
  for (const url of [
    '/nowhere/abc/cards',
    '/nowhere/abc/cards/42/extra',
    '/nowhere/abc/other/42',
    '/settings/bad%20section',
    '/default/%E0%A4%A',
    '/default/abc/cards',
    '/default/abc/cards/42/extra',
    '/default/abc/other/42',
    '/a/b/c/d/e',
  ]) {
    assert.equal(parseUrl(url).name, 'notFound', url);
  }
});

test('parseUrl: reserved first segments are not workspaces', () => {
  for (const url of ['/boards', '/boards/abc', '/api', '/assets', '/login', '/plugins', '/healthz', '/readyz']) {
    assert.equal(parseUrl(url).name, 'notFound', url);
  }
});

test('parseUrl: only known filters are kept in the query', () => {
  const route = parseUrl('/default/abc?view=list&foo=bar&q=bug&tag=urgent');
  assert.equal(route.query.get('view'), 'list');
  assert.equal(route.query.get('q'), 'bug');
  assert.equal(route.query.get('tag'), 'urgent');
  assert.equal(route.query.get('foo'), null);
  assert.equal(route.query.get('board'), null);
});

test('parseUrl: FILTER_PARAMS is the query allowlist', () => {
  assert.deepEqual(FILTER_PARAMS, ['view', 'assignee', 'priority', 'tag', 'q']);
});

// ── buildUrl ──────────────────────────────────────────────────────────────

test('buildUrl: builds every route', () => {
  assert.equal(buildUrl({ name: 'root' }), '/');
  assert.equal(buildUrl({ name: 'workspace', workspaceRef: 'default' }), '/default');
  assert.equal(
    buildUrl({ name: 'board', workspaceRef: 'default', boardRef: 'abc' }),
    '/default/abc',
  );
  assert.equal(
    buildUrl({
      name: 'card',
      workspaceRef: 'default',
      boardRef: 'meu-board',
      cardRef: '42',
    }),
    '/default/meu-board/cards/42',
  );
  assert.equal(buildUrl({ name: 'settings' }), '/settings');
  assert.equal(buildUrl({ name: 'settings', section: 'general' }), '/settings');
  assert.equal(buildUrl({ name: 'settings', section: 'boards' }), '/settings/boards');
});

test('buildUrl: escapes refs and orders filters', () => {
  assert.equal(
    buildUrl({ name: 'board', workspaceRef: 'a b', boardRef: 'c d' }),
    '/a%20b/c%20d',
  );
  assert.equal(
    buildUrl({
      name: 'card',
      workspaceRef: 'ws',
      boardRef: 'abc',
      cardRef: 'MY-BOA-1',
      query: { q: 'bug', tag: 'urgent', view: 'list' },
    }),
    '/ws/abc/cards/MY-BOA-1?view=list&tag=urgent&q=bug',
  );
});

test('buildUrl: requires identity refs and rejects unknown routes', () => {
  assert.throws(() => buildUrl({ name: 'workspace' }), TypeError);
  assert.throws(() => buildUrl({ name: 'board', boardRef: 'abc' }), TypeError);
  assert.throws(() => buildUrl({ name: 'board', workspaceRef: 'ws' }), TypeError);
  assert.throws(() => buildUrl({ name: 'card', workspaceRef: 'ws', boardRef: 'abc' }), TypeError);
  assert.throws(() => buildUrl({ name: 'card', boardRef: 'abc', cardRef: '42' }), TypeError);
  assert.throws(() => buildUrl({ name: 'card', workspaceRef: 'ws', cardRef: '42' }), TypeError);
  assert.throws(() => buildUrl({ name: 'settings', section: 'bad section' }), TypeError);
  assert.throws(() => buildUrl({ name: 'allBoards' }), TypeError);
  assert.throws(() => buildUrl({ name: 'board', workspaceRef: 'ws', boardRef: '' }), TypeError);
  assert.throws(() => buildUrl({ name: 'nope' }), TypeError);
});

test('buildUrl/parseUrl: round-trip preserves refs and filters', () => {
  const states = [
    { name: 'root' },
    { name: 'workspace', workspaceRef: 'default', query: { view: 'list' } },
    { name: 'board', workspaceRef: 'default', boardRef: '850946ec-91ca-41af-9c0a-da48f757eba0' },
    {
      name: 'card',
      workspaceRef: 'default',
      boardRef: 'meu-board',
      cardRef: 'MY-BOA-1',
      query: { q: 'login' },
    },
    { name: 'settings', section: 'appearance' },
  ];

  for (const state of states) {
    const parsed = parseUrl(buildUrl(state));
    assert.equal(parsed.name, state.name);
    assert.equal(parsed.workspaceRef, state.workspaceRef);
    assert.equal(parsed.boardRef, state.boardRef);
    assert.equal(parsed.cardRef, state.cardRef);
    if (state.name === 'settings') {
      assert.equal(parsed.section, state.section || 'general');
    }
    const expected = new URLSearchParams(state.query || {});
    assert.equal(parsed.query.toString(), expected.toString());
  }
});

// ── No legacy URL support ─────────────────────────────────────────────────

test('legacy URLs are no longer interpreted (path decides, hash/query ignored)', () => {
  // No compatibility redirect: hash and ?board= are ignored at the root.
  assert.equal(parseUrl('/?board=abc').name, 'root');
  assert.equal(parseUrl('/#settings/boards').name, 'root');
  assert.equal(parseUrl('/#MY-BOA-1').name, 'root');
  assert.equal(parseUrl('/?board=abc').query.get('board'), null);

  // The old 2b paths are not routes at all: they fall back to notFound.
  assert.equal(parseUrl('/boards').name, 'notFound');
  assert.equal(parseUrl('/boards/850946ec-91ca-41af-9c0a-da48f757eba0').name, 'notFound');
  assert.equal(
    parseUrl('/boards/850946ec-91ca-41af-9c0a-da48f757eba0/cards/LWTS-1').name,
    'notFound',
  );
});
