import { useMemo, useRef, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import ProgressRing from '../components/ui/ProgressRing.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { formatTs } from '../lib/format.js'
import { disableWrites } from '../lib/storage.js'
import { useUserProfile, profileInitial } from '../lib/userProfileStore.js'
import {
  useLearning,
  papers,
  nodes,
  getNode,
  getPaper,
  getUnderstood,
  getMasteredIds,
  getFavorites,
  toggleFavorite,
  getNotes,
  deleteNote,
  getStudy,
  getQuizAnswers,
  getQuizSessions,
  paperProgressPct,
  paperStatus,
  overallProgressPct,
  domainCoverage,
  domainColors,
  setLastPaper,
  setLastSection,
  exportArchive,
  validateArchive,
  applyArchive,
  clearAllLocal,
  localUsageBytes,
} from '../lib/learningStore.js'
import { summarizeRecords } from '../engines/feedbackEngine.js'
import { analyzeWeakness, reviewSuggestions, getQuestion } from '../engines/quizEngine.js'
import { L } from '../lib/lorawanData.js'
import { addLocalDays, dayKey, formatDuration } from '../engines/studyTimeEngine.js'

const graph = L.graph
const mapBank = L.mapBank
const quizBank = L.quizBank

export default function LearningProfile({ onEditProfile }) {
  const learning = useLearning()
  const { profile } = useUserProfile()
  const [modal, setModal] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)

  const study = getStudy(learning)
  const masteredIds = getMasteredIds(learning)
  const sessions = getQuizSessions(learning)
  const favorites = getFavorites(learning)
  const notes = getNotes(learning)
  const learnedPapers = papers.filter((p) => paperStatus(learning, p.id) !== 'not-started')
  const quizAvg = sessions.length ? Math.round(sessions.reduce((s, x) => s + x.score, 0) / sessions.length) : null
  const overall = overallProgressPct(learning)
  const domains = domainCoverage(learning)

  const wrongRecords = useMemo(() => {
    const m = {}
    const bump = (qid, ts, source) => {
      const e = m[qid] ?? { count: 0, last: 0, source }
      e.count += 1
      e.last = Math.max(e.last, ts ?? 0)
      m[qid] = e
    }
    for (const a of getQuizAnswers(learning)) if (!a.correct) bump(a.qid, a.ts, 'map')
    for (const s of sessions) {
      s.qids.forEach((qid, i) => {
        const q = getQuestion(quizBank, qid)
        if (q && s.picks[i] !== q.answer) bump(qid, s.ts, 'quiz')
      })
    }
    return Object.entries(m)
      .map(([qid, v]) => {
        const q = mapBank.questions.find((x) => x.id === qid)
        const zq = getQuestion(quizBank, qid)
        const node = graph.nodes.find((n) => (q?.linked ?? [q?.node]).includes(n.id))
        return {
          qid,
          ...v,
          prompt: (q ?? zq)?.prompt ?? qid,
          kind: v.source === 'map' ? '节点小测' : '能力测试',
          target: node?.name ?? '',
          action:
            v.source === 'map'
              ? node
                ? { type: 'map', nodeId: node.id }
                : null
              : zq?.paper
                ? { type: 'reader', ...zq.paper }
                : null,
        }
      })
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, 12)
  }, [learning, sessions])

  const mapReview = useMemo(() => summarizeRecords(mapBank, getQuizAnswers(learning)).weakNodes, [learning])
  const quizWeak = useMemo(() => analyzeWeakness(quizBank, sessions, { nodes }).weak, [sessions])
  const quizWatch = useMemo(() => analyzeWeakness(quizBank, sessions, { nodes }).watch, [sessions])
  const suggestions = useMemo(
    () => reviewSuggestions(quizBank, sessions, { papers, graph, nodes }),
    [sessions],
  )

  const week = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(addLocalDays(Date.now(), -i))
      const key = dayKey(d)
      days.push({ key, label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`, seconds: study.byDay?.[key] ?? 0 })
    }
    return days
  }, [study])
  const maxSec = Math.max(...week.map((d) => d.seconds), 60)

  const usageKb = (localUsageBytes() / 1024).toFixed(1)

  const goAction = (action) => {
    if (!action) return
    if (action.type === 'map') return navigate('map')
    setLastPaper(action.paperId)
    setLastSection(action.sectionId)
    navigate('reader')
  }

  const doExport = () => {
    const archive = exportArchive()
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `paperpilot-profile-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 立即 revoke 会使 Chromium 取消尚未完成的 blob 下载
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const obj = JSON.parse(await file.text())
      const v = validateArchive(obj)
      if (!v.ok) {
        setImportError(`导入被拒绝：${v.error}`)
        return
      }
      setPendingImport(obj.storage)
      setModal('import')
    } catch {
      setImportError('导入被拒绝：文件不是合法 JSON')
    }
  }

  const confirmImport = () => {
    applyArchive(pendingImport)
    setModal(null)
    disableWrites()
    location.reload()
  }

  const confirmClear = () => {
    clearAllLocal()
    setModal(null)
    disableWrites()
    location.reload()
  }

  return (
    <div className="page profile-page">
      <section className="card card-pad lab-head">
        <div className="lab-head-copy">
          <div className="hero-eyebrow">
            <Icon name="user" size={14} />
            LEARNING PROFILE · 学习档案
          </div>
          <h1 className="map-title">我的学习档案</h1>
          <p className="card-sub map-desc">
            全部数据来自你的真实学习行为，仅保存在本浏览器 localStorage 中；可导出为 JSON 备份、导入恢复，或一键清空。
          </p>
        </div>
        <div className="map-head-stats">
          <div className="map-stat">
            <span className="map-stat-value profile-duration">{formatDuration(study.totalSeconds)}</span>
            <span className="card-sub">总学习时间</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{learnedPapers.length}<small>/{papers.length} 篇</small></span>
            <span className="card-sub">已学习论文</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{masteredIds.length}<small>个</small></span>
            <span className="card-sub">已掌握知识点</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{quizAvg ?? '—'}<small>{quizAvg === null ? '' : '分'}</small></span>
            <span className="card-sub">测试平均成绩</span>
          </div>
        </div>
      </section>

      <section className="card card-pad user-profile-summary" aria-label="个人资料">
        <div className="topbar-avatar" aria-hidden="true">{profileInitial(profile) || <Icon name="user" size={19} />}</div>
        <div className="user-profile-copy">
          <h2 className="card-title">{profile?.name ?? '尚未设置个人资料'}</h2>
          <p className="card-sub">{profile ? `${profile.major || '专业未填写'} · ${profile.grade || '年级未填写'}` : '填写姓名、专业和年级，让学习档案属于你。'}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEditProfile}>编辑个人资料</button>
      </section>

      <div className="profile-grid">
        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">
              <span className="title-icon"><Icon name="trendUp" size={17} /></span>
              学习进度
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('map')}>
              知识地图
              <Icon name="arrowRight" size={13} />
            </button>
          </div>
          <div className="profile-progress">
            <div className="profile-ring">
              <ProgressRing pct={overall} />
              <div className="progress-ring-label">
                <div className="pct">{overall}%</div>
                <div className="cap">章节理解</div>
              </div>
            </div>
            <div className="profile-paper-list">
              {papers.map((p) => {
                const pct = paperProgressPct(learning, p.id)
                const done = getUnderstood(learning, p.id).length
                return (
                  <button className="profile-paper-row" key={p.id} onClick={() => { setLastPaper(p.id); navigate('reader') }}>
                    <span className="profile-paper-name">{p.title}</span>
                    <span className="profile-paper-pct">{done}/{p.sections.length} 节 · {pct}%</span>
                    <span className="progress-track">
                      <span className="progress-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="detail-label" style={{ marginTop: 'var(--sp-4)' }}>知识领域覆盖</div>
          {domains.map((d) => (
            <div className="domain-row" key={d.name}>
              <div className="domain-head">
                <span className="domain-name">
                  <span className="domain-dot" style={{ background: d.color }} />
                  {d.name}
                  <span className="card-sub">{d.got}/{d.total}</span>
                </span>
                <span className="domain-pct">{d.pct}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${d.pct}%`, background: d.color }} />
              </div>
            </div>
          ))}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">
              <span className="title-icon"><Icon name="clock" size={17} /></span>
              近 7 日学习时长
            </h2>
            <span className="badge badge-cyan">本地真实计时</span>
          </div>
          <div className="week-chart profile-week">
            {week.map((d) => (
              <div className="week-bar-wrap" key={d.key} title={`${d.label}：${formatDuration(d.seconds)}`}>
                <span className="week-bar-value">{Math.round(d.seconds / 60)}′</span>
                <div className="week-bar-track">
                  <div
                    className={`week-bar${d.label === '今天' ? ' today' : ''}`}
                    style={{ height: `${Math.max((d.seconds / maxSec) * 100, 3)}%` }}
                  />
                </div>
                <span className={`week-bar-day${d.label === '今天' ? ' today' : ''}`}>{d.label}</span>
              </div>
            ))}
          </div>
          <p className="card-sub" style={{ marginTop: 'var(--sp-3)' }}>
            页面打开且处于可见状态时自动累计（切后台不计），累计 {formatDuration(study.totalSeconds)}。
          </p>
          <div className="detail-label" style={{ marginTop: 'var(--sp-4)' }}>已掌握知识点</div>
          {masteredIds.length === 0 ? (
            <p className="card-sub">还没有点亮的知识点：去论文拆解标记「已理解」。</p>
          ) : (
            <div className="mastered-chips">
              {masteredIds.map((id) => {
                const n = getNode(id)
                return (
                  <span className="mastered-chip lit-chip" key={id} title={n?.en}>
                    <span className="domain-dot" style={{ background: domainColors[n?.domain] }} />
                    {n?.name}
                  </span>
                )
              })}
            </div>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">
              <span className="title-icon"><Icon name="spark" size={17} /></span>
              错题记录
            </h2>
            <span className="badge badge-red">{wrongRecords.length} 题</span>
          </div>
          {wrongRecords.length === 0 ? (
            <p className="card-sub">暂无错题。节点小测与能力测试中答错的题目会自动汇总到这里。</p>
          ) : (
            <div className="wrong-list">
              {wrongRecords.map((w) => (
                <div className="wrong-row" key={w.qid}>
                  <div className="wrong-copy">
                    <p>{w.prompt}</p>
                    <small>
                      <span className={`badge ${w.source === 'map' ? 'badge-blue' : 'badge-amber'}`}>{w.kind}</span>
                      {w.target} · 错 {w.count} 次{w.last ? ` · 最近 ${formatTs(w.last)}` : ''}
                    </small>
                  </div>
                  {w.action && (
                    <button className="btn btn-ghost btn-sm" onClick={() => goAction(w.action)}>
                      去复习
                      <Icon name="arrowRight" size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">
              <span className="title-icon"><Icon name="target" size={17} /></span>
              待复习知识点
            </h2>
            <span className="badge badge-amber">规则 F2 / Q3 / Q4</span>
          </div>
          {mapReview.length === 0 && quizWeak.length === 0 && quizWatch.length === 0 ? (
            <p className="card-sub">暂无待复习知识点：累计答错 ≥ 2 次的节点与标签会进入这里。</p>
          ) : (
            <>
              {mapReview.length > 0 && (
                <>
                  <div className="detail-label">知识地图节点（节点小测错题）</div>
                  <div className="weak-chips">
                    {mapReview.map((n) => {
                      const node = graph.nodes.find((x) => x.id === n.node)
                      return (
                        <button className={`weak-chip chip-btn${n.priorityReview ? '' : ' watch'}`} key={n.node} onClick={() => navigate('map')}>
                          {node?.name ?? n.node}
                          <small>错 {n.wrong}{n.priorityReview ? ' · 优先' : ''}</small>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {(quizWeak.length > 0 || quizWatch.length > 0) && (
                <>
                  <div className="detail-label" style={{ marginTop: 'var(--sp-3)' }}>能力测试标签</div>
                  <div className="weak-chips">
                    {[...quizWeak, ...quizWatch].map((w) => (
                      <span className={`weak-chip${w.wrong >= 2 ? '' : ' watch'}${w.kind === 'skill' ? ' skill' : ''}`} key={w.tag}>
                        {w.name}
                        <small>错 {w.wrong}/{w.total}</small>
                      </span>
                    ))}
                  </div>
                </>
              )}
              {suggestions.length > 0 && (
                <>
                  <div className="detail-label" style={{ marginTop: 'var(--sp-3)' }}>复习建议</div>
                  <div className="suggestion-list">
                    {suggestions.map((s) => (
                      <div className="suggestion" key={s.tag}>
                        <div className="suggestion-head">
                          <strong>{s.name}</strong>
                          <code className="inline-code">{s.ref}</code>
                        </div>
                        <p>{s.text}</p>
                        {s.action && (
                          <div className="suggestion-foot">
                            <button className="btn btn-ghost btn-sm" onClick={() => goAction(s.action)}>
                              {s.action.type === 'map' ? '去地图小测' : '去重读章节'}
                              <Icon name="arrowRight" size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">
              <span className="title-icon"><Icon name="star" size={17} /></span>
              收藏论文
            </h2>
            <span className="badge badge-blue">{favorites.length} 篇</span>
          </div>
          {favorites.length === 0 ? (
            <p className="card-sub">还没有收藏。在仪表盘论文行或阅读页头部点击 ☆ 即可收藏。</p>
          ) : (
            <div className="fav-list">
              {favorites.map((id) => getPaper(id)).filter(Boolean).map((p) => {
                const pct = paperProgressPct(learning, p.id)
                return (
                  <div className="fav-row" key={p.id}>
                    <div className="fav-copy">
                      <strong>{p.title}</strong>
                      <small>{p.field} · 已理解 {pct}%</small>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => { setLastPaper(p.id); navigate('reader') }}>
                      阅读
                    </button>
                    <button className="fav-btn icon-only on" onClick={() => toggleFavorite(p.id)} aria-pressed title="取消收藏">
                      <Icon name="star" size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="detail-label" style={{ marginTop: 'var(--sp-4)' }}>学习笔记（{notes.length} 条）</div>
          {notes.length === 0 ? (
            <p className="card-sub">还没有笔记。在阅读页右栏「本节笔记」中记录，会按章节保存在这里。</p>
          ) : (
            <ul className="note-list profile-notes">
              {[...notes].reverse().slice(0, 8).map((n) => {
                const p = getPaper(n.paperId)
                const sec = p?.sections.find((s) => s.id === n.sectionId)
                return (
                  <li className="note-item" key={n.id}>
                    <p>{n.text}</p>
                    <div className="note-foot">
                      <span className="card-sub">
                        {p ? `《${p.title}》· ${sec?.title ?? n.sectionId}` : `历史案例笔记 · ${n.sectionId}`} · {formatTs(n.ts)}
                      </span>
                      <span className="note-foot-actions">
                        {p && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setLastPaper(n.paperId); setLastSection(n.sectionId); navigate('reader') }}>
                            跳转
                          </button>
                        )}
                        <button className="note-del" onClick={() => deleteNote(n.id)} aria-label="删除笔记" title="删除笔记">
                          <Icon name="trash" size={13} />
                        </button>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">
              <span className="title-icon"><Icon name="download" size={17} /></span>
              本地数据管理
            </h2>
            <span className="badge badge-navy">{usageKb} KB</span>
          </div>
          <p className="card-sub" style={{ marginBottom: 'var(--sp-3)' }}>
            本页管理 localStorage 中的个人资料、学习进度、收藏、笔记、测试与计时。用户导入论文独立保存在 IndexedDB，不包含在本页备份中，请在论文库逐篇导出 JSON。所有数据均不上传服务器。
          </p>
          <div className="data-actions">
            <button className="btn btn-primary" onClick={doExport}>
              <Icon name="download" size={15} />
              导出学习档案 JSON
            </button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={15} />
              导入学习档案 JSON
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="file-hidden" onChange={onFile} aria-label="选择档案文件" />
            <button className="btn btn-danger" onClick={() => setModal('clear')}>
              <Icon name="trash" size={15} />
              清空本地数据
            </button>
          </div>
          {importError && <p className="data-error">{importError}</p>}
          <ul className="tip-list data-keys">
            <li>导出：生成带 app 标识与版本号的 JSON 快照，可跨浏览器备份。</li>
            <li>导入：先校验结构，再经确认弹窗覆盖本地数据；非法文件会被拒绝并提示原因。</li>
            <li>清空：删除全部 paperpilot: 键，操作前必须二次确认。</li>
          </ul>
        </section>
      </div>

      <ConfirmModal
        open={modal === 'import'}
        tone="primary"
        title="导入学习档案"
        confirmLabel="覆盖并导入"
        body={
          <>
            <p>导入将<strong>覆盖</strong>当前浏览器中的学习进度、收藏、笔记、测试历史等全部本地数据。</p>
            <p className="card-sub">建议先导出当前档案作为备份。导入后页面会自动刷新。</p>
          </>
        }
        onConfirm={confirmImport}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === 'clear'}
        tone="danger"
        title="清空本地数据"
        confirmLabel="确认清空"
        body={
          <>
            <p>将删除本浏览器 localStorage 中的个人资料、学习进度、收藏、笔记、测试历史、实验室成绩与计时；不会删除 IndexedDB 中的导入论文。</p>
            <p className="card-sub">此操作不可撤销。如需保留，请先取消并导出档案。</p>
          </>
        }
        onConfirm={confirmClear}
        onCancel={() => setModal(null)}
      />
    </div>
  )
}