const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = [25, 50, 100];

/**
 * Read pagination state from a URL string.
 * @param {string} href - Full URL string
 * @returns {{ page: number, pageSize: number }}
 */
export function readPaginationFromUrl(href) {
  const url = new URL(href);
  const rawPage = parseInt(url.searchParams.get('page'), 10);
  const rawSize = parseInt(url.searchParams.get('pageSize'), 10);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_PAGE;
  const pageSize = ALLOWED_PAGE_SIZES.includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

/**
 * Build a URL string with pagination params set (or removed if defaults).
 * Preserves all existing search params.
 * @param {string} href - Current full URL string
 * @param {number} page
 * @param {number} pageSize
 * @returns {string} Updated URL string
 */
export function buildPaginationUrl(href, page, pageSize) {
  const url = new URL(href);

  if (page > DEFAULT_PAGE) {
    url.searchParams.set('page', String(page));
  } else {
    url.searchParams.delete('page');
  }

  if (pageSize !== DEFAULT_PAGE_SIZE) {
    url.searchParams.set('pageSize', String(pageSize));
  } else {
    url.searchParams.delete('pageSize');
  }

  return url.toString();
}
