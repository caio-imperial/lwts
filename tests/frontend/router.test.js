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

test('parseUrl: superfície de rotas', () => {
  assert.deepEqual(parseUrl('/'), { name: 'root', query: new URLSearchParams() });
  assert.equal(parseUrl('/boards').name, 'allBoards');

  const board = parseUrl('/boards/850946ec-91ca-41af-9c0a-da48f757eba0');
  assert.equal(board.name, 'board');
  assert.equal(board.boardRef, '850946ec-91ca-41af-9c0a-da48f757eba0');

  const card = parseUrl('/boards/meu-board/cards/42');
  assert.equal(card.name, 'card');
  assert.equal(card.boardRef, 'meu-board');
  assert.equal(card.cardRef, '42');

  const cardByKey = parseUrl('/boards/abc/cards/MY-BOA-7');
  assert.equal(cardByKey.cardRef, 'MY-BOA-7');

  assert.deepEqual(
    { name: parseUrl('/settings').name, section: parseUrl('/settings').section },
    { name: 'settings', section: 'general' },
  );
  assert.equal(parseUrl('/settings/general').section, 'general');
  assert.equal(parseUrl('/settings/custom-fields').section, 'custom-fields');
});

test('parseUrl: normaliza barras e aceita URL/location', () => {
  assert.equal(parseUrl('/boards/abc/').name, 'board');
  assert.equal(parseUrl('/boards//abc').boardRef, 'abc');
  assert.equal(parseUrl('http://localhost:8099/boards/abc').boardRef, 'abc');
  assert.equal(parseUrl(new URL('http://x/boards/abc')).boardRef, 'abc');
  assert.equal(parseUrl({ href: 'http://x/boards/abc' }).boardRef, 'abc');
});

test('parseUrl: rotas inválidas viram notFound', () => {
  for (const url of [
    '/nope',
    '/boards/abc/cards',
    '/boards/abc/cards/42/extra',
    '/boards/abc/other/42',
    '/settings/bad%20section',
    '/boards/%E0%A4%A',
  ]) {
    assert.equal(parseUrl(url).name, 'notFound', url);
  }
});

test('parseUrl: só filtros conhecidos entram na query', () => {
  const route = parseUrl('/boards/abc?view=list&foo=bar&q=bug&tag=urgent');
  assert.equal(route.query.get('view'), 'list');
  assert.equal(route.query.get('q'), 'bug');
  assert.equal(route.query.get('tag'), 'urgent');
  assert.equal(route.query.get('foo'), null);
  assert.equal(route.query.get('board'), null);
});

test('parseUrl: FILTER_PARAMS é a allowlist da query', () => {
  assert.deepEqual(FILTER_PARAMS, ['view', 'assignee', 'priority', 'tag', 'q']);
});

// ── buildUrl ──────────────────────────────────────────────────────────────

test('buildUrl: constrói todas as rotas', () => {
  assert.equal(buildUrl({ name: 'root' }), '/');
  assert.equal(buildUrl({ name: 'allBoards' }), '/boards');
  assert.equal(buildUrl({ name: 'board', boardRef: 'abc' }), '/boards/abc');
  assert.equal(
    buildUrl({ name: 'card', boardRef: 'meu-board', cardRef: '42' }),
    '/boards/meu-board/cards/42',
  );
  assert.equal(buildUrl({ name: 'settings' }), '/settings');
  assert.equal(buildUrl({ name: 'settings', section: 'general' }), '/settings');
  assert.equal(buildUrl({ name: 'settings', section: 'boards' }), '/settings/boards');
});

test('buildUrl: escapa refs e ordena filtros', () => {
  assert.equal(
    buildUrl({ name: 'board', boardRef: 'a b' }),
    '/boards/a%20b',
  );
  assert.equal(
    buildUrl({
      name: 'card',
      boardRef: 'abc',
      cardRef: 'MY-BOA-1',
      query: { q: 'bug', tag: 'urgent', view: 'list' },
    }),
    '/boards/abc/cards/MY-BOA-1?view=list&tag=urgent&q=bug',
  );
});

test('buildUrl: exige refs de identidade e rejeita rota desconhecida', () => {
  assert.throws(() => buildUrl({ name: 'board' }), TypeError);
  assert.throws(() => buildUrl({ name: 'card', boardRef: 'abc' }), TypeError);
  assert.throws(() => buildUrl({ name: 'card', cardRef: '42' }), TypeError);
  assert.throws(() => buildUrl({ name: 'settings', section: 'bad section' }), TypeError);
  assert.throws(() => buildUrl({ name: 'nope' }), TypeError);
});

test('buildUrl/parseUrl: round-trip preserva refs e filtros', () => {
  const states = [
    { name: 'root' },
    { name: 'allBoards', query: { view: 'list' } },
    { name: 'board', boardRef: '850946ec-91ca-41af-9c0a-da48f757eba0' },
    { name: 'card', boardRef: 'meu-board', cardRef: 'MY-BOA-1', query: { q: 'login' } },
    { name: 'settings', section: 'appearance' },
  ];

  for (const state of states) {
    const parsed = parseUrl(buildUrl(state));
    assert.equal(parsed.name, state.name);
    assert.equal(parsed.boardRef, state.boardRef);
    assert.equal(parsed.cardRef, state.cardRef);
    if (state.name === 'settings') {
      assert.equal(parsed.section, state.section || 'general');
    }
    const expected = new URLSearchParams(state.query || {});
    assert.equal(parsed.query.toString(), expected.toString());
  }
});

// ── Sem suporte a URLs legadas ────────────────────────────────────────────

test('URLs legadas não são mais interpretadas (hash/query ignorados)', () => {
  // A decisão do fork é não manter redirects: hash e ?board= são ignorados.
  assert.equal(parseUrl('/?board=abc').name, 'root');
  assert.equal(parseUrl('/#settings/boards').name, 'root');
  assert.equal(parseUrl('/#MY-BOA-1').name, 'root');
  assert.equal(parseUrl('/?board=abc').query.get('board'), null);
});
