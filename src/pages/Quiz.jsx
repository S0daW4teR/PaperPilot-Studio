import { useMemo, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import TagChips from '../components/ui/TagChips.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { formatTs } from '../lib/format.js'
import {
  useLearning,
  getQuizSessions,
  addQuizSession,
  papers,
  nodes,
  getMasteredIds,
  setLastPaper,
  setLastSection,
} from '../lib/learningStore.js'
import {
  drawQuestions,
  gradeSession,
  analyzeWeakness,
  reviewSuggestions,
  getQuestion,
  optionsOf,
} from '../engines/quizEngine.js'
import { L } from '../lib/lorawanData.js'

const quizBank = L.quizBank
const graph = L.graph

const scoreTone = (s) => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'bad')

export default function Quiz() {
  const learning = useLearning()
  const sessions = getQuizSessions(learning)
  const [view, setView] = useState('home')
  const [run, setRun] = useState(null)
  const [review, setReview] = useState(null)

  const weakness = useMemo(() => analyzeWeakness(quizBank, sessions, { nodes }), [sessions])
  const suggestions = useMemo(
    () => reviewSuggestions(quizBank, sessions, { papers, graph, nodes }),
    [sessions],
  )

  const start = () => {
    const seed = Date.now() % 1000000
    const qids = drawQuestions(quizBank, seed)
    setRun({ seed, qids, picks: Array(qids.length).fill(null), idx: 0, grade: null })
    setView('run')
  }

  const pick = (i) => {
    setRun((r) => {
      if (r.picks[r.idx] !== null) return r
      const picks = [...r.picks]
      picks[r.idx] = i
      return { ...r, picks }
    })
  }

  const next = () => {
    if (run.idx < run.qids.length - 1) {
      setRun((r) => ({ ...r, idx: r.idx + 1 }))
      return
    }
    const grade = gradeSession(quizBank, run.qids, run.picks)
    addQuizSession({
      id: `s${Date.now()}`,
      ts: Date.now(),
      seed: run.seed,
      qids: run.qids,
      picks: run.picks,
      score: grade.score,
      correctCount: grade.correctCount,
    })
    setRun((r) => ({ ...r, grade }))
    setView('result')
  }

  const openReview = (s) => {
    setReview(s)
    setView('review')
  }

  const goAction = (action) => {
    if (!action) return
    if (action.type === 'map') {
      navigate('map')
      return
    }
    setLastPaper(action.paperId)
    setLastSection(action.sectionId)
    navigate('reader')
  }

  return (
    <div className="page quiz-page">
      <section className="card card-pad lab-head">
        <div className="lab-head-copy">
          <div className="hero-eyebrow">
            <Icon name="quiz" size={14} />
            READING QUIZ · 科研阅读能力测试
          </div>
          <h1 className="map-title">能力测试</h1>
          <p className="card-sub map-desc">
            每次从本地 {quizBank.questions.length} 道预置题中抽取 5 道（3 选择 + 2 判断），自动评分并逐题解析。
            薄弱知识点与复习建议只由你的真实答题记录计算（规则 Q1–Q4）。
          </p>
        </div>
        <div className="map-head-stats">
          <div className="map-stat">
            <span className="map-stat-value">{sessions.length}<small>次</small></span>
            <span className="card-sub">累计测试</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">
              {sessions.length ? Math.round(sessions.reduce((s, x) => s + x.score, 0) / sessions.length) : 0}
              <small>分</small>
            </span>
            <span className="card-sub">平均得分</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{weakness.weak.length}<small>个</small></span>
            <span className="card-sub">薄弱标签</span>
          </div>
        </div>
      </section>

      {view === 'home' && (
        <QuizHome
          sessions={sessions}
          weakness={weakness}
          suggestions={suggestions}
          onStart={start}
          onReview={openReview}
          onAction={goAction}
        />
      )}

      {view === 'run' && run && <QuizRun run={run} onPick={pick} onNext={next} />}

      {(view === 'result' || view === 'review') && (
        <QuizResult
          grade={view === 'result' ? run.grade : gradeSession(quizBank, review.qids, review.picks)}
          session={view === 'result' ? run : review}
          weakness={weakness}
          suggestions={suggestions}
          onRestart={start}
          onHome={() => setView('home')}
          onAction={goAction}
          isReview={view === 'review'}
        />
      )}

      <p className="rule-foot">{quizBank.ruleText}</p>
    </div>
  )
}

function QuizHome({ sessions, weakness, suggestions, onStart, onReview, onAction }) {
  return (
    <div className="quiz-home-grid">
      <section className="card card-pad quiz-start-card">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="target" size={17} /></span>
            开始一组测试
          </h2>
          <span className="badge badge-cyan">5 题 · 约 3 分钟</span>
        </div>
        <ul className="tip-list quiz-rules">
          <li>选择题 3 道 + 判断题 2 道，种子随机不重复抽取</li>
          <li>每题 20 分，提交后立即显示正确答案与解析</li>
          <li>答错标签累计 ≥ 2 次判为薄弱，并生成可跳转的复习建议</li>
          <li>全部记录保存在本地浏览器，可随时回顾历史试卷</li>
        </ul>
        <button className="btn btn-primary quiz-start-btn" onClick={onStart}>
          <Icon name="quiz" size={16} />
          抽取 5 道题开始
        </button>
      </section>

      <section className="card card-pad">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="trendUp" size={17} /></span>
            薄弱知识点分析
          </h2>
          <span className="badge badge-blue">规则 Q3</span>
        </div>
        {weakness.weak.length === 0 && weakness.watch.length === 0 ? (
          <p className="card-sub">
            还没有答题记录。完成第一组测试后，这里会按真实错题统计薄弱与关注标签。
          </p>
        ) : (
          <>
            <div className="detail-label">薄弱（累计答错 ≥ 2）</div>
            {weakness.weak.length === 0 ? (
              <p className="card-sub">暂无薄弱标签，保持。</p>
            ) : (
              <div className="weak-chips">
                {weakness.weak.map((w) => (
                  <span className={`weak-chip${w.kind === 'skill' ? ' skill' : ''}`} key={w.tag}>
                    {w.name}
                    <small>错 {w.wrong}/{w.total}</small>
                  </span>
                ))}
              </div>
            )}
            <div className="detail-label" style={{ marginTop: 'var(--sp-3)' }}>关注（答错 1 次）</div>
            {weakness.watch.length === 0 ? (
              <p className="card-sub">暂无关注标签。</p>
            ) : (
              <div className="weak-chips">
                {weakness.watch.map((w) => (
                  <span className="weak-chip watch" key={w.tag}>
                    {w.name}
                    <small>错 {w.wrong}/{w.total}</small>
                  </span>
                ))}
              </div>
            )}
            <div className="detail-label" style={{ marginTop: 'var(--sp-3)' }}>标签答题明细</div>
            <div className="weak-detail">
              {Object.entries(weakness.stats)
                .sort((a, b) => b[1].wrong - a[1].wrong)
                .map(([tag, v]) => {
                  const skill = quizBank.skills.find((s) => s.id === tag)
                  const node = nodes.find((n) => n.id === tag)
                  const acc = Math.round((100 * (v.total - v.wrong)) / v.total)
                  return (
                    <div className="weak-detail-row" key={tag}>
                      <span className="weak-detail-name">{skill?.name ?? node?.name ?? tag}</span>
                      <span className="weak-detail-nums">对 {v.total - v.wrong}/{v.total}</span>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${acc}%`,
                            background:
                              acc >= 80
                                ? 'linear-gradient(90deg,#16A34A,#4ADE80)'
                                : acc >= 50
                                  ? 'linear-gradient(90deg,#F59E0B,#FCD34D)'
                                  : 'linear-gradient(90deg,#EF4444,#F87171)',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </section>

      <section className="card card-pad">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="spark" size={17} /></span>
            复习建议
          </h2>
          <span className="badge badge-amber">规则 Q4 · 可追溯</span>
        </div>
        {suggestions.length === 0 ? (
          <p className="card-sub">完成测试后，引擎会按错题为每个薄弱标签链接预置论文章节或知识地图节点。</p>
        ) : (
          <div className="suggestion-list">
            {suggestions.map((s) => (
              <div className="suggestion" key={s.tag}>
                <div className="suggestion-head">
                  <strong>{s.name}</strong>
                  <span className="badge badge-red">错 {s.wrong} 次</span>
                </div>
                <p>{s.text}</p>
                <div className="suggestion-foot">
                  <code className="inline-code">{s.ref}</code>
                  {s.action && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onAction(s.action)}>
                      {s.action.type === 'map' ? '去地图小测' : '去重读章节'}
                      <Icon name="arrowRight" size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad quiz-history-card">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="clock" size={17} /></span>
            历史测试记录
          </h2>
          <span className="badge badge-navy">{sessions.length} 次</span>
        </div>
        {sessions.length === 0 ? (
          <p className="card-sub">暂无记录。每次完成测试都会在这里留下可回顾的试卷。</p>
        ) : (
          <div className="quiz-history">
            {[...sessions].reverse().map((s) => (
              <div className="quiz-history-row" key={s.id}>
                <span className={`quiz-score ${scoreTone(s.score)}`}>{s.score}</span>
                <span className="quiz-history-copy">
                  <strong>答对 {s.correctCount}/{s.qids.length}</strong>
                  <small>{formatTs(s.ts)} · seed {s.seed}</small>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => onReview(s)}>
                  回顾试卷
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function QuizRun({ run, onPick, onNext }) {
  const q = getQuestion(quizBank, run.qids[run.idx])
  const options = optionsOf(q)
  const picked = run.picks[run.idx]
  const correct = picked !== null && picked === q.answer

  return (
    <section className="card card-pad quiz-run-card">
      <div className="card-head">
        <h2 className="card-title">
          <span className="title-icon"><Icon name="quiz" size={17} /></span>
          第 {run.idx + 1} 题 / 共 {run.qids.length} 题
        </h2>
        <span className={`badge ${q.type === 'judge' ? 'badge-amber' : 'badge-blue'}`}>
          {q.type === 'judge' ? '判断题' : '选择题'}
        </span>
      </div>
      <div className="quiz-dots">
        {run.qids.map((id, i) => (
          <span
            key={id}
            className={`quiz-dot${i === run.idx ? ' cur' : ''}${run.picks[i] !== null ? (run.picks[i] === getQuestion(quizBank, id).answer ? ' good' : ' bad') : ''}`}
          />
        ))}
      </div>
      <p className="quiz-prompt quiz-run-prompt">{q.prompt}</p>
      <div className={`quiz-options${q.type === 'judge' ? ' judge' : ''}`}>
        {options.map((opt, i) => {
          let cls = ''
          if (picked !== null) {
            if (i === q.answer) cls = 'right'
            else if (i === picked) cls = 'wrong'
            else cls = 'dim'
          }
          return (
            <button key={i} className={`quiz-option ${cls}`} disabled={picked !== null} onClick={() => onPick(i)}>
              <span className="opt-key">{q.type === 'judge' ? (i === 0 ? '✓' : '✗') : String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className={`quiz-feedback ${correct ? 'good' : 'bad'}`}>
          <div className="quiz-feedback-head">
            <Icon name={correct ? 'check' : 'spark'} size={14} strokeWidth={2.6} />
            {correct ? '回答正确 · +20 分' : `回答错误 · 正确答案：${options[q.answer]}`}
          </div>
          <p>{q.explain}</p>
          <TagChips tags={q.tags} />
          <button className="btn btn-primary btn-sm" onClick={onNext}>
            {run.idx < run.qids.length - 1 ? '下一题' : '交卷并查看分析'}
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      )}
    </section>
  )
}

function QuizResult({ grade, session, weakness, suggestions, onRestart, onHome, onAction, isReview }) {
  const litIds = getMasteredIds(useLearning())
  const sessionWrongTags = useMemo(() => {
    const m = {}
    grade.items.forEach((it) => {
      if (!it.correct) it.tags.forEach((t) => { m[t] = (m[t] ?? 0) + 1 })
    })
    return Object.entries(m).map(([tag, n]) => ({ tag, n }))
  }, [grade])

  return (
    <div className="quiz-result">
      <section className="card card-pad quiz-score-card">
        <div className={`lab-score ${scoreTone(grade.score)}`}>
          <span className="lab-score-value">{grade.score}</span>
          <span className="lab-score-cap">
            答对 {grade.correctCount}/{grade.total} · 规则 Q2{isReview ? ` · 回顾 ${formatTs(session.ts)}` : ''}
          </span>
        </div>
        <div className="quiz-score-copy">
          <h2 className="card-title">
            {grade.score >= 80 ? '阅读能力扎实，保持节奏' : grade.score >= 60 ? '基本掌握，错题值得复盘' : '先复盘错题，再重读对应章节'}
          </h2>
          <p className="card-sub">
            {sessionWrongTags.length === 0
              ? '本组全部答对，没有新增错题标签。'
              : `本组错题涉及 ${sessionWrongTags.length} 个标签，已计入累计薄弱统计（规则 Q3）。`}
          </p>
          {sessionWrongTags.length > 0 && (
            <div className="weak-chips">
              {sessionWrongTags.map((w) => {
                const skill = quizBank.skills.find((s) => s.id === w.tag)
                const node = nodes.find((n) => n.id === w.tag)
                return (
                  <span className={`weak-chip${skill ? ' skill' : ''}`} key={w.tag}>
                    {skill?.name ?? node?.name ?? w.tag}
                    <small>本组错 {w.n}</small>
                  </span>
                )
              })}
            </div>
          )}
        </div>
        <div className="quiz-score-actions">
          <button className="btn btn-primary" onClick={onRestart}>
            <Icon name="refresh" size={15} />
            再测一组
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            返回概览
          </button>
        </div>
      </section>

      <section className="card card-pad">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="book" size={17} /></span>
            逐题回顾
          </h2>
          <span className="badge badge-blue">正确答案 + 错因解析</span>
        </div>
        <div className="review-list">
          {grade.items.map((it, i) => (
            <div className={`review-item${it.correct ? ' right' : ' wrong'}`} key={it.id}>
              <div className="review-head">
                <span className="order-idx">{i + 1}</span>
                <span className={`badge ${it.type === 'judge' ? 'badge-amber' : 'badge-blue'}`}>
                  {it.type === 'judge' ? '判断' : '选择'}
                </span>
                <span className={`review-verdict ${it.correct ? 'good' : 'bad'}`}>
                  <Icon name={it.correct ? 'check' : 'spark'} size={13} strokeWidth={2.6} />
                  {it.correct ? '答对' : '答错'}
                </span>
              </div>
              <p className="quiz-prompt">{it.prompt}</p>
              <div className={`quiz-options${it.type === 'judge' ? ' judge' : ''}`}>
                {it.options.map((opt, oi) => {
                  let cls = 'dim'
                  if (oi === it.answer) cls = 'right'
                  else if (oi === it.picked) cls = 'wrong'
                  return (
                    <span key={oi} className={`quiz-option static ${cls}`}>
                      <span className="opt-key">
                        {it.type === 'judge' ? (oi === 0 ? '✓' : '✗') : String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                      {oi === it.picked && <em className="opt-mine">你的选择</em>}
                      {oi === it.answer && <em className="opt-answer">正确答案</em>}
                    </span>
                  )
                })}
              </div>
              <div className={`review-explain${it.correct ? '' : ' bad'}`}>
                <strong>{it.correct ? '解析' : '错因解析'}</strong>
                <p>{it.explain}</p>
              </div>
              <div className="review-foot">
                <TagChips tags={it.tags} litIds={litIds} />
                {it.paper && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onAction({ type: 'reader', paperId: it.paper.paperId, sectionId: it.paper.sectionId })}
                  >
                    读关联章节
                    <Icon name="arrowRight" size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="card-head">
          <h2 className="card-title">
            <span className="title-icon"><Icon name="spark" size={17} /></span>
            累计薄弱与复习建议
          </h2>
          <span className="badge badge-amber">规则 Q3 / Q4</span>
        </div>
        {weakness.weak.length === 0 && weakness.watch.length === 0 ? (
          <p className="card-sub">累计记录中暂无薄弱或关注标签。</p>
        ) : (
          <div className="weak-chips">
            {[...weakness.weak, ...weakness.watch].map((w) => (
              <span className={`weak-chip${w.wrong >= 2 ? '' : ' watch'}${w.kind === 'skill' ? ' skill' : ''}`} key={w.tag}>
                {w.name}
                <small>错 {w.wrong}/{w.total}</small>
              </span>
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="suggestion-list" style={{ marginTop: 'var(--sp-4)' }}>
            {suggestions.map((s) => (
              <div className="suggestion" key={s.tag}>
                <div className="suggestion-head">
                  <strong>{s.name}</strong>
                  <span className="badge badge-red">错 {s.wrong} 次</span>
                </div>
                <p>{s.text}</p>
                <div className="suggestion-foot">
                  <code className="inline-code">{s.ref}</code>
                  {s.action && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onAction(s.action)}>
                      {s.action.type === 'map' ? '去地图小测' : '去重读章节'}
                      <Icon name="arrowRight" size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}