export const PRODUCTION_ORDER_URL = 'https://milinta88.github.io/lankangtong-pos/#/order';

function normalizeRoutePath(path) {
  const cleanPath = String(path || '').trim();
  const withoutQuery = cleanPath.split('?')[0].split('#')[0] || '/';

  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function stripBasePath(pathname) {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;

  if (normalizedBase && normalizedBase !== '/' && pathname.startsWith(normalizedBase)) {
    return pathname.slice(normalizedBase.length) || '/';
  }

  return pathname || '/';
}

export function getCurrentRoutePath() {
  const hash = window.location.hash || '';

  if (hash.startsWith('#/')) {
    return normalizeRoutePath(hash.slice(1));
  }

  return normalizeRoutePath(stripBasePath(window.location.pathname));
}

export function getCurrentRouteSearch() {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');

  if (hash.startsWith('#/') && queryIndex >= 0) {
    return hash.slice(queryIndex);
  }

  return window.location.search || '';
}

export function routeHref(path) {
  const base = import.meta.env.BASE_URL || '/';

  return `${base}#${path}`;
}

export function navigateTo(path) {
  const base = import.meta.env.BASE_URL || '/';
  const nextPath = path.startsWith('/') ? path : `/${path}`;

  window.history.pushState({}, '', `${base}#${nextPath}`);
  window.dispatchEvent(new Event('hashchange'));
}
