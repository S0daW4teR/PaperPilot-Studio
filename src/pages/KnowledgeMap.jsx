import { useMemo, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { loadState, saveState } from '../lib/storage.js'
import {
  useLearning,
  getMasteredIds,
  getUnderstood,
  papers,
  getQuizAnswers,
  addQuizAnswer,
  setLastPaper,
  setLastSection,
} from '../lib/learningStore.js'
import { L } from '../lib/lorawanData.js'
import { diagnose, selfTest as testDiagnosis } from '../engines/diagnosisEngine.js'
import { recommendPath, selfTest as testPath } from '../engines/pathEngine.js'
import { analyzeAnswer, summarizeRecords, selfTest as testFeedback } from '../engines/feedbackEngine.js'
import { generateIdeas, listDirections, selfTest as testInspiration } from '../engines/inspirationEngine.js'
import templates from '../data/ideaTemplates.json'

const graph = L.graph
const bank = L.mapBank

const NODE_W = 176
const NODE_H = 88

/* SVG 文本不自动换行：按估算宽度把节点名折成最多两行，避免溢出节点框 */
function nameLines(name) {
  const max = NODE_W - 32
  const fs = 13.5
  const lines = []
  let cur = ''
  let w = 0
  for (const ch of name) {
    const cw = ch.charCodeAt(0) < 256 ? fs * 0.62 : fs
    if (w + cw > max && cur) {
      lines.push(cur)
      cur = ch
      w = cw
    } else {
      cur += ch
      w += cw
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 2)
}

const stateMeta = {
  mastered: { label: '已掌握', cls: 'st-mastered' },
  learning: { label: '学习中', cls: 'st-learning' },
  available: { label: '可学习', cls: 'st-available' },
  locked: { label: '未解锁', cls: 'st-locked' },
}

const actionMeta = {
  read: { icon: 'reader', label: '读论文' },
  quiz: { icon: 'quiz', label: '做小测' },
  review: { icon: 'spark', label: '复习错题' },
}

export default function KnowledgeMap() {
  const learning = useLearning()
  const diagnosis = useMemo(
    () =>
      diagnose(graph, {
        masteredNodeIds: [
          ...getMasteredIds(learning),
          ...papers.flatMap((p) => getUnderstood(learning, p.id)),
        ],
        quizAnswers: getQuizAnswers(learning),
      }),
    [learning],
  )
  const path = useMemo(() => recommendPath(graph, diagnosis), [diagnosis])
  const [selectedId, setSelectedId] = useState(() => path.next?.id ?? graph.nodes[0].id)
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? graph.nodes[0]
  const d = diagnosis.nodes[selected.id]

  const openPaperSection = () => {
    setLastPaper(selected.paper.paperId)
    setLastSection(selected.paper.sectionId)
    navigate('reader')
  }

  return (
    <div className="page map-page">
      <section className="card card-pad map-head">
        <div className="map-head-copy">
          <div className="hero-eyebrow map-eyebrow">
            <Icon name="map" size={14} />
            KNOWLEDGE GRAPH · 教学案例一
          </div>
          <h1 className="map-title">{graph.caseTitle}</h1>
          <p className="card-sub map-desc">{graph.caseDesc}</p>
        </div>
        <div className="map-head-stats">
          <div className="map-stat">
            <span className="map-stat-value">{diagnosis.summary.masteredCount}<small>/{graph.nodes.length}</small></span>
            <span className="card-sub">已掌握节点</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{diagnosis.summary.avgScore}<small>分</small></span>
            <span className="card-sub">平均掌握度</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{diagnosis.summary.weakIds.length}<small>个</small></span>
            <span className="card-sub">待强化节点</span>
          </div>
        </div>
      </section>

      <section className="card card-pad path-card">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="trendUp" size={17} /></span>
            推荐学习顺序
          </h2>
          <span className="badge badge-cyan">学习路径引擎 · 规则 P1–P4</span>
        </div>
        {path.order.length === 0 ? (
          <p className="card-sub">全部节点已掌握，本案例知识链闭环完成。可以去灵感引擎挑一个探索课题。</p>
        ) : (
          <div className="path-chain">
            {path.order.map((it, i) => (
              <span className="path-unit" key={it.id}>
                <button
                  className={`path-chip${path.next?.id === it.id ? ' next' : ''}${it.id === selectedId ? ' sel' : ''}`}
                  onClick={() => setSelectedId(it.id)}
                  title={it.reason}
                >
                  <span className="path-idx">{i + 1}</span>
                  {it.name}
                  <span className="path-action">
                    <Icon name={actionMeta[it.action].icon} size={12} />
                    {actionMeta[it.action].label}
                  </span>
                </button>
                {i < path.order.length - 1 && <span className="path-arrow"><Icon name="arrowRight" size={13} /></span>}
              </span>
            ))}
          </div>
        )}
        {path.next && (
          <p className="path-next-note">
            <Icon name="spark" size={13} />
            当前建议从「{path.next.name}」开始：{path.next.reason}
          </p>
        )}
        <p className="rule-foot">顺序由依赖图拓扑排序生成，理由来自诊断证据；悬停每个节点可查看具体规则依据。</p>
      </section>

      <div className="map-grid">
        <section className="card map-canvas-card">
          <div className="map-scroll">
            <svg viewBox={`0 0 ${graph.viewBox.w} ${graph.viewBox.h}`} className="map-svg" role="group" aria-label="知识依赖地图">
              <defs>
                <marker id="arrowOn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="#4C82FF" />
                </marker>
                <marker id="arrowOff" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="#B9C6DC" />
                </marker>
                <linearGradient id="nodeGradOn" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#E3F7EA" />
                  <stop offset="1" stopColor="#DFF8FD" />
                </linearGradient>
                <linearGradient id="nodeGradLearn" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#E3ECFF" />
                  <stop offset="1" stopColor="#F8FAFD" />
                </linearGradient>
              </defs>

              <text className="map-canvas-tag" x="24" y="34">CASE 01 · LORA-WSN DEPENDENCY GRAPH</text>
              <text className="map-canvas-tag" x="956" y="506" textAnchor="end">
                {graph.nodes.length} NODES / {graph.nodes.reduce((s, n) => s + (n.deps?.length ?? 0), 0)} EDGES · TOPOLOGICAL ORDER
              </text>

              {graph.nodes.flatMap((n) =>
                (n.deps ?? []).map((depId) => {
                  const dep = graph.nodes.find((x) => x.id === depId)
                  const on = diagnosis.nodes[depId].state === 'mastered'
                  const hot = path.next?.id === n.id
                  const x1 = dep.x + NODE_W
                  const y1 = dep.y + NODE_H / 2
                  const x2 = n.x - 4
                  const y2 = n.y + NODE_H / 2
                  const mx = (x1 + x2) / 2
                  const span = Math.round((n.x - dep.x) / 196)
                  const bow = span > 1 ? 40 + 24 * (span - 1) : 0
                  const d =
                    n.x <= dep.x
                      ? `M ${dep.x - 4} ${y1} C ${dep.x - 34} ${y1}, ${n.x - 34} ${y2}, ${n.x - 4} ${y2}`
                      : `M ${x1} ${y1} C ${mx} ${y1 - bow}, ${mx} ${y2 - bow}, ${x2} ${y2}`
                  return (
                    <path
                      key={`${depId}-${n.id}`}
                      d={d}
                      className={`map-edge${on ? ' on' : ''}${hot ? ' hot' : ''}`}
                      markerEnd={on ? 'url(#arrowOn)' : 'url(#arrowOff)'}
                    />
                  )
                }),
              )}

              {graph.edges
                .filter((e) => e.relationship !== 'prerequisite')
                .map((e) => {
                  const s = graph.nodes.find((x) => x.id === e.source)
                  const t = graph.nodes.find((x) => x.id === e.target)
                  if (!s || !t) return null
                  const x1 = s.x + NODE_W
                  const y1 = s.y + NODE_H / 2
                  const x2 = t.x - 4
                  const y2 = t.y + NODE_H / 2
                  const mx = (x1 + x2) / 2
                  const span = Math.round((t.x - s.x) / 196)
                  const bow = span > 1 ? 40 + 24 * (span - 1) : 0
                  const d =
                    t.x <= s.x
                      ? `M ${s.x - 4} ${y1} C ${s.x - 34} ${y1}, ${t.x - 34} ${y2}, ${t.x - 4} ${y2}`
                      : `M ${x1} ${y1} C ${mx} ${y1 - bow}, ${mx} ${y2 - bow}, ${x2} ${y2}`
                  return (
                    <path
                      key={e.id}
                      d={d}
                      className="map-edge aux"
                    >
                      <title>{`${e.relationship}：${e.explanation}`}</title>
                    </path>
                  )
                })}

              {graph.nodes.map((n) => {
                const nd = diagnosis.nodes[n.id]
                const meta = stateMeta[nd.state]
                const isSel = n.id === selectedId
                const isNext = path.next?.id === n.id
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className={`map-node ${meta.cls}${isSel ? ' sel' : ''}`}
                    onClick={() => setSelectedId(n.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedId(n.id)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${n.name}，${meta.label}，掌握度 ${nd.score} 分`}
                  >
                    {isNext && <rect className="node-halo" x="-6" y="-6" width={NODE_W + 12} height={NODE_H + 12} rx="20" />}
                    <rect className="node-box" width={NODE_W} height={NODE_H} rx="16" />
                    {nameLines(n.name).map((line, li) => (
                      <text className="n-name" x="16" y={26 + li * 16} key={li}>{line}</text>
                    ))}
                    <text className="n-score" x={NODE_W - 14} y="66" textAnchor="end">{nd.score}</text>
                    {n.en && <text className="n-en" x="16" y="56">{n.en}</text>}
                    <text className="n-state" x="16" y="66">{meta.label}</text>
                    <rect className="n-track" x="16" y="72" width={NODE_W - 32} height="5" rx="2.5" />
                    <rect className="n-fill" x="16" y="72" width={(NODE_W - 32) * (nd.score / 100)} height="5" rx="2.5" />
                  </g>
                )
              })}
            </svg>
          </div>
          <p className="map-swipe-hint">
            <Icon name="arrowRight" size={12} />
            左右滑动查看完整依赖地图
          </p>
          <div className="map-legend">
            {Object.entries(stateMeta).map(([k, v]) => (
              <span className={`legend-item ${v.cls}`} key={k}>
                <span className="legend-dot" />
                {v.label}
              </span>
            ))}
            <span className="legend-item legend-edge"><span className="legend-line" />依赖方向（前置 → 后续）</span>
            <span className="legend-item legend-aux"><span className="legend-line aux" />教学关联（component / application / related，悬停边查看）</span>
          </div>
        </section>

        <aside className="map-side">
          <section className="card card-pad node-detail">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="nodes" size={17} /></span>
                {selected.name}
              </h2>
              <span className={`badge state-badge ${stateMeta[d.state].cls}`}>{stateMeta[d.state].label}</span>
            </div>
            <div className="term-en" style={{ marginBottom: 'var(--sp-3)' }}>{selected.en}</div>
            <p className="node-desc">{selected.desc}</p>

            <div className="mastery-box">
              <div className="mastery-head">
                <span>掌握度 {d.score} / 100</span>
                <span className="card-sub">诊断引擎 D1–D4</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${d.score}%` }} />
              </div>
              <div className="mastery-parts">
                <span>论文理解 {Math.round(d.readerCoverage * 100)}% × {d.noQuiz ? '1.0（D5）' : '0.7'}</span>
                {d.noQuiz ? (
                  <span>无预置小测题 · 论文理解为唯一证据</span>
                ) : (
                  <span>小测验证 {d.quizCount ? Math.round(d.quizAccuracy * 100) : 0}% × 0.3（{d.quizCount} 题）</span>
                )}
              </div>
            </div>

            <div className="detail-block">
              <div className="detail-label">学习目标</div>
              <ul className="tip-list">
                {(selected.learningObjectives ?? []).map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </div>

            <div className="detail-block">
              <div className="detail-label">示例</div>
              <p className="node-desc">{selected.example}</p>
            </div>

            <div className="detail-block">
              <div className="detail-label">前置知识</div>
              {selected.deps.length === 0 ? (
                <span className="card-sub">无前置，可直接开始。</span>
              ) : (
                <div className="mastered-chips">
                  {selected.deps.map((depId) => {
                    const dep = graph.nodes.find((x) => x.id === depId)
                    const ds = diagnosis.nodes[depId].state
                    return (
                      <button
                        key={depId}
                        className={`mastered-chip chip-btn dep-chip ${stateMeta[ds].cls}`}
                        onClick={() => setSelectedId(depId)}
                      >
                        {dep.name}
                        <small>{stateMeta[ds].label}</small>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="detail-block">
              <div className="detail-label">关联术语</div>
              <div className="mastered-chips">
                {L.glossary
                  .filter((t) => t.relatedKnowledge.includes(selected.id))
                  .map((t) => (
                    <span className="mastered-chip" key={t.id} title={t.definition}>
                      {t.term}
                      {t.abbreviation ? ` · ${t.abbreviation}` : ''}
                    </span>
                  ))}
              </div>
            </div>

            <div className="detail-block">
              <div className="detail-label">来源</div>
              <p className="card-sub">
                论文第 {(selected.source?.pages ?? []).join('、')} 页 · {(selected.source?.sections ?? []).join(' / ')}
              </p>
            </div>

            <button className="btn btn-primary node-paper-btn" onClick={openPaperSection}>
              <Icon name="reader" size={15} />
              阅读关联论文章节
            </button>
          </section>

          <NodeQuiz key={selected.id} node={selected} />
        </aside>
      </div>

      <InspirationPanel weakIds={diagnosis.summary.weakIds} />
      <EngineSelfTest />
    </div>
  )
}

function NodeQuiz({ node }) {
  const qs = bank.questions.filter((q) => (q.linked ?? [q.node]).includes(node.id))
  const [idx, setIdx] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [results, setResults] = useState([])
  const [finished, setFinished] = useState(false)

  if (qs.length === 0) {
    return (
      <section className="card card-pad">
        <p className="card-sub">该节点暂无小测题目。</p>
      </section>
    )
  }

  const q = qs[idx]
  const feedback = chosen !== null ? analyzeAnswer(bank, q.id, chosen) : null
  const correctCount = results.filter(Boolean).length

  const choose = (i) => {
    if (chosen !== null) return
    setChosen(i)
    const fb = analyzeAnswer(bank, q.id, i)
    addQuizAnswer({ qid: q.id, node: node.id, correct: fb.correct, ts: Date.now() })
    setResults((r) => [...r, fb.correct])
  }

  const next = () => {
    if (idx < qs.length - 1) {
      setIdx(idx + 1)
      setChosen(null)
    } else {
      setFinished(true)
    }
  }

  const restart = () => {
    setIdx(0)
    setChosen(null)
    setResults([])
    setFinished(false)
  }

  const sessionSummary = summarizeRecords(bank, results.map((correct, i) => ({ qid: qs[i].id, node: node.id, correct })))
  const rec = sessionSummary.nodes[0]

  return (
    <section className="card card-pad quiz-card">
      <div className="card-head">
        <h2 className="card-title">
          <span className="title-icon"><Icon name="quiz" size={17} /></span>
          节点小测
        </h2>
        <span className="badge badge-blue">{finished ? '完成' : `${idx + 1}/${qs.length}`}</span>
      </div>

      {finished ? (
        <div className="quiz-finish">
          <div className={`quiz-finish-score ${correctCount === qs.length ? 'good' : ''}`}>
            {correctCount}/{qs.length}
          </div>
          <p className="card-sub">
            {correctCount === qs.length
              ? '全部答对，验证证据已计入掌握度（规则 F3 / D2）。'
              : `答错 ${qs.length - correctCount} 题，已匹配到本节点并计入诊断（规则 F1）。`}
          </p>
          {rec?.priorityReview && <p className="quiz-warn">累计答错 ≥ 2：建议先重读节点解释与论文章节（规则 F2）。</p>}
          <button className="btn btn-ghost btn-sm" onClick={restart}>
            重测本节点
          </button>
        </div>
      ) : (
        <>
          <p className="quiz-prompt">{q.prompt}</p>
          <div className="quiz-options">
            {q.options.map((opt, i) => {
              let cls = ''
              if (chosen !== null) {
                if (i === q.answer) cls = 'right'
                else if (i === chosen) cls = 'wrong'
                else cls = 'dim'
              }
              return (
                <button key={i} className={`quiz-option ${cls}`} onClick={() => choose(i)} disabled={chosen !== null}>
                  <span className="opt-key">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              )
            })}
          </div>
          {feedback && (
            <div className={`quiz-feedback ${feedback.correct ? 'good' : 'bad'}`}>
              <div className="quiz-feedback-head">
                <Icon name={feedback.correct ? 'check' : 'spark'} size={14} strokeWidth={2.6} />
                {feedback.correct ? '回答正确 · 证据已记录' : `回答错误 · 匹配节点「${node.name}」（规则 F1）`}
              </div>
              <p>{feedback.explanation}</p>
              {!feedback.correct && feedback.remediation && <p className="quiz-remediation">{feedback.remediation.text}</p>}
              <button className="btn btn-primary btn-sm" onClick={next}>
                {idx < qs.length - 1 ? '下一题' : '查看结果'}
                <Icon name="arrowRight" size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function InspirationPanel({ weakIds }) {
  const directions = listDirections(templates)
  const [dirId, setDirId] = useState(() => loadState('inspirationDir', directions[0].id))
  const [seed, setSeed] = useState(() => loadState('inspirationSeed', 0))
  const result = generateIdeas(templates, dirId, { weakNodeIds: weakIds, seed })

  const changeDir = (id) => {
    setDirId(id)
    saveState('inspirationDir', id)
  }
  const regenerate = () => {
    const s = seed + 1
    setSeed(s)
    saveState('inspirationSeed', s)
  }

  return (
    <section className="card card-pad inspiration-card">
      <div className="card-head">
        <h2 className="card-title">
          <span className="title-icon"><Icon name="spark" size={17} /></span>
          科研灵感引擎
        </h2>
        <span className="badge badge-amber">本地模板组合 · 非生成式</span>
      </div>
      <p className="card-sub" style={{ marginBottom: 'var(--sp-4)' }}>
        选择技术方向，引擎从预置研究案例模板的「场景 × 方法 × 指标」槽位中确定性组合出探索课题，每条建议附来源编号。
      </p>
      <div className="inspiration-controls">
        <label className="paper-switch">
          <span className="card-sub">技术方向</span>
          <select value={dirId} onChange={(e) => changeDir(e.target.value)} aria-label="选择技术方向">
            {directions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary btn-sm" onClick={regenerate}>
          <Icon name="spark" size={14} />
          换一组建议（seed {seed} → {seed + 1}）
        </button>
      </div>
      <div className="idea-grid">
        {result.ideas.map((idea) => (
          <article className="idea-card" key={idea.id}>
            <div className="idea-diff" title={`难度 ${idea.difficulty}/4`}>
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={`diff-dot${i < idea.difficulty ? ' on' : ''}`} />
              ))}
            </div>
            <h3 className="idea-title">{idea.title}</h3>
            <p className="idea-question">{idea.question}</p>
            <ol className="idea-plan">
              {idea.plan.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
            {idea.gapNote && <p className="idea-gap">{idea.gapNote}</p>}
            <div className="idea-sources">
              来源 {idea.sources.scenario} · {idea.sources.method} · {idea.sources.metric} · seed {idea.sources.seed}
            </div>
          </article>
        ))}
      </div>
      <p className="rule-foot">{result.ruleText}</p>
    </section>
  )
}

function EngineSelfTest() {
  const [results, setResults] = useState(null)
  const run = () => {
    const data = { graph, bank, templates }
    setResults([testDiagnosis(data), testPath(data), testFeedback(data), testInspiration(data)])
  }
  const total = results?.reduce((s, r) => s + r.cases.length, 0) ?? 0
  const passed = results?.reduce((s, r) => s + r.cases.filter((c) => c.pass).length, 0) ?? 0

  return (
    <section className="card card-pad selftest-card">
      <div className="card-head">
        <h2 className="card-title">
          <span className="title-icon"><Icon name="flask" size={17} /></span>
          引擎自检
        </h2>
        {results && (
          <span className={`badge ${passed === total ? 'badge-green' : 'badge-red'}`}>
            {passed}/{total} 通过
          </span>
        )}
      </div>
      <p className="card-sub" style={{ marginBottom: 'var(--sp-3)' }}>
        四个引擎均为纯函数规则引擎，输出可追溯到预置数据与规则编号。点击在浏览器内运行单元断言；也可在终端执行 <code className="inline-code">npm run test:engines</code>。
      </p>
      <button className="btn btn-ghost btn-sm" onClick={run}>
        <Icon name="quiz" size={14} />
        运行四个引擎的 selfTest
      </button>
      {results && (
        <div className="selftest-grid">
          {results.map((r) => (
            <div className="selftest-engine" key={r.engine}>
              <div className="selftest-head">
                <strong>{r.engine}</strong>
                <span className={`badge ${r.cases.every((c) => c.pass) ? 'badge-green' : 'badge-red'}`}>
                  {r.cases.filter((c) => c.pass).length}/{r.cases.length}
                </span>
              </div>
              <ul>
                {r.cases.map((c, i) => (
                  <li key={i} className={c.pass ? 'pass' : 'fail'}>
                    <Icon name={c.pass ? 'check' : 'spark'} size={11} strokeWidth={3} />
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}