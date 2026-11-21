/* 论文库搜索与筛选：纯函数，可组合条件。 */
export function filterPapers(list, { query, filters }, statusOf) {
  const q = query.trim().toLowerCase()
  return list.filter((p) => {
    if (q) {
      const hay = [p.title, p.intro, ...(p.keywords ?? []), ...(p.authors ?? [])].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.field && !p.researchField.includes(filters.field)) return false
    if (filters.type && p.paperType !== filters.type) return false
    if (filters.difficulty && p.difficulty !== filters.difficulty) return false
    if (filters.status && statusOf(p.id) !== filters.status) return false
    return true
  })
}

export const EMPTY_FILTERS = { field: '', type: '', difficulty: '', status: '' }