import Icon from '../ui/Icon.jsx'
import { ROUTES } from '../../hooks/useHashRoute.js'
import { weeklyGoalMinutes } from '../../data/seed.js'
import { useUserProfile, profileInitial } from '../../lib/userProfileStore.js'
import { useLearning, getEffectiveSessions } from '../../lib/learningStore.js'
import { buildWeekStats, studyStreak } from '../../engines/studyTimeEngine.js'

export default function Topbar({ route, onOpenMobile, onEditProfile }) {
  const { profile } = useUserProfile()
  const current = ROUTES.find((r) => r.path === route)
  const learning = useLearning()
  const sessions = getEffectiveSessions(learning)
  const week = buildWeekStats(sessions, Date.now())
  const goalPct = Math.min(100, Math.round((week.totalSeconds / 60 / weeklyGoalMinutes) * 100))
  const streak = studyStreak(sessions, Date.now())

  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={onOpenMobile} aria-label="打开导航菜单">
        <Icon name="menu" size={20} />
      </button>

      <div className="breadcrumb">
        <span className="crumb-root">PaperPilot Studio</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{current?.label}</span>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-chip streak" title={`已连续学习 ${streak} 天（按真实学习记录计算）`}>
        <Icon name="flame" size={15} />
        <span className="chip-text">连续学习</span> {streak} 天
      </div>

      <div className="topbar-chip goal" title={`本周真实学习 ${Math.round(week.totalSeconds / 60)} 分钟 / 目标 ${weeklyGoalMinutes} 分钟`}>
        <Icon name="target" size={15} />
        周目标 {goalPct}%
      </div>

      <button
        className="topbar-profile"
        onClick={onEditProfile}
        aria-label="编辑个人资料"
        title={profile ? [profile.name, profile.major, profile.grade].filter(Boolean).join(' · ') : '尚未设置个人资料'}
      >
        <span className="topbar-profile-name">{profile?.name ?? '设置资料'}</span>
        <span className="topbar-avatar" aria-hidden="true">{profileInitial(profile) || <Icon name="user" size={18} />}</span>
      </button>
    </header>
  )
}