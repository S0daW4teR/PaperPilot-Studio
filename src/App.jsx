import { useEffect, useState } from 'react'
import Sidebar from './components/layout/Sidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import PaperReader from './pages/PaperReader.jsx'
import KnowledgeMap from './pages/KnowledgeMap.jsx'
import MethodLab from './pages/MethodLab.jsx'
import Quiz from './pages/Quiz.jsx'
import LearningProfile from './pages/LearningProfile.jsx'
import PaperImport from './pages/PaperImport.jsx'
import ImportedPaper from './pages/ImportedPaper.jsx'
import PaperAnalysisGuide from './pages/PaperAnalysisGuide.jsx'
import { useHashRoute, useHashParams } from './hooks/useHashRoute.js'
import { useStudyTracker } from './hooks/useStudyTracker.js'
import { loadState, saveState } from './lib/storage.js'
import { useLearning } from './lib/learningStore.js'
import PaperLibrary from './pages/PaperLibrary.jsx'
import UserProfileDialog from './components/UserProfileDialog.jsx'
import { useUserProfile, skipProfileSetup } from './lib/userProfileStore.js'

export default function App() {
  const route = useHashRoute()
  const learning = useLearning()
  const params = useHashParams()
  const paperId = params.get('paperId') ?? learning.lastPaper
  const [collapsed, setCollapsed] = useState(() => loadState('sidebarCollapsed', false))
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, setupSkipped } = useUserProfile()
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileNotice, setProfileNotice] = useState('')
  const needsSetup = !profile && !setupSkipped

  useStudyTracker(route, paperId)

  const editProfile = () => {
    setProfileNotice('')
    setEditingProfile(true)
  }

  const dismissProfile = () => {
    if (needsSetup) {
      const saved = skipProfileSetup()
      setProfileNotice(saved ? '已跳过个人资料设置，可随时点击「编辑个人资料」补充。' : '已跳过。本地存储不可写，下次打开可能再次显示设置。')
    }
    setEditingProfile(false)
  }

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v
      saveState('sidebarCollapsed', next)
      return next
    })
  }

  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo(0, 0)
  }, [route])

  return (
    <div className="app-shell">
      <Sidebar
        route={route}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Topbar route={route} onOpenMobile={() => setMobileOpen(true)} onEditProfile={editProfile} />
        <main>
          {profileNotice && <div className="profile-notice" role="status">{profileNotice}</div>}
          {learning.persistenceWarning && <div className="card card-pad" role="alert">{learning.persistenceWarning}</div>}
          {route === 'dashboard' && <Dashboard onEditProfile={editProfile} />}
          {route === 'library' && <PaperLibrary />}
          {route === 'reader' && <PaperReader paperId={paperId} />}
          {route === 'map' && <KnowledgeMap />}
          {route === 'lab' && <MethodLab />}
          {route === 'quiz' && <Quiz />}
          {route === 'profile' && <LearningProfile onEditProfile={editProfile} />}
          {route === 'ai-guide' && <PaperAnalysisGuide />}
          {route === 'paper-import' && <PaperImport />}
          {route === 'imported-paper' && <ImportedPaper paperId={paperId} />}
        </main>
      </div>
      {(needsSetup || editingProfile) && (
        <UserProfileDialog
          profile={profile}
          welcome={needsSetup}
          onSaved={() => {
            setEditingProfile(false)
            setProfileNotice('个人资料已保存。')
          }}
          onDismiss={dismissProfile}
        />
      )}
    </div>
  )
}