import Icon from '../ui/Icon.jsx'
import { ROUTES, navigate } from '../../hooks/useHashRoute.js'
import { papers } from '../../lib/learningStore.js'
import { usePaperRepository } from '../../lib/paperRepository.js'

export default function Sidebar({ route, collapsed, mobileOpen, onCollapse, onCloseMobile }) {
  const { records } = usePaperRepository()
  const go = (path) => {
    navigate(path)
    onCloseMobile()
  }

  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="关闭导航菜单"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
      >
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Icon name="plane" size={22} strokeWidth={1.7} />
          </div>
          <div className="brand-text">
            <div className="brand-name">PaperPilot</div>
            <div className="brand-sub">STUDIO · 论文领航</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <div className="nav-section-title">学习中心</div>
          {ROUTES.slice(0, 4).map((r) => (
            <NavButton key={r.path} r={r} paperCount={papers.length + records.length} active={route === r.path} onClick={() => go(r.path)} />
          ))}
          <div className="nav-section-title">训练与评估</div>
          {ROUTES.slice(4, 7).map((r) => (
            <NavButton key={r.path} r={r} active={route === r.path} onClick={() => go(r.path)} />
          ))}
          <div className="nav-section-title">论文工具</div>
          {ROUTES.slice(7).filter((r) => !r.hidden).map((r) => (
            <NavButton key={r.path} r={r} active={route === r.path} onClick={() => go(r.path)} />
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-foot-card">
            <strong>纯本地运行</strong>
            所有学习数据保存在你的浏览器中，不上传任何服务器。
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={onCollapse}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <span className="chev">
              <Icon name="chevronsLeft" size={16} />
            </span>
            {!collapsed && <span>收起导航</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

function NavButton({ r, active, onClick, paperCount }) {
  return (
    <button
      className={`nav-item${active ? ' active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={r.label}
    >
      <span className="nav-icon">
        <Icon name={r.icon} size={19} />
      </span>
      <span className="nav-label">{r.label}</span>
      {r.path === 'library' && <span className="nav-badge">{paperCount} 篇</span>}
    </button>
  )
}