import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { L } from '../lib/lorawanData.js'
import { demoDisclaimer } from '../data/papers.js'
import {
  useLearning,
  getPaper,
  getNode,
  getUnderstood,
  getMasteredIds,
  getFavorites,
  toggleFavorite,
  getNotes,
  addNote,
  deleteNote,
  paperProgressPct,
  toggleUnderstood,
  recordReading,
  hasSectionContent,
  domainColors,
} from '../lib/learningStore.js'
import { formatTs } from '../lib/format.js'

const ORIGIN_LABEL = {
  paper_fact: '论文事实',
  paper_fact_and_cautious_inference: '论文事实 + 谨慎推断',
  paper_fact_plus_teaching: '论文事实 + 教学补充',
}

export default function PaperReader({ paperId }) {
  const paper = getPaper(paperId)
  if (!paper || paper.sections.length === 0) {
    return (
      <div className="page reader-page">
        <section className="card card-pad lib-empty">
          <h1 className="reader-title">{paper?.title ?? '未找到这篇论文'}</h1>
          {paper && <p className="card-sub">{paper.authors?.join(' · ') ?? '教学演示案例'} · {paper.demo ? '未发表' : paper.year}</p>}
          <p className="card-sub">{paper ? '章节内容尚未整理，暂不提供正文或标记完成。' : '请检查论文链接或返回论文案例库；不会替换成其他论文。'}</p>
          <button className="btn btn-primary" onClick={() => navigate('library')}>返回论文案例库</button>
        </section>
      </div>
    )
  }
  return <ReaderContent key={paper.id} paper={paper} />
}

function ReaderContent({ paper }) {
  const learning = useLearning()
  const understood = getUnderstood(learning, paper.id)
  const [sectionId, setSectionId] = useState(() => initialSection(paper, learning))
  const [active, setActive] = useState(null)
  const [query, setQuery] = useState('')
  const articleRef = useRef(null)

  useEffect(() => {
    const record = () => {
      if (document.visibilityState === 'visible') recordReading(paper.id, sectionId)
    }
    record()
    document.addEventListener('visibilitychange', record)
    return () => document.removeEventListener('visibilitychange', record)
  }, [paper.id, sectionId])

  const idx = paper.sections.findIndex((s) => s.id === sectionId)
  const section = paper.sections[idx]
  const isDemo = !!paper.demo
  const pct = paperProgressPct(learning, paper.id)
  const isDone = understood.includes(section.id)
  const mastered = new Set(getMasteredIds(learning))
  const fav = getFavorites(learning).includes(paper.id)

  const highlightRe = useMemo(() => {
    const pats = L.glossary
      .flatMap((t) => [t.term, t.abbreviation])
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((p) => (/^[A-Za-z0-9 -]+$/.test(p) ? `\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    return new RegExp(`(${pats.join('|')})`, 'gi')
  }, [])

  const renderText = (text) =>
    text.split(highlightRe).map((part, i) => {
      const term = L.glossary.find((t) => t.term.toLowerCase() === part.toLowerCase() || (t.abbreviation ?? '').toLowerCase() === part.toLowerCase())
      if (!term) return <span key={i}>{part}</span>
      return (
        <button
          key={i}
          className={`term${active?.kind === 'gloss' && active.id === term.id ? ' active' : ''}`}
          onClick={() => setActive({ kind: 'gloss', id: term.id })}
          title="点击查看术语解释"
        >
          {part}
        </button>
      )
    })

  const gotoSection = (id) => {
    setSectionId(id)
    setActive(null)
    requestAnimationFrame(() => {
      articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const onNext = () => {
    if (idx < paper.sections.length - 1) gotoSection(paper.sections[idx + 1].id)
    else navigate('dashboard')
  }

  const glossResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return L.glossary
    return L.glossary.filter((t) => [t.term, t.abbreviation, t.definition].some((v) => (v ?? '').toLowerCase().includes(q)))
  }, [query])

  const sectionObjectives = [...new Set(section.nodes.flatMap((id) => getNode(id)?.learningObjectives ?? []))].slice(0, 6)
  const sectionQuestions = L.raw.questions.questions.filter((q) => q.relatedKnowledge.some((k) => section.nodes.includes(k))).slice(0, 3)

  return (
    <div className="page reader-page">
      {/* 论文头部：真实论文元信息 + 来源政策 */}
      <section className="card card-pad reader-head">
        <div className="reader-head-top">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('dashboard')}>
            <Icon name="chevronsLeft" size={14} />
            仪表盘
          </button>
          <span className="badge badge-navy">
            {isDemo ? '教学演示案例' : `${paper.publication.journal} · ${paper.publication.volume}(${paper.publication.articleNumber})`}
          </span>
          {!isDemo && <span className="badge badge-green">{paper.license.abbreviation}</span>}
          <button
            className={`fav-btn${fav ? ' on' : ''}`}
            onClick={() => toggleFavorite(paper.id)}
            aria-pressed={fav}
            title={fav ? '取消收藏' : '收藏本篇'}
          >
            <Icon name="star" size={15} />
            {fav ? '已收藏' : '收藏'}
          </button>
        </div>
        <h1 className="reader-title">{paper.title}</h1>
        <div className="paper-meta">
          {paper.researchField.map((f) => (
            <span className="badge badge-blue" key={f}>{f}</span>
          ))}
          <span className="badge badge-amber">{isDemo ? '未发表 · 演示案例' : paper.year}</span>
          {!isDemo && <span className="badge badge-navy">{paper.language}</span>}
          {pct === 100 && <span className="badge badge-green">本篇已完成</span>}
        </div>
        <p className="reader-abstract">
          {isDemo
            ? '教学演示案例：未提供真实作者、期刊与 DOI，内容仅供学习论文结构与科研方法。'
            : `${paper.authors.join(' · ')} · ${paper.publication.publishedDate} · DOI ${paper.doi}`}
        </p>
        <p className="reader-abstract">{isDemo ? paper.abstract : paper.paperType}</p>
        <div className="reader-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="reader-progress-label">
            已理解 {understood.length}/{paper.sections.length} 节 · {pct}%
          </span>
        </div>
        <p className="reader-disclaimer">
          <Icon name="spark" size={13} />
          {isDemo ? demoDisclaimer : paper.sourcePolicy.paperFacts}
        </p>
      </section>

      <div className="reader-grid">
        {/* 左栏：目录 */}
        <nav className="reader-toc" aria-label="论文目录">
          <div className="card toc-card">
            <div className="toc-title">
              <Icon name="reader" size={15} />
              论文目录
            </div>
            {paper.sections.map((s, i) => {
              const done = understood.includes(s.id)
              return (
                <button
                  key={s.id}
                  className={`toc-item${s.id === sectionId ? ' active' : ''}${done ? ' done' : ''}`}
                  onClick={() => gotoSection(s.id)}
                  aria-current={s.id === sectionId ? 'true' : undefined}
                >
                  <span className="toc-index">
                    {done ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="toc-label">
                    {s.title}
                    <small>{done ? '已理解' : s.id === sectionId ? '阅读中' : '未学习'}</small>
                  </span>
                </button>
              )
            })}
            <div className="toc-foot">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="card-sub">本篇进度 {pct}%</span>
            </div>
          </div>
        </nav>

        {/* 中栏：正文（专业摘要 + 通俗解释 + 来源标注） */}
        <article className="reader-article section-enter" ref={articleRef} key={paper.id + section.id}>
          <div className="card card-pad">
            <header className="section-head">
              <span className="section-num">{String(idx + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="section-title">{section.title}</h2>
                <div className="card-sub">{section.subtitle}</div>
              </div>
              {section.contentOrigin && (
                <span className={`badge ${section.contentOrigin === 'paper_fact' ? 'badge-blue' : 'badge-amber'}`}>
                  {ORIGIN_LABEL[section.contentOrigin] ?? section.contentOrigin}
                </span>
              )}
              {isDemo && <span className="badge badge-amber">演示内容</span>}
              {isDone && <span className="badge badge-green section-done-badge">已理解</span>}
            </header>

            {!hasSectionContent(section) ? (
              <p className="reader-p">本节内容尚未整理，暂无可阅读的正文；不会生成替代内容。</p>
            ) : section.blocks ? (
              <>
                {section.blocks.map((b, i) => (
                  <Block key={i} block={b} activeTerm={active} onTerm={(t) => setActive({ kind: 'kn', ...t })} />
                ))}
                <p className="table-note">演示案例正文：结构与方法教学用途，非真实发表文献。</p>
              </>
            ) : (
              <>
                <div className="detail-label">专业摘要</div>
                <p className="reader-p">{renderText(section.professionalSummary)}</p>
                <div className="points-box">
                  <div className="points-title">
                    <Icon name="spark" size={14} />
                    通俗解释 · 面向大一学生
                  </div>
                  <p className="reader-p" style={{ marginBottom: 0 }}>{section.studentExplanation ? renderText(section.studentExplanation) : '通俗解释尚未整理。'}</p>
                </div>
                <p className="table-note">
                  来源：论文第 {(section.source?.pages ?? []).join('、')} 页 · {(section.source?.sections ?? []).join(' / ')}
                </p>

                {section.id === 'paper_section_method' && <ReviewMethodCard rm={paper.reviewMethod} />}
                {section.id === 'paper_section_findings' && <VisualEvidenceCard items={paper.visualEvidence} />}
                {section.id === 'paper_section_limitations' && <QualityNotesCard notes={paper.qualityNotes} />}
              </>
            )}

            <footer className="section-foot">
              <button
                className="btn btn-ghost"
                disabled={idx === 0}
                onClick={() => gotoSection(paper.sections[idx - 1].id)}
              >
                上一节
              </button>
              <button
                className={`btn ${isDone ? 'btn-understood-done' : 'btn-understood'}`}
                disabled={!hasSectionContent(section)}
                onClick={() => toggleUnderstood(paper.id, section.id)}
                aria-pressed={isDone}
              >
                <Icon name="check" size={16} strokeWidth={2.6} />
                {isDone ? '已理解 · 点击取消' : '标记本节已理解'}
              </button>
              <button className="btn btn-primary" onClick={onNext}>
                {idx < paper.sections.length - 1
                  ? `下一步：${paper.sections[idx + 1].title}`
                  : '返回仪表盘'}
                <Icon name="arrowRight" size={15} />
              </button>
            </footer>
          </div>
        </article>

        {/* 右栏：学习目标 / 术语检索 / 知识节点 / 笔记 */}
        <aside className="reader-side">
          <div className="card card-pad side-card">
            <div className="card-head">
              <h3 className="card-title">
                <span className="title-icon"><Icon name="target" size={16} /></span>
                {isDemo ? '本节学习提示' : '本节学习目标'}
              </h3>
            </div>
            {isDemo ? (
              <ul className="tip-list">
                {(section.tips ?? []).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : sectionObjectives.length === 0 ? (
              <p className="card-sub">本节暂无挂载知识点。</p>
            ) : (
              <ul className="tip-list">
                {sectionObjectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
            <div className="question-box">
              <div className="question-title">
                <Icon name="quiz" size={14} />
                {isDemo ? '思考题' : '思考题（来自预置题库）'}
              </div>
              {isDemo ? (
                (section.questions ?? []).map((q, i) => <p key={i}>{q}</p>)
              ) : sectionQuestions.length === 0 ? (
                <p>本节暂无关联思考题。</p>
              ) : (
                sectionQuestions.map((q) => <p key={q.id}>{q.question}</p>)
              )}
            </div>
          </div>

          <div className="card card-pad side-card term-panel">
            <div className="card-head">
              <h3 className="card-title">
                <span className="title-icon"><Icon name="book" size={16} /></span>
                术语检索
              </h3>
              <span className="badge badge-blue">{isDemo ? '演示案例' : `${L.glossary.length} 条`}</span>
            </div>
            {isDemo ? (
              <p className="card-sub" style={{ marginBottom: 'var(--sp-3)' }}>
                演示案例未预置术语表；点击正文蓝色术语或本节知识节点查看解释卡片。
              </p>
            ) : (
              <>
                <input
                  className="note-input glossary-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索术语 / 缩写 / 定义…"
                  aria-label="搜索术语"
                />
                <div className="glossary-list">
                  {glossResults.length === 0 ? (
                    <p className="card-sub">没有匹配的术语。</p>
                  ) : (
                    glossResults.slice(0, 8).map((t) => (
                      <button
                        key={t.id}
                        className={`glossary-item${active?.kind === 'gloss' && active.id === t.id ? ' active' : ''}`}
                        onClick={() => setActive({ kind: 'gloss', id: t.id })}
                      >
                        <strong>{t.term}</strong>
                        {t.abbreviation && <small>{t.abbreviation}</small>}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
            {active ? (
              active.kind === 'gloss' ? (
                <GlossaryCard id={active.id} onOpenKnowledge={(id) => setActive({ kind: 'kn', id })} />
              ) : (
                <KnowledgeCard id={active.id} onOpenKnowledge={(id) => setActive({ kind: 'kn', id })} />
              )
            ) : (
              <p className="card-sub term-empty">
                点击正文中的<span className="term term-demo">蓝色术语</span>、上方检索结果或本节知识节点，这里会显示解释卡片。
              </p>
            )}
          </div>

          <div className="card card-pad side-card">
            <div className="card-head">
              <h3 className="card-title">
                <span className="title-icon"><Icon name="nodes" size={16} /></span>
                本节知识节点
              </h3>
            </div>
            <div className="mastered-chips">
              {section.nodes.map((id) => {
                const n = getNode(id)
                return (
                  <button
                    key={id}
                    className={`mastered-chip chip-btn${mastered.has(id) ? ' lit' : ''}`}
                    onClick={() => setActive({ kind: 'kn', id })}
                    title={mastered.has(id) ? '已掌握 · 点击查看解释' : '未掌握 · 点击查看解释'}
                  >
                    <span className="domain-dot" style={{ background: domainColors[n.domain] }} />
                    {n.name}
                    {mastered.has(id) && <Icon name="check" size={12} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
            <p className="card-sub" style={{ marginTop: 'var(--sp-3)' }}>
              章节与知识点的关联依据双方 source 字段编号匹配；标记「已理解」后节点点亮并同步到仪表盘与知识地图。
            </p>
          </div>

          <NotesCard paperId={paper.id} sectionId={section.id} />
        </aside>
      </div>

      {/* 移动端：解释底部弹层 */}
      {active && (
        <div className="term-sheet" role="dialog" aria-label="术语与知识解释">
          <div className="term-sheet-bar">
            <span>{active.kind === 'gloss' ? '术语解释' : '知识解释'}</span>
            <button className="term-sheet-close" onClick={() => setActive(null)} aria-label="关闭解释卡片">
              ✕
            </button>
          </div>
          <div className="term-sheet-body">
            {active.kind === 'gloss' ? (
              <GlossaryCard id={active.id} onOpenKnowledge={(id) => setActive({ kind: 'kn', id })} />
            ) : (
              <KnowledgeCard id={active.id} onOpenKnowledge={(id) => setActive({ kind: 'kn', id })} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function initialSection(paper, learning) {
  const target = (learning.lastPaper === paper.id ? learning.lastSection : null) ?? learning.readingProgress?.[paper.id]?.lastSection
  if (target && paper.sections.some((s) => s.id === target)) return target
  return paper.sections.find((s) => !getUnderstood(learning, paper.id).includes(s.id))?.id ?? paper.sections[0].id
}

function SourceLine({ source }) {
  if (!source) return null
  return (
    <p className="table-note">
      来源：论文第 {(source.pages ?? []).join('、')} 页 · {(source.sections ?? []).join(' / ')}
      {source.kind ? ` · ${ORIGIN_LABEL[source.kind] ?? source.kind}` : ''}
    </p>
  )
}

function GlossaryCard({ id, onOpenKnowledge }) {
  const t = L.glossary.find((x) => x.id === id)
  if (!t) return null
  return (
    <div className="term-card section-enter">
      <div className="term-card-head">
        <span className="domain-dot" style={{ background: 'var(--cyan-500)' }} />
        <div>
          <div className="term-name">{t.term}</div>
          {t.abbreviation && <div className="term-en">{t.abbreviation}</div>}
        </div>
      </div>
      <p className="term-def">{t.definition}</p>
      <div className="term-why">
        <strong>通俗解释</strong>
        {t.simpleExplanation}
      </div>
      <div className="mastered-chips" style={{ marginTop: 'var(--sp-2)' }}>
        {t.relatedKnowledge.map((k) => (
          <button className="mastered-chip chip-btn" key={k} onClick={() => onOpenKnowledge(k)}>
            {getNode(k)?.name ?? k}
            <Icon name="arrowRight" size={11} />
          </button>
        ))}
      </div>
    </div>
  )
}

function KnowledgeCard({ id, onOpenKnowledge }) {
  const n = getNode(id)
  if (!n) return null
  return (
    <div className="term-card section-enter">
      <div className="term-card-head">
        <span className="domain-dot" style={{ background: domainColors[n.domain] }} />
        <div>
          <div className="term-name">{n.name}</div>
          <div className="term-en">{n.category} · {n.difficulty ? `难度 ${n.difficulty}/4` : '演示知识节点'}</div>
        </div>
      </div>
      <p className="term-def">{n.explanation}</p>
      {n.learningObjectives.length > 0 && (
        <div className="term-why">
          <strong>学习目标</strong>
          <ul className="tip-list" style={{ marginTop: 4 }}>
            {n.learningObjectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {n.example && (
        <div className="term-tip">
          <Icon name="spark" size={13} />
          示例：{n.example}
        </div>
      )}
      {n.prerequisites.length > 0 && (
        <div className="mastered-chips" style={{ marginTop: 'var(--sp-2)' }}>
          {n.prerequisites.map((p) => (
            <button className="mastered-chip chip-btn" key={p} onClick={() => onOpenKnowledge(p)} title="前置知识">
              前置 · {getNode(p)?.name ?? p}
            </button>
          ))}
        </div>
      )}
      <SourceLine source={n.source} />
    </div>
  )
}

function ReviewMethodCard({ rm }) {
  return (
    <div className="table-box">
      <div className="points-title">
        <Icon name="map" size={14} />
        综述检索与筛选过程（论文方法节）
      </div>
      <ul className="tip-list">
        <li>阶段：{rm.phases.join(' → ')}</li>
        <li>数据库：{rm.databases.join('、')}；补充来源：{rm.supplementarySource}</li>
        <li>关键词：{rm.keywords.join('、')}；时间窗：{rm.timeWindow}；语言：{rm.languageFilter}</li>
      </ul>
      <div className="table-scroll">
        <table className="reader-table">
          <thead>
            <tr>
              <th>来源</th>
              {Object.keys(rm.finalCountsBySource).map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="cell-key">纳入记录数</td>
              {Object.values(rm.finalCountsBySource).map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="table-note">{rm.countCaution}</div>
    </div>
  )
}

function VisualEvidenceCard({ items }) {
  return (
    <div className="points-box">
      <div className="points-title">
        <Icon name="reader" size={14} />
        论文图示证据（转述，非本文作者自测）
      </div>
      <ul className="tip-list">
        {items.map((v) => (
          <li key={v.id}>
            <strong>{v.name}</strong>（第 {v.page} 页）：{v.description}
          </li>
        ))}
      </ul>
    </div>
  )
}

function QualityNotesCard({ notes }) {
  return (
    <div className="points-box">
      <div className="points-title">
        <Icon name="check" size={14} />
        阅读质量提示
      </div>
      <ul className="tip-list">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  )
}

function Block({ block, activeTerm, onTerm }) {
  if (block.type === 'p') {
    return (
      <p className="reader-p">
        {block.parts.map((part, i) => {
          if (typeof part === 'string') return <span key={i}>{part}</span>
          const node = getNode(part.term)
          const active = activeTerm?.id === part.term
          return (
            <button
              key={i}
              className={`term${active ? ' active' : ''}`}
              onClick={() => onTerm({ id: part.term, why: part.why })}
              title="点击查看解释"
            >
              {node?.name ?? part.term}
            </button>
          )
        })}
      </p>
    )
  }
  if (block.type === 'points') {
    return (
      <div className="points-box">
        <div className="points-title">
          <Icon name="check" size={14} strokeWidth={2.6} />
          {block.title}
        </div>
        <ul>
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      </div>
    )
  }
  if (block.type === 'flow') {
    return (
      <div className="flow-box">
        <div className="points-title">
          <Icon name="map" size={14} />
          {block.title}
        </div>
        <div className="flow-steps">
          {block.steps.map((s, i) => (
            <span className="flow-unit" key={i}>
              <span className="flow-step">{s}</span>
              {i < block.steps.length - 1 && (
                <span className="flow-arrow">
                  <Icon name="arrowRight" size={14} />
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    )
  }
  if (block.type === 'table') {
    return (
      <div className="table-box">
        <div className="points-title">
          <Icon name="reader" size={14} />
          {block.title}
        </div>
        <div className="table-scroll">
          <table className="reader-table">
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={j === 0 ? 'cell-key' : ''}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {block.note && <div className="table-note">{block.note}</div>}
      </div>
    )
  }
  return null
}

function NotesCard({ paperId, sectionId }) {
  const learning = useLearning()
  const notes = getNotes(learning).filter((n) => n.paperId === paperId && n.sectionId === sectionId)
  const [text, setText] = useState('')

  const save = () => {
    const t = text.trim()
    if (!t) return
    addNote({ id: `n${Date.now()}`, paperId, sectionId, text: t, ts: Date.now() })
    setText('')
  }

  return (
    <div className="card card-pad side-card notes-card">
      <div className="card-head">
        <h3 className="card-title">
          <span className="title-icon"><Icon name="edit" size={16} /></span>
          本节笔记
        </h3>
        <span className="badge badge-blue">{notes.length} 条</span>
      </div>
      <textarea
        className="note-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="记录你的理解、疑问或联想…仅保存在本地浏览器"
        rows={3}
        maxLength={500}
        aria-label="本节笔记输入"
      />
      <div className="note-actions">
        <span className="card-sub">{text.length}/500</span>
        <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={save}>
          <Icon name="check" size={13} />
          保存笔记
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="note-list">
          {[...notes].reverse().map((n) => (
            <li className="note-item" key={n.id}>
              <p>{n.text}</p>
              <div className="note-foot">
                <span className="card-sub">{formatTs(n.ts)}</span>
                <button className="note-del" onClick={() => deleteNote(n.id)} aria-label="删除笔记" title="删除笔记">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}