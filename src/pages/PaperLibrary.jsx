import { useMemo, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import PaperCard from '../components/PaperCard.jsx'
import PaperSearch from '../components/PaperSearch.jsx'
import { navigate, useHashParams } from '../hooks/useHashRoute.js'
import { usePaperRepository, importedCatalogPaper, refreshImportedPapers } from '../lib/paperRepository.js'
import { filterPapers, EMPTY_FILTERS } from '../lib/libraryFilter.js'
import {
  useLearning,
  papers as builtInPapers,
  getFavorites,
  toggleFavorite,
  paperStatus,
  paperMasteredCount,
  setLastPaper,
} from '../lib/learningStore.js'

export default function PaperLibrary() {
  const learning = useLearning()
  const repository = usePaperRepository()
  const params = useHashParams()
  const papers = useMemo(() => [...builtInPapers, ...repository.records.map(importedCatalogPaper)], [repository.records])
  const imported = repository.records.find((record) => record.id === params.get('imported'))
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const statusOf = (id) => paperStatus(learning, id)
  const results = useMemo(
    () => filterPapers(papers, { query, filters }, statusOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [papers, query, filters, learning],
  )
  const favorites = getFavorites(learning)
  const doneCount = papers.filter((p) => statusOf(p.id) === 'done').length
  const realCount = builtInPapers.filter((p) => !p.demo).length

  const open = (id) => {
    if (repository.records.some((record) => record.id === id)) {
      navigate('imported-paper', { paperId: id })
      return
    }
    setLastPaper(id)
    navigate('reader', { paperId: id })
  }

  return (
    <div className="page lib-page">
      <section className="card card-pad lab-head">
        <div className="lab-head-copy">
          <div className="hero-eyebrow">
            <Icon name="library" size={14} />
            PAPER LIBRARY · 论文案例库
          </div>
          <h1 className="map-title">论文案例库</h1>
          <p className="card-sub map-desc">
            {realCount} 篇内置真实开放获取论文 + {builtInPapers.length - realCount} 篇虚构教学演示案例 + {repository.records.length} 篇用户导入论文。
            用户导入内容未经事实认证，本阶段提供只读学习与 JSON 备份；内置课程仍按真实阅读记录统计学习状态。
          </p>
        </div>
        <div className="map-head-stats">
          <div className="map-stat">
            <span className="map-stat-value">{papers.length}<small>篇</small></span>
            <span className="card-sub">案例总数</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{doneCount}<small>篇</small></span>
            <span className="card-sub">已完成</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{favorites.length}<small>篇</small></span>
            <span className="card-sub">已收藏</span>
          </div>
        </div>
      </section>

      <div className="import-tools library-import-tools">
        <button className="btn btn-primary library-import-btn" onClick={() => navigate('paper-import')}><Icon name="upload" size={16} />+ 导入一篇新论文</button>
        <span className="card-sub">每篇论文独立保存，可随时导出 JSON 备份。</span>
      </div>
      {imported && <p className="import-success card card-pad" role="status">导入成功，已保存到本地论文库：{imported.package.paper.title}</p>}
      {repository.status === 'loading' && <p className="card-sub" role="status">正在读取用户导入论文…</p>}
      {repository.error && <div className="import-errors" role="alert">{repository.error}<button className="btn btn-ghost btn-sm" onClick={refreshImportedPapers}>重试读取</button></div>}
      {repository.warning && <p className="import-warning">{repository.warning}</p>}
      <PaperSearch
        fields={[...new Set(papers.flatMap((paper) => paper.researchField))]}
        types={[...new Set(papers.map((paper) => paper.paperType))]}
        difficulties={[...new Set(papers.map((paper) => paper.difficulty))]}
        query={query}
        onQuery={setQuery}
        filters={filters}
        onFilter={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
        onClear={() => {
          setQuery('')
          setFilters(EMPTY_FILTERS)
        }}
        count={results.length}
        total={papers.length}
      />

      {results.length === 0 ? (
        <section className="card card-pad lib-empty">
          <div className="placeholder-icon">
            <Icon name="book" size={30} />
          </div>
          <h2 className="card-title">没有符合条件的论文</h2>
          <p className="card-sub">
            当前搜索 / 筛选组合下没有案例。试试更换关键词、放宽筛选条件，或清除全部条件查看完整案例库。
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setQuery('')
              setFilters(EMPTY_FILTERS)
            }}
          >
            <Icon name="refresh" size={14} />
            清除全部条件
          </button>
        </section>
      ) : (
        <div className="lib-grid">
          {results.map((p) => (
            <PaperCard
              key={p.id}
              paper={p}
              status={statusOf(p.id)}
              masteredCount={paperMasteredCount(learning, p.id)}
              fav={favorites.includes(p.id)}
              onOpen={() => open(p.id)}
              onToggleFav={() => toggleFavorite(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}