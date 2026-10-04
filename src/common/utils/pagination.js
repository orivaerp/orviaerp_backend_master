const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Pagination is opt-in: callers that don't send `page` keep getting the full
// list, so existing consumers (dropdowns, analytics) are unaffected.
// Returns null when the request isn't paginated.
exports.parsePagination = (query = {}) => {
  if (query.page === undefined) return null;

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  return { page, limit, skip: (page - 1) * limit };
};

exports.buildMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
});
