import { useEffect, useState } from 'react'

export const ROUTES = [
  { path: 'dashboard', label: '学习仪表盘', en: 'Dashboard', icon: 'dashboard' },
  { path: 'library', label: '论文案例库', en: 'Paper Library', icon: 'library' },
  { path: 'reader', label: '论文拆解', en: 'Paper Reader', icon: 'reader' },
  { path: 'map', label: '知识地图', en: 'Knowledge Map', icon: 'map' },
  { path: 'lab', label: '方法实验室', en: 'Method Lab', icon: 'flask' },
  { path: 'quiz', label: '能力测试', en: 'Quiz', icon: 'quiz' },
  { path: 'profile', label: '学习档案', en: 'Learning Profile', icon: 'user' },
  { path: 'ai-guide', label: 'AI 论文拆解指南', en: 'AI Paper Guide', icon: 'spark' },
  { path: 'paper-import', label: '论文导入', en: 'Paper Import', icon: 'upload' },
  { path: 'imported-paper', label: '导入论文学习', en: 'Imported Paper', icon: 'reader', hidden: true },
]

function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const path = raw.split('?')[0]
  return ROUTES.some((r) => r.path === path) ? path : 'dashboard'
}

export function navigate(path, params = {}) {
  const query = new URLSearchParams(params).toString()
  window.location.hash = '/' + path + (query ? `?${query}` : '')
}

export function useHashParams() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return new URLSearchParams(hash.split('?')[1] ?? '')
}

export function useHashRoute() {
  const [route, setRoute] = useState(readHash)

  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}