import { dayKey } from '../engines/studyTimeEngine.js'

export default function WeeklyStudyChart({ days }) {
  const maxSec = Math.max(...days.map((d) => d.seconds), 60)
  const today = dayKey(Date.now())
  const minutes = (seconds) => Number((seconds / 60).toFixed(1))
  return (
    <div className="week-chart" role="img" aria-label={`本周学习分钟数：${days.map((d) => `${d.label} ${minutes(d.seconds)} 分钟`).join('，')}`}>
      <div className="week-axis" aria-hidden="true"><span>分钟</span><span>{minutes(maxSec)}</span><span>0</span></div>
      {days.map((d) => (
        <div className="week-bar-wrap" key={d.key} title={`${d.key} ${d.label}：${minutes(d.seconds)} 分钟（${Math.floor(d.seconds)} 秒）`}>
          <span className="week-bar-value">{minutes(d.seconds)}′</span>
          <div className="week-bar-track">
            <div
              className={`week-bar${d.key === today ? ' today' : ''}`}
              style={{ height: `${(d.seconds / maxSec) * 100}%` }}
            />
          </div>
          <span className={`week-bar-day${d.key === today ? ' today' : ''}`}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}
