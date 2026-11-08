// LWTS SPA router — pure helpers (no DOM access).
//
// Contract: docs/ROUTES.md
//
// This module is intentionally free of side effects so it can be unit tested
// in Node and wired into the SPA in a later phase. Only `parseUrl`,
// `buildUrl`, `parseLegacy` and the exported constants live here; the History
// API integration is added when the router is activated.

const BASE_URL = 'http://lwts.local';

// Query parameters allowed in the URL. They represent ephemeral UI state
// (filters/visualization), never navigation identity.
export const FILTER_PARAMS = ['view', 'assignee', 'priority', 'tag', 'q'];

const SETTINGS_SECTION_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function toURL(input) {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input, BASE_URL);
  if (input && typeof input.href === 'string') return new URL(input.href);
  throw new TypeError('parse: expected a URL or a string');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizePath(pathname) {
  let path = pathname || '/';
  path = path.replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

function pickFilters(searchParams) {
  const filters = new URLSearchParams();
  for (const key of FILTER_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null && value !== '') filters.set(key, value);
  }
  return filters;
}

function filtersToQuery(filters) {
  const params = new URLSearchParams();
  if (!filters) return params;
  const source = filters instanceof URLSearchParams ? filters : new URLSearchParams(filters);
  for (const key of FILTER_PARAMS) {
    const value = source.get(key);
    if (value !== null && value !== '') params.set(key, value);
  }
  return params;
}

function withQuery(path, query) {
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Parse a URL (absolute, relative or URL object) into a route state.
 *
 * @returns {{
 *   name: 'root'|'allBoards'|'board'|'card'|'settings'|'notFound',
 *   boardRef?: string,
 *   cardRef?: string,
 *   section?: string,
 *   query: URLSearchParams,
 * }}
 */
export function parseUrl(input) {
  const url = toURL(input);
  const path = normalizePath(url.pathname);
  const query = pickFilters(url.searchParams);
  const segments = path.split('/').filter(Boolean).map(safeDecode);

  // Malformed percent-encoding anywhere in the path is not a route.
  if (segments.some((s) => s === null)) return { name: 'notFound', query };

  if (segments.length === 0) return { name: 'root', query };

  if (segments[0] === 'boards') {
    if (segments.length === 1) return { name: 'allBoards', query };
    if (segments.length === 2 && segments[1]) {
      return { name: 'board', boardRef: segments[1], query };
    }
    if (segments.length === 4 && segments[2] === 'cards' && segments[1] && segments[3]) {
      return { name: 'card', boardRef: segments[1], cardRef: segments[3], query };
    }
    return { name: 'notFound', query };
  }

  if (segments[0] === 'settings') {
    if (segments.length === 1) return { name: 'settings', section: 'general', query };
    if (segments.length === 2 && SETTINGS_SECTION_RE.test(segments[1])) {
      return { name: 'settings', section: segments[1], query };
    }
    return { name: 'notFound', query };
  }

  return { name: 'notFound', query };
}

/**
 * Build a URL path (with allowed query filters) from a route state.
 * Throws when an identity ref is missing for board/card routes.
 */
export function buildUrl(state) {
  const name = state && state.name;
  const query = filtersToQuery(state && state.query);

  if (name === 'root') return withQuery('/', query);
  if (name === 'allBoards') return withQuery('/boards', query);

  if (name === 'board') {
    if (!state.boardRef) throw new TypeError('build: boardRef is required for board routes');
    return withQuery(`/boards/${encodeURIComponent(state.boardRef)}`, query);
  }

  if (name === 'card') {
    if (!state.boardRef) throw new TypeError('build: boardRef is required for card routes');
    if (!state.cardRef) throw new TypeError('build: cardRef is required for card routes');
    return withQuery(
      `/boards/${encodeURIComponent(state.boardRef)}/cards/${encodeURIComponent(state.cardRef)}`,
      query,
    );
  }

  if (name === 'settings') {
    const section = state.section || 'general';
    if (!SETTINGS_SECTION_RE.test(section)) {
      throw new TypeError(`build: invalid settings section "${section}"`);
    }
    const path = section === 'general' ? '/settings' : `/settings/${encodeURIComponent(section)}`;
    return withQuery(path, query);
  }

  throw new TypeError(`build: unknown route "${String(name)}"`);
}

/**
 * Detect the pre-router URL scheme and map it to the new route state.
 *
 * Returns null when the URL does not use the legacy scheme.
 *
 * Legacy schemes:
 *   - ?board=<ref>            → /boards/<ref>
 *   - #settings[/<section>]   → /settings[/<section>]
 *   - #<card key>             → /boards/<board>/cards/<key>
 */
export function parseLegacy(input) {
  const url = toURL(input);
  const path = normalizePath(url.pathname);
  const query = pickFilters(url.searchParams);
  const boardRef = url.searchParams.get('board') || null;
  const rawHash = (url.hash || '').replace(/^#/, '');

  if (rawHash === 'settings' || rawHash.startsWith('settings/')) {
    const parts = rawHash.split('/');
    const section = parts.length > 1 ? safeDecode(parts[1]) : 'general';
    if (section && SETTINGS_SECTION_RE.test(section)) {
      return { name: 'settings', section, query };
    }
    return { name: 'settings', section: 'general', query };
  }

  if (rawHash) {
    const cardRef = safeDecode(rawHash);
    // Card keys have no slashes. Anything else is not a legacy card link.
    if (cardRef && !cardRef.includes('/') && path === '/') {
      return { name: 'card', boardRef, cardRef, query };
    }
  }

  if (boardRef && path === '/') {
    return { name: 'board', boardRef, query };
  }

  return null;
}

/**
 * True when the URL uses the legacy scheme and should be redirected once.
 */
export function isLegacyUrl(input) {
  return parseLegacy(input) !== null;
}
