import Icon from './ui/Icon.jsx'
import { LIBRARY_STATUSES } from '../data/papers.js'

export default function PaperSearch({ query, onQuery, filters, onFilter, onClear, count, total, fields, types, difficulties }) {
  const active = query.trim() !== '' || Object.values(filters).some((v) => v !== '')
  const set = (key) => (e) => onFilter(key, e.target.value)
  return (
    <section className="card card-pad lib-search">
      <div className="lib-search-row">
        <label className="lib-query">
          <Icon name="book" size={15} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索论文标题 / 关键词 / 简介…"
            aria-label="搜索论文"
          />
        </label>
        <label className="paper-switch">
          <span className="card-sub">领域</span>
          <select value={filters.field} onChange={set('field')} aria-label="按研究领域筛选">
            <option value="">全部</option>
            {fields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="paper-switch">
          <span className="card-sub">类型</span>
          <select value={filters.type} onChange={set('type')} aria-label="按论文类型筛选">
            <option value="">全部</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="paper-switch">
          <span className="card-sub">难度</span>
          <select value={filters.difficulty} onChange={set('difficulty')} aria-label="按难度筛选">
            <option value="">全部</option>
            {difficulties.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="paper-switch">
          <span className="card-sub">状态</span>
          <select value={filters.status} onChange={set('status')} aria-label="按学习状态筛选">
            <option value="">全部</option>
            {LIBRARY_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-ghost btn-sm" onClick={onClear} disabled={!active}>
          <Icon name="refresh" size={14} />
          清除筛选
        </button>
      </div>
      <p className="card-sub lib-count" role="status">
        共 {total} 篇论文 · 当前显示 <strong>{count}</strong> 篇
        {active ? '（搜索与筛选可组合使用）' : ''}
      </p>
    </section>
  )
}