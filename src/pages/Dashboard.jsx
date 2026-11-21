import { useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import ProgressRing from '../components/ui/ProgressRing.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { loadState, saveState } from '../lib/storage.js'
import {
  useLearning,
  papers,
  nodes,
  getNode,
  getUnderstood,
  getMasteredIds,
  getLabResults,
  getQuizSessions,
  getFavorites,
  toggleFavorite,
  paperProgressPct,
  overallProgressPct,
  completedPaperCount,
  domainCoverage,
  domainColors,
  setLastPaper,
} from '../lib/learningStore.js'
import { formatTs } from '../lib/format.js'
import {
  weeklyGoalMinutes,
  onboardingSteps,
} from '../data/seed.js'
import { L } from '../lib/lorawanData.js'
import WeeklyStudyChart from '../components/WeeklyStudyChart.jsx'
import { buildWeekStats, formatDuration } from '../engines/studyTimeEngine.js'
import { getEffectiveSessions } from '../lib/learningStore.js'
import { useUserProfile } from '../lib/userProfileStore.js'

const labData = L.lab
const paperColor = 'linear-gradient(135deg, #2E6BFF, #22D3EE)'

const stageNames = ['研究背景', '研究问题', '技术方法', '实验设计', '研究结论']

export default function Dashboard({ onEditProfile }) {
  const learning = useLearning()
  const { profile } = useUserProfile()
  const [checked, setChecked] = useState(() => loadState('onboarding', {}))

  const toggleStep = (id) => {
    const next = { ...checked, [id]: !checked[id] }
    setChecked(next)
    saveState('onboarding', next)
  }

  const openPaper = (id) => {
    setLastPaper(id)
    navigate('reader', { paperId: id })
  }

  const masteredIds = getMasteredIds(learning)
  const masteredNodes = masteredIds.map(getNode).filter(Boolean)
  const domains = domainCoverage(learning)
  const overall = overallProgressPct(learning)
  const donePapers = completedPaperCount(learning)
  const doneSections = papers.reduce((s, p) => s + getUnderstood(learning, p.id).length, 0)
  const labResults = getLabResults(learning)
  const labDone = Object.keys(labResults).length
  const labBestAvg = labDone ? Math.round(Object.values(labResults).reduce((s, r) => s + r.best, 0) / labDone) : 0
  const sessions = getQuizSessions(learning)
  const recentScores = [
    ...[...sessions].reverse().slice(0, 3).map((s) => ({
      key: s.id,
      name: '科研阅读能力测试',
      score: s.score,
      date: formatTs(s.ts),
      tag: '真实',
      real: true,
    })),
  ].slice(0, 4)
  const quizAvg = recentScores.length ? Math.round(recentScores.reduce((s, q) => s + q.score, 0) / recentScores.length) : 0
  const liveEvents = [
    ...[...sessions].reverse().slice(0, 2).map((s) => ({
      text: `完成能力测试，得分 ${s.score}（${s.correctCount}/${s.qids.length}）`,
      time: formatTs(s.ts),
      tone: s.score >= 80 ? 'green' : 'amber',
    })),
    ...Object.entries(labResults).slice(-2).map(([id, r]) => ({
      text: `完成方法练习「${labData.exercises.find((e) => e.id === id)?.title ?? id}」，最佳 ${r.best} 分`,
      time: formatTs(r.lastTs),
      tone: 'green',
    })),
  ]
  const timeline = liveEvents.slice(0, 6)

  const doneCount = onboardingSteps.filter((s) => checked[s.id]).length
  const weekStats = buildWeekStats(getEffectiveSessions(learning), Date.now())
  const weekMinutes = weekStats.totalSeconds / 60
  const goalPct = Math.min(100, Math.round((weekMinutes / weeklyGoalMinutes) * 100))

  return (
    <div className="page">
      {/* 欢迎区域 + 总进度环 */}
      <section className="dash-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <Icon name="spark" size={14} />
            RESEARCH READING PILOT
          </div>
          <h1 className="hero-title">
            {profile ? `${profile.name}，欢迎回来` : '欢迎来到 PaperPilot Studio'}
            <br />
            今天继续拆解你的科研论文
          </h1>
          <p className="hero-desc">
            {profile ? `${profile.major || '专业未填写'} · ${profile.grade || '年级未填写'}` : '个人资料尚未设置'} · 你已理解 {doneSections} 个论文章节，点亮 {masteredIds.length}{' '}
            个知识节点，完成 {donePapers} 篇完整拆解。进度随你的学习实时更新。
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => openPaper(learning.lastPaper)}>
              开始学习
              <Icon name="arrowRight" size={16} />
            </button>
            <button className="btn hero-btn-secondary" onClick={() => navigate('library')}>
              <Icon name="library" size={16} />
              浏览论文案例库
            </button>
            <button className="btn hero-btn-secondary" onClick={onEditProfile}>
              <Icon name="user" size={16} />
              编辑个人资料
            </button>
          </div>
        </div>
        <div className="hero-ring">
          <ProgressRing pct={overall} />
          <div className="progress-ring-label">
            <div className="pct">{overall}%</div>
            <div className="cap">章节理解总进度</div>
          </div>
        </div>
      </section>

      {/* 学习进度卡片 */}
      <section className="stat-grid">
        <StatCard
          icon="reader"
          tone="blue"
          value={donePapers}
          unit={`/ ${papers.length} 篇`}
          name="完整拆解论文"
          trend={`已理解 ${doneSections} 节`}
        />
        <StatCard
          icon="nodes"
          tone="cyan"
          value={masteredIds.length}
          unit={`/ ${nodes.length} 个`}
          name="已掌握知识点"
          trend="随拆解实时点亮"
        />
        <StatCard
          icon="flask"
          tone="green"
          value={labDone}
          unit="/ 3 实验"
          name="方法练习完成"
          trend={labDone ? `平均最佳 ${labBestAvg} 分` : '三个互动实验待挑战'}
        />
        <StatCard
          icon="quiz"
          tone="amber"
          value={recentScores.length ? quizAvg : '—'}
          unit={recentScores.length ? '分' : ''}
          name="测验平均分"
          trend={`最近 ${recentScores.length} 次`}
        />
      </section>

      <div className="dash-grid">
        {/* 左列 */}
        <div className="dash-col">
          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="book" size={17} /></span>
                最近学习论文
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('library')}>
                全部论文
                <Icon name="arrowRight" size={14} />
              </button>
            </div>
            {papers.map((p) => {
              const pct = paperProgressPct(learning, p.id)
              const done = getUnderstood(learning, p.id)
              const nextSec = p.sections.find((s) => !done.includes(s.id))
              return (
                <article className="paper-row" key={p.id}>
                  <div className="paper-thumb" style={{ background: paperColor }}>
                    {p.field.slice(0, 2)}
                  </div>
                  <div className="paper-info">
                    <h3 className="paper-title">{p.title}</h3>
                    <div className="paper-meta">
                      <span className="badge badge-navy">{p.field}</span>
                      <span className={`badge ${p.difficulty === '入门' ? 'badge-green' : 'badge-amber'}`}>
                        {p.difficulty}
                      </span>
                      <span className={`badge ${p.demo ? 'badge-amber' : 'badge-blue'}`}>{p.demo ? '虚构教学演示 · 未发表' : `开放获取 · ${p.year}`}</span>
                      {pct === 100 && <span className="badge badge-green">已完成</span>}
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="progress-caption">
                      {pct === 100
                        ? `${p.sections.length} 个章节全部理解`
                        : `下一步：${nextSec?.title ?? ''} · 已理解 ${done.length}/${p.sections.length} 节`}
                    </div>
                  </div>
                  <button
                    className={`fav-btn icon-only${getFavorites(learning).includes(p.id) ? ' on' : ''}`}
                    onClick={() => toggleFavorite(p.id)}
                    aria-pressed={getFavorites(learning).includes(p.id)}
                    title={getFavorites(learning).includes(p.id) ? '取消收藏' : '收藏本篇'}
                  >
                    <Icon name="star" size={15} />
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => openPaper(p.id)}>
                    {pct === 0 ? '开始' : pct === 100 ? '回顾' : '继续'}
                  </button>
                </article>
              )
            })}
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="clock" size={17} /></span>
                本周学习时长
              </h2>
              <span className="badge badge-cyan">真实记录统计</span>
            </div>
            <div className="week-summary">
              <span className="week-total">{formatDuration(weekStats.totalSeconds)}</span>
              <span className="card-sub">本周学习 {weekStats.studyDays} 天 · 预设目标 {weeklyGoalMinutes} 分钟</span>
            </div>
            <div className="progress-track" style={{ marginBottom: 'var(--sp-3)' }}>
              <div className="progress-fill" style={{ width: `${goalPct}%` }} />
            </div>
            <p className="progress-caption" style={{ marginBottom: 'var(--sp-3)' }}>
              周目标完成 {goalPct}%
              {weekStats.lastWeekTotalSeconds === null
                ? ' · 上周无学习记录，不显示对比'
                : ` · 上周 ${formatDuration(weekStats.lastWeekTotalSeconds)}，${weekStats.totalSeconds === weekStats.lastWeekTotalSeconds ? '与上周相同' : `本周${weekStats.totalSeconds > weekStats.lastWeekTotalSeconds ? '多' : '少'} ${formatDuration(Math.abs(weekStats.totalSeconds - weekStats.lastWeekTotalSeconds))}`}`}
            </p>
            <WeeklyStudyChart days={weekStats.days} />
            <p className="card-sub" style={{ marginTop: 'var(--sp-3)' }}>
              按本地周一至周日统计，每 15 秒保存；后台或连续 5 分钟无操作暂停，同一浏览器仅一个标签计时。
              {!navigator.locks && ' 当前环境不支持跨标签计时锁，计时已暂停；请使用支持 Web Locks 的浏览器并通过 localhost 或 HTTPS 访问。'}
            </p>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="map" size={17} /></span>
                知识领域覆盖
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('map')}>
                打开知识地图
                <Icon name="arrowRight" size={14} />
              </button>
            </div>
            {domains.map((d) => (
              <div className="domain-row" key={d.name}>
                <div className="domain-head">
                  <span className="domain-name">
                    <span className="domain-dot" style={{ background: d.color }} />
                    {d.name}
                    <span className="card-sub">{d.got}/{d.total} 节点</span>
                  </span>
                  <span className="domain-pct">{d.pct}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${d.pct}%`, background: d.color }}
                  />
                </div>
              </div>
            ))}
          </section>
        </div>

        {/* 右列 */}
        <div className="dash-col">
          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="nodes" size={17} /></span>
                已掌握知识点
              </h2>
              <span className="badge badge-cyan">{masteredNodes.length} 个</span>
            </div>
            {masteredNodes.length === 0 ? (
              <p className="card-sub">
                还没有点亮的知识点。进入论文拆解，点击「标记已理解」即可挂载对应知识节点。
              </p>
            ) : (
              <div className="mastered-chips">
                {masteredNodes.map((n) => (
                  <span className="mastered-chip" key={n.id} title={`${n.en} · ${n.domain}`}>
                    <span
                      className="domain-dot"
                      style={{ background: domainColors[n.domain] }}
                    />
                    {n.name}
                  </span>
                ))}
              </div>
            )}
            <p className="card-sub" style={{ marginTop: 'var(--sp-3)' }}>
              在论文阅读页标记章节「已理解」后，对应知识点会实时出现在这里。
            </p>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="quiz" size={17} /></span>
                最近测试成绩
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('quiz')}>
                去测验
                <Icon name="arrowRight" size={14} />
              </button>
            </div>
            {recentScores.length === 0 && <p className="card-sub">暂无真实测试成绩，完成一次能力测试后显示。</p>}
            {recentScores.map((q) => (
              <div className="quiz-row" key={q.key}>
                <div className="quiz-head">
                  <span className="quiz-name">
                    <span className={`badge ${q.real ? 'badge-green' : 'badge-blue'}`}>{q.tag}</span>
                    {q.name}
                  </span>
                  <span className={`quiz-score ${q.score >= 80 ? 'good' : q.score >= 60 ? 'mid' : 'bad'}`}>
                    {q.score}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${q.score}%`,
                      background:
                        q.score >= 80
                          ? 'linear-gradient(90deg,#16A34A,#4ADE80)'
                          : 'linear-gradient(90deg,#F59E0B,#FCD34D)',
                    }}
                  />
                </div>
                <div className="progress-caption">{q.date}</div>
              </div>
            ))}
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="check" size={17} /></span>
                新手入门清单
              </h2>
              <span className="badge badge-blue">
                {doneCount}/{onboardingSteps.length}
              </span>
            </div>
            {onboardingSteps.map((s) => (
              <button
                key={s.id}
                className={`checklist-item${checked[s.id] ? ' done' : ''}`}
                onClick={() => toggleStep(s.id)}
                aria-pressed={!!checked[s.id]}
              >
                <span className="check-box">
                  <Icon name="check" size={13} strokeWidth={3} />
                </span>
                <span className="check-text">
                  <span className="check-title">{s.title}</span>
                  <br />
                  <span className="check-desc">{s.desc}</span>
                </span>
              </button>
            ))}
            <p className="card-sub" style={{ marginTop: 'var(--sp-2)' }}>
              点击可勾选，进度自动保存在本地浏览器。
            </p>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="trendUp" size={17} /></span>
                最近学习动态
              </h2>
            </div>
            {timeline.length === 0 && <p className="card-sub">暂无测试或方法练习记录。</p>}
            <div className="timeline">
              {timeline.map((a, i) => (
                <div className={`timeline-item ${a.tone}`} key={i}>
                  <div className="timeline-text">{a.text}</div>
                  <div className="timeline-time">{a.time}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">
                <span className="title-icon"><Icon name="quiz" size={17} /></span>
                今日推荐训练
              </h2>
            </div>
            <p className="card-sub" style={{ marginBottom: 'var(--sp-3)' }}>
              可以先做方法练习，再进行小测；薄弱分析将根据真实答题记录生成。
            </p>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('lab')}>
                <Icon name="flask" size={15} />
                去做方法练习
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('quiz')}>
                <Icon name="quiz" size={15} />
                开始能力小测
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, tone, value, unit, name, trend }) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon name={icon} size={22} />
      </div>
      <div>
        <div className="stat-value">
          {value} <small>{unit}</small>
        </div>
        <div className="stat-name">{name}</div>
        <div className="stat-trend">{trend}</div>
      </div>
    </div>
  )
}