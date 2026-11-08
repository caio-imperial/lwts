// LWTS SPA router — pure helpers (no DOM access).
//
// Contract: docs/ROUTES.md
//
// Three levels: workspace -> board -> card. Refs are opaque to the router; a
// single resolver in the SPA interprets them (workspace slug/uuid, board
// slug/uuid, card number/key/uuid).
//
// This module is intentionally free of side effects so it can be unit tested
// in Node and wired into the SPA in a later phase. The pure helpers live here;
// `navigate` is the only History API touchpoint and is exported for the SPA.

const BASE_URL = 'http://lwts.local';

// Query parameters allowed in the URL. They represent ephemeral UI state
// (filters/visualization), never navigation identity.
export const FILTER_PARAMS = ['view', 'assignee', 'priority', 'tag', 'q'];

const SETTINGS_SECTION_RE = /^[a-z0-9][a-z0-9_-]*$/i;

// First path segments that can never be a workspace. `boards` is reserved so
// the pre-3c `/boards...` URLs fall through to `notFound` (the app then opens
// the default workspace); the rest are server/static prefixes.
const RESERVED_WORKSPACE_SLUGS = new Set([
  'settings',
  'boards',
  'api',
  'assets',
  'login',
  'plugins',
  'healthz',
  'readyz',
]);

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
 *   name: 'root'|'workspace'|'board'|'card'|'settings'|'notFound',
 *   workspaceRef?: string,
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

  if (segments[0] === 'settings') {
    if (segments.length === 1) return { name: 'settings', section: 'general', query };
    if (segments.length === 2 && SETTINGS_SECTION_RE.test(segments[1])) {
      return { name: 'settings', section: segments[1], query };
    }
    return { name: 'notFound', query };
  }

  // No workspace route for reserved/server prefixes (includes legacy /boards).
  if (RESERVED_WORKSPACE_SLUGS.has(segments[0])) return { name: 'notFound', query };

  if (segments.length === 1) {
    return { name: 'workspace', workspaceRef: segments[0], query };
  }

  if (segments.length === 2) {
    return { name: 'board', workspaceRef: segments[0], boardRef: segments[1], query };
  }

  if (segments.length === 4 && segments[2] === 'cards') {
    return {
      name: 'card',
      workspaceRef: segments[0],
      boardRef: segments[1],
      cardRef: segments[3],
      query,
    };
  }

  return { name: 'notFound', query };
}

/**
 * Build a URL path (with allowed query filters) from a route state.
 * Throws when an identity ref is missing for workspace/board/card routes.
 */
export function buildUrl(state) {
  const name = state && state.name;
  const query = filtersToQuery(state && state.query);

  if (name === 'root') return withQuery('/', query);

  if (name === 'workspace') {
    if (!state.workspaceRef) {
      throw new TypeError('build: workspaceRef is required for workspace routes');
    }
    return withQuery(`/${encodeURIComponent(state.workspaceRef)}`, query);
  }

  if (name === 'board') {
    if (!state.workspaceRef) {
      throw new TypeError('build: workspaceRef is required for board routes');
    }
    if (!state.boardRef) throw new TypeError('build: boardRef is required for board routes');
    return withQuery(
      `/${encodeURIComponent(state.workspaceRef)}/${encodeURIComponent(state.boardRef)}`,
      query,
    );
  }

  if (name === 'card') {
    if (!state.workspaceRef) {
      throw new TypeError('build: workspaceRef is required for card routes');
    }
    if (!state.boardRef) throw new TypeError('build: boardRef is required for card routes');
    if (!state.cardRef) throw new TypeError('build: cardRef is required for card routes');
    return withQuery(
      `/${encodeURIComponent(state.workspaceRef)}/${encodeURIComponent(state.boardRef)}` +
        `/cards/${encodeURIComponent(state.cardRef)}`,
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
 * Write a route state to the History API without dispatching route handlers.
 *
 * Navigation is explicit (push) unless the caller asks for a replace, so the
 * global `popstate` listener stays the single place that re-applies a route.
 */
export function navigate(state, { replace = false } = {}) {
  const url = buildUrl(state);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

// Browser wiring — the SPA modules read the router through `window.Router`.
if (typeof window !== 'undefined') {
  window.Router = { parseUrl, buildUrl, navigate, FILTER_PARAMS };
}
