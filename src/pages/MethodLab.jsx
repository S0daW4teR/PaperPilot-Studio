import { useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import TagChips from '../components/ui/TagChips.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { useLearning, getLabResults, saveLabResult, getMasteredIds } from '../lib/learningStore.js'
import { checkOrder, checkMatch, checkDesign, shuffled } from '../engines/labEngine.js'
import { L } from '../lib/lorawanData.js'

const labData = L.lab

const exercises = labData.exercises

const scoreTone = (s) => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'bad')

export default function MethodLab() {
  const learning = useLearning()
  const results = getLabResults(learning)
  const [activeId, setActiveId] = useState(exercises[0].id)
  const active = exercises.find((e) => e.id === activeId)
  const done = exercises.filter((e) => results[e.id])
  const bestAvg = done.length ? Math.round(done.reduce((s, e) => s + results[e.id].best, 0) / done.length) : 0

  return (
    <div className="page lab-page">
      <section className="card card-pad lab-head">
        <div className="lab-head-copy">
          <div className="hero-eyebrow">
            <Icon name="flask" size={14} />
            METHOD LAB · 科研方法互动练习
          </div>
          <h1 className="map-title">方法实验室</h1>
          <p className="card-sub map-desc">
            三个基于 LoRaWAN 综述论文的互动实验：匹配系统组成部分与作用、恢复文献综述流程顺序、判断实验设计是否充分。
            判分与解释全部来自预置规则（L1–L3）与 methodLab.json，成绩实时保存。
          </p>
        </div>
        <div className="map-head-stats">
          <div className="map-stat">
            <span className="map-stat-value">{done.length}<small>/{exercises.length}</small></span>
            <span className="card-sub">已完成实验</span>
          </div>
          <div className="map-stat">
            <span className="map-stat-value">{bestAvg}<small>分</small></span>
            <span className="card-sub">平均最佳成绩</span>
          </div>
        </div>
      </section>

      <div className="lab-tabs" role="tablist" aria-label="选择实验">
        {exercises.map((e, i) => {
          const r = results[e.id]
          return (
            <button
              key={e.id}
              role="tab"
              aria-selected={e.id === activeId}
              className={`lab-tab${e.id === activeId ? ' active' : ''}`}
              onClick={() => setActiveId(e.id)}
            >
              <span className="lab-tab-idx">{i + 1}</span>
              <span className="lab-tab-icon"><Icon name={e.icon} size={18} /></span>
              <span className="lab-tab-copy">
                <strong>{e.title}</strong>
                <small>{e.brief}</small>
              </span>
              {r ? (
                <span className={`badge lab-tab-badge ${scoreTone(r.best) === 'good' ? 'badge-green' : scoreTone(r.best) === 'mid' ? 'badge-amber' : 'badge-red'}`}>
                  最佳 {r.best}
                </span>
              ) : (
                <span className="badge badge-navy lab-tab-badge">未开始</span>
              )}
            </button>
          )
        })}
      </div>

      {active.kind === 'order' && <OrderExercise key={active.id} ex={active} record={results[active.id]} />}
      {active.kind === 'match' && <MatchExercise key={active.id} ex={active} />}
      {active.kind === 'design' && <DesignExercise key={active.id} ex={active} />}

      <p className="rule-foot">{labData.ruleText}</p>
    </div>
  )
}

function ExerciseShell({ ex, result, onSubmit, onRetry, submitDisabled, children }) {
  return (
    <section className="card card-pad lab-ex">
      <div className="card-head">
        <h2 className="card-title">
          <span className="title-icon"><Icon name={ex.icon} size={17} /></span>
          {ex.title}
        </h2>
        <span className="badge badge-blue">规则 {ex.kind === 'order' ? 'L1' : ex.kind === 'match' ? 'L2' : 'L3'}</span>
      </div>
      <p className="lab-prompt">{ex.prompt}</p>
      <p className="lab-hint">
        <Icon name="spark" size={13} />
        {ex.hint}
      </p>
      {children}
      <div className="lab-actions">
        {!result ? (
          <button className="btn btn-primary" onClick={onSubmit} disabled={submitDisabled}>
            <Icon name="check" size={15} />
            提交答案
          </button>
        ) : (
          <>
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size={15} />
              再练一次
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('map')}>
              <Icon name="map" size={15} />
              去知识地图验证
            </button>
          </>
        )}
        {submitDisabled && !result && <span className="card-sub">完成所有选择后即可提交</span>}
      </div>
      {result && <LabResult ex={ex} result={result} />}
    </section>
  )
}

function LabResult({ ex, result }) {
  const litIds = getMasteredIds(useLearning())
  return (
    <div className="lab-result">
      <div className={`lab-score ${scoreTone(result.score)}`}>
        <span className="lab-score-value">{result.score}</span>
        <span className="lab-score-cap">
          答对 {result.correctCount}/{result.total} · 规则 {result.ruleId}
        </span>
      </div>
      <ol className="lab-items">
        {ex.explainShared && <p className="lab-shared-explain">{ex.explainShared}</p>}
        {result.items.map((it, i) => (
          <li className={`lab-item${it.correct ? ' right' : ' wrong'}`} key={it.id}>
            <div className="lab-item-head">
              <span className="lab-item-mark">
                <Icon name={it.correct ? 'check' : 'spark'} size={13} strokeWidth={2.6} />
              </span>
              <span className="lab-item-title">
                {ex.kind === 'order' && <em className="lab-pos">正确位置 {it.expectedIndex + 1} · 你的位置 {it.actualIndex + 1}</em>}
                {ex.kind === 'match' && !it.correct && (
                  <em className="lab-pos">你选 {it.pickedName ?? '未作答'} · 应为 {it.answerName}</em>
                )}
                {ex.kind === 'design' && !it.correct && (
                  <em className="lab-pos">你选 {String.fromCharCode(65 + it.picked)} · 应为 {String.fromCharCode(65 + it.answer)}</em>
                )}
                {it.text ?? it.prompt}
              </span>
            </div>
            {!ex.explainShared && <p className="lab-item-explain">{it.explain}</p>}
            <TagChips tags={it.tags} litIds={litIds} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function OrderExercise({ ex, record }) {
  const ids = ex.steps.map((s) => s.id)
  const [seed, setSeed] = useState((record?.attempts ?? 0) + 1)
  const [order, setOrder] = useState(() => shuffled(ids, seed))
  const [result, setResult] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)

  const move = (from, to) => {
    if (to < 0 || to >= order.length) return
    setOrder((o) => {
      const a = [...o]
      const [x] = a.splice(from, 1)
      a.splice(to, 0, x)
      return a
    })
  }

  const submit = () => {
    const r = checkOrder(ex, order)
    setResult(r)
    saveLabResult(ex.id, { score: r.score, ts: Date.now() })
  }

  const retry = () => {
    const s = seed + 1
    setSeed(s)
    setOrder(shuffled(ids, s))
    setResult(null)
  }

  return (
    <ExerciseShell ex={ex} result={result} onSubmit={submit} onRetry={retry}>
      <ol className="order-list">
        {order.map((id, i) => {
          const step = ex.steps.find((s) => s.id === id)
          const mark = result ? result.items.find((it) => it.id === id) : null
          return (
            <li
              key={id}
              className={`order-row${mark ? (mark.correct ? ' right' : ' wrong') : ''}${dragIdx === i ? ' dragging' : ''}`}
              draggable={!result}
              onDragStart={(e) => {
                setDragIdx(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => {
                if (dragIdx !== null && dragIdx !== i) {
                  move(dragIdx, i)
                  setDragIdx(i)
                }
              }}
              onDragEnd={() => setDragIdx(null)}
            >
              <span className="order-grip" title="拖动调整顺序">
                <Icon name="grip" size={15} />
              </span>
              <span className="order-idx">{i + 1}</span>
              <span className="order-text">{step.text}</span>
              {mark && (
                <span className={`order-mark ${mark.correct ? 'good' : 'bad'}`}>
                  <Icon name={mark.correct ? 'check' : 'arrowDown'} size={13} strokeWidth={2.6} />
                </span>
              )}
              <span className="order-ctrl">
                <button aria-label="上移一步" disabled={i === 0 || !!result} onClick={() => move(i, i - 1)}>
                  <Icon name="arrowUp" size={14} />
                </button>
                <button aria-label="下移一步" disabled={i === order.length - 1 || !!result} onClick={() => move(i, i + 1)}>
                  <Icon name="arrowDown" size={14} />
                </button>
              </span>
            </li>
          )
        })}
      </ol>
    </ExerciseShell>
  )
}

function MatchExercise({ ex }) {
  const [picks, setPicks] = useState({})
  const [result, setResult] = useState(null)

  const submit = () => {
    const r = checkMatch(ex, picks)
    setResult(r)
    saveLabResult(ex.id, { score: r.score, ts: Date.now() })
  }

  const retry = () => {
    setPicks({})
    setResult(null)
  }

  const complete = ex.needs.every((n) => picks[n.id])

  return (
    <ExerciseShell ex={ex} result={result} onSubmit={submit} onRetry={retry} submitDisabled={!complete}>
      <div className="tech-pool">
        <span className="detail-label">候选技术池</span>
        <div className="tech-pool-chips">
          {ex.techs.map((t) => (
            <span className="tech-spec" key={t.id} title={t.spec || t.name}>
              <strong>{t.name}</strong>
              {t.spec && <small>{t.spec}</small>}
            </span>
          ))}
        </div>
      </div>
      <div className="match-list">
        {ex.needs.map((n, i) => {
          const mark = result ? result.items.find((it) => it.id === n.id) : null
          return (
            <div className={`match-need${mark ? (mark.correct ? ' right' : ' wrong') : ''}`} key={n.id}>
              <div className="match-need-head">
                <span className="order-idx">{i + 1}</span>
                <p>{n.text}</p>
                {mark && (
                  <span className={`order-mark ${mark.correct ? 'good' : 'bad'}`}>
                    <Icon name={mark.correct ? 'check' : 'spark'} size={13} strokeWidth={2.6} />
                  </span>
                )}
              </div>
              <div className="match-chips">
                {ex.techs.map((t) => (
                  <button
                    key={t.id}
                    className={`tech-chip${picks[n.id] === t.id ? ' sel' : ''}${mark && t.id === n.answer ? ' answer' : ''}${mark && picks[n.id] === t.id && !mark.correct ? ' miss' : ''}`}
                    disabled={!!result}
                    onClick={() => setPicks((p) => ({ ...p, [n.id]: t.id }))}
                    title={t.spec}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </ExerciseShell>
  )
}

function DesignExercise({ ex }) {
  const [picks, setPicks] = useState(Array(ex.items.length).fill(null))
  const [result, setResult] = useState(null)

  const submit = () => {
    const r = checkDesign(ex, picks)
    setResult(r)
    saveLabResult(ex.id, { score: r.score, ts: Date.now() })
  }

  const retry = () => {
    setPicks(Array(ex.items.length).fill(null))
    setResult(null)
  }

  const complete = picks.every((p) => p !== null)

  return (
    <ExerciseShell ex={ex} result={result} onSubmit={submit} onRetry={retry} submitDisabled={!complete}>
      <div className="design-scenario">
        <span className="detail-label">实验描述 · 教学示例</span>
        <p>{ex.scenario}</p>
      </div>
      <div className="design-list">
        {ex.items.map((it, i) => {
          const mark = result ? result.items[i] : null
          return (
            <div className={`design-item${mark ? (mark.correct ? ' right' : ' wrong') : ''}`} key={it.id}>
              <p className="quiz-prompt">
                <span className="order-idx">{i + 1}</span>
                {it.prompt}
              </p>
              <div className="quiz-options">
                {it.options.map((opt, oi) => {
                  let cls = ''
                  if (result) {
                    if (oi === it.answer) cls = 'right'
                    else if (oi === picks[i]) cls = 'wrong'
                    else cls = 'dim'
                  } else if (picks[i] === oi) cls = 'sel'
                  return (
                    <button
                      key={oi}
                      className={`quiz-option ${cls}`}
                      disabled={!!result}
                      onClick={() => setPicks((p) => p.map((v, vi) => (vi === i ? oi : v)))}
                    >
                      <span className="opt-key">{String.fromCharCode(65 + oi)}</span>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </ExerciseShell>
  )
}