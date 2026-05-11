function parsePagination(query, defaults) {
  const page = Math.max(parseInt(query.page || defaults?.page || 1, 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(query.pageSize || defaults?.pageSize || 20, 10) || 20, 1),
    defaults?.maxPageSize || 100
  );
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function paginateArray(list, query, defaults) {
  const { page, pageSize, offset } = parsePagination(query, defaults);
  return {
    page,
    pageSize,
    total: list.length,
    list: list.slice(offset, offset + pageSize)
  };
}

module.exports = {
  parsePagination,
  paginateArray
};
