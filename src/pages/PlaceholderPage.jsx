import Icon from '../components/ui/Icon.jsx'
import { ROUTES, navigate } from '../hooks/useHashRoute.js'
import { modulePlans } from '../data/seed.js'

/* 尚未开发模块的如实占位页：明确说明状态与规划，不提供假功能 */
export default function PlaceholderPage({ route }) {
  const meta = ROUTES.find((r) => r.path === route)
  const info = modulePlans[route]

  return (
    <div className="page placeholder-page">
      <div className="card placeholder-card">
        <div className="placeholder-icon">
          <Icon name={meta?.icon ?? 'spark'} size={34} />
        </div>
        <span className="badge badge-amber" style={{ marginBottom: 'var(--sp-3)' }}>
          模块开发中 · 尚未上线
        </span>
        <h1 className="placeholder-title">
          {meta?.label} <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 14 }}>{meta?.en}</span>
        </h1>
        <p className="placeholder-desc">{info?.desc}</p>
        <ul className="placeholder-plan">
          {info?.plan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {route === 'paper-import' && (
          <button className="btn btn-primary" onClick={() => navigate('ai-guide')}>返回 AI 论文拆解指南</button>
        )}
        <button className="btn btn-ghost" onClick={() => navigate('dashboard')}>
          返回学习仪表盘
        </button>
      </div>
    </div>
  )
}