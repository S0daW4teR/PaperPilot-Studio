import { useSyncExternalStore } from 'react'
import { loadState, saveState } from './storage.js'
import { L } from './lorawanData.js'
import { catalog } from '../data/papers.js'
import legacyKnowledge from '../data/knowledge.json'
import { isSessionRecord, mergeStudySessions, recoverStudySessions } from './studySessionStorage.js'
import { sessionDays } from '../engines/studyTimeEngine.js'
import { isUserProfile } from './userProfileStore.js'

export const papers = catalog
/* 真实论文知识点 + 演示案例知识节点（旧 n-* 命名空间，归一化为统一形状） */
export const nodes = [
  ...L.nodes,
  ...legacyKnowledge.nodes.map((n) => ({
    ...n,
    category: n.domain,
    explanation: n.def,
    learningObjectives: [],
    example: '',
    prerequisites: [],
    difficulty: null,
    source: null,
    demo: true,
  })),
]
export const disclaimer = L.paper.sourcePolicy.paperFacts
export const sectionOrder = L.paper.sections.map((s) => s.id)

const KEY = 'learning'
const DEFAULT = {
  understood: { [L.paper.id]: [] },
  lastPaper: L.paper.id,
  lastSection: null,
  quizAnswers: [],
  labResults: {},
  quizSessions: [],
  favorites: [],
  notes: [],
  studySessions: [],
  readingProgress: {},
  schemaVersion: 2,
}

function normalizeLearning(saved) {
  const next = { ...DEFAULT, ...saved, schemaVersion: 2, openSession: null }
  next.understood = saved?.understood ?? {}
  next.readingProgress = saved?.readingProgress ?? {}
  next.studySessions = recoverStudySessions(saved ?? {})
  if (!catalog.some((p) => p.id === next.lastPaper)) next.lastPaper = L.paper.id
  return next
}

let state = normalizeLearning(loadState(KEY, DEFAULT))
const listeners = new Set()

function refreshState() {
  if (!state.persistenceWarning) state = normalizeLearning(loadState(KEY, state))
}

window.addEventListener('storage', (event) => {
  if (event.key !== 'paperpilot:learning' && event.key !== null) return
  state = normalizeLearning(loadState(KEY, DEFAULT))
  listeners.forEach((listener) => listener())
})

function emit() {
  const persisted = { ...state }
  delete persisted.persistenceWarning
  const saved = saveState(KEY, persisted)
  state = { ...state, persistenceWarning: saved === false ? '本地存储不可写或空间不足：本次新进度暂存内存，刷新后可能丢失。请先释放浏览器存储空间后继续操作以重试保存。' : null }
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLearning() {
  return useSyncExternalStore(subscribe, () => state)
}

export function getPaper(id) {
  return catalog.find((p) => p.id === id)
}

export function getNode(id) {
  return nodes.find((n) => n.id === id)
}

export function getUnderstood(s, paperId) {
  const list = s.understood?.[paperId] ?? []
  return (getPaper(paperId)?.sections ?? []).filter((section) => list.includes(section.id)).map((section) => section.id)
}

export function toggleUnderstood(paperId, sectionId) {
  refreshState()
  const section = getPaper(paperId)?.sections.find((s) => s.id === sectionId)
  if (!section || !hasSectionContent(section)) return
  const list = getUnderstood(state, paperId)
  const next = list.includes(sectionId)
    ? list.filter((id) => id !== sectionId)
    : [...list, sectionId]
  state = { ...state, understood: { ...state.understood, [paperId]: next } }
  emit()
}

export function setLastPaper(id) {
  refreshState()
  if (!getPaper(id) || state.lastPaper === id) return
  state = { ...state, lastPaper: id, lastSection: null }
  emit()
}

export function recordReading(paperId, sectionId) {
  refreshState()
  if (!getPaper(paperId)?.sections.some((section) => section.id === sectionId)) return
  const previous = state.readingProgress[paperId]
  if (previous?.lastSection === sectionId && state.lastPaper === paperId) return
  state = {
    ...state,
    lastPaper: paperId,
    lastSection: sectionId,
    readingProgress: {
      ...state.readingProgress,
      [paperId]: { startedAt: previous?.startedAt ?? new Date().toISOString(), lastSection: sectionId },
    },
  }
  emit()
}

export function hasSectionContent(section) {
  return !!(section.blocks?.length || section.professionalSummary?.trim())
}

export function addQuizAnswer(record) {
  refreshState()
  const list = [...(state.quizAnswers ?? []), record].slice(-500)
  state = { ...state, quizAnswers: list }
  emit()
}

export function getQuizAnswers(s) {
  return s.quizAnswers ?? []
}

export function setLastSection(id) {
  refreshState()
  state = { ...state, lastSection: id }
  emit()
}

/* 方法实验室：每个练习保留尝试次数、历史最佳与最近一次得分 */
export function getLabResults(s) {
  return s.labResults ?? {}
}

export function saveLabResult(exId, result) {
  refreshState()
  const prev = state.labResults ?? {}
  const old = prev[exId]
  const next = {
    ...prev,
    [exId]: {
      attempts: (old?.attempts ?? 0) + 1,
      best: Math.max(old?.best ?? 0, result.score),
      last: result.score,
      lastTs: result.ts,
    },
  }
  state = { ...state, labResults: next }
  emit()
}

/* 能力测试：完整会话记录（题目、选择、得分），薄弱分析只基于这些真实记录 */
export function getQuizSessions(s) {
  return s.quizSessions ?? []
}

export function addQuizSession(session) {
  refreshState()
  const list = [...(state.quizSessions ?? []), session].slice(-20)
  state = { ...state, quizSessions: list }
  emit()
}

/* 收藏论文 */
export function getFavorites(s) {
  return s.favorites ?? []
}

export function toggleFavorite(paperId) {
  refreshState()
  const list = state.favorites ?? []
  const next = list.includes(paperId) ? list.filter((id) => id !== paperId) : [...list, paperId]
  state = { ...state, favorites: next }
  emit()
}

/* 学习笔记：按论文章节挂载 */
export function getNotes(s) {
  return s.notes ?? []
}

export function addNote(note) {
  refreshState()
  const list = [...(state.notes ?? []), note].slice(-200)
  state = { ...state, notes: list }
  emit()
}

export function deleteNote(id) {
  refreshState()
  state = { ...state, notes: (state.notes ?? []).filter((n) => n.id !== id) }
  emit()
}

export function getStudySessions(s) {
  return s.studySessions ?? []
}

export function getEffectiveSessions(s) {
  return getStudySessions(s)
}

export function saveStudySession(record) {
  refreshState()
  state = { ...state, studySessions: mergeStudySessions(state.studySessions, [record]), openSession: null }
  emit()
}

export function getStudy(s) {
  const byDay = {}
  let totalSeconds = 0
  for (const part of sessionDays(getEffectiveSessions(s))) {
    byDay[part.date] = (byDay[part.date] ?? 0) + part.seconds
    totalSeconds += part.seconds
  }
  return { totalSeconds, byDay }
}

/* 论文学习状态：完全由真实阅读进度推导 */
export function paperStatus(s, paperId) {
  const paper = getPaper(paperId)
  if (!paper) return 'not-started'
  const done = getUnderstood(s, paperId).length
  if (paper.sections.length > 0 && done === paper.sections.length && paper.sections.every(hasSectionContent)) return 'done'
  return done > 0 || s.readingProgress?.[paperId]?.startedAt ? 'learning' : 'not-started'
}

export function paperMasteredCount(s, paperId) {
  const paper = getPaper(paperId)
  if (!paper) return 0
  const set = new Set()
  for (const sec of paper.sections) {
    if (getUnderstood(s, paperId).includes(sec.id)) (sec.nodes ?? []).forEach((id) => set.add(id))
  }
  return set.size
}

/* ---------- 学习档案：导出 / 导入 / 清空（全部本地操作） ---------- */

const ARCHIVE_KEYS = ['learning', 'onboarding', 'sidebarCollapsed', 'inspirationDir', 'inspirationSeed', 'userProfile', 'profileSetupSkipped']

export function exportArchive() {
  const storage = {}
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('paperpilot:')) continue
    try {
      storage[key.slice('paperpilot:'.length)] = JSON.parse(localStorage.getItem(key))
    } catch {
      /* 损坏的键不进入档案 */
    }
  }
  return {
    app: 'paperpilot-studio',
    version: 1,
    exportedAt: new Date().toISOString(),
    storage,
  }
}

export function validateArchive(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: '文件不是 JSON 对象' }
  if (obj.app !== 'paperpilot-studio') return { ok: false, error: '缺少 PaperPilot 档案标识（app 字段）' }
  if (typeof obj.version !== 'number') return { ok: false, error: '缺少版本号' }
  if (!obj.storage || typeof obj.storage !== 'object') return { ok: false, error: '缺少 storage 数据段' }
  const l = obj.storage.learning
  if (l !== undefined) {
    if (!l || typeof l !== 'object') return { ok: false, error: 'learning 段格式错误' }
    if (l.understood !== undefined && (!l.understood || Array.isArray(l.understood) || typeof l.understood !== 'object' || !Object.values(l.understood).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')))) return { ok: false, error: 'understood 格式错误' }
    if (l.studySessions !== undefined && (!Array.isArray(l.studySessions) || !l.studySessions.every(isSessionRecord))) return { ok: false, error: 'studySessions 学习区间格式错误' }
    if (l.readingProgress !== undefined && (!l.readingProgress || Array.isArray(l.readingProgress) || typeof l.readingProgress !== 'object' || !Object.values(l.readingProgress).every((p) => p && typeof p.lastSection === 'string' && Number.isFinite(Date.parse(p.startedAt))))) return { ok: false, error: 'readingProgress 格式错误' }
    for (const k of ['quizAnswers', 'quizSessions', 'favorites', 'notes']) {
      if (l[k] !== undefined && !Array.isArray(l[k])) return { ok: false, error: `${k} 应为数组` }
    }
    if (l.labResults !== undefined && typeof l.labResults !== 'object') return { ok: false, error: 'labResults 格式错误' }
    if (l.study !== undefined && (typeof l.study !== 'object' || typeof l.study.totalSeconds !== 'number')) {
      return { ok: false, error: 'study 格式错误' }
    }
  }
  if (obj.storage.userProfile !== undefined && !isUserProfile(obj.storage.userProfile)) {
    return { ok: false, error: 'userProfile 个人资料格式错误' }
  }
  if (obj.storage.profileSetupSkipped !== undefined && typeof obj.storage.profileSetupSkipped !== 'boolean') {
    return { ok: false, error: 'profileSetupSkipped 格式错误' }
  }
  for (const k of Object.keys(obj.storage)) {
    if (!ARCHIVE_KEYS.includes(k)) return { ok: false, error: `包含未知数据键：${k}` }
  }
  return { ok: true }
}

export function applyArchive(storage) {
  for (const key of ARCHIVE_KEYS) {
    if (key in storage) saveState(key, storage[key])
  }
}

export function clearAllLocal() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('paperpilot:')) localStorage.removeItem(key)
  }
}

export function localUsageBytes() {
  let bytes = 0
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('paperpilot:')) bytes += (localStorage.getItem(key) ?? '').length + key.length
  }
  return bytes
}

/* 已掌握知识点 = 所有「已理解章节」挂载的知识节点并集（取消理解会同步回落） */
export function getMasteredIds(s) {
  const set = new Set()
  for (const paper of papers) {
    const done = getUnderstood(s, paper.id)
    for (const sec of paper.sections) {
      if (done.includes(sec.id)) sec.nodes.forEach((id) => set.add(id))
    }
  }
  return [...set]
}

export function paperProgressPct(s, paperId) {
  const paper = getPaper(paperId)
  return paper?.sections.length ? Math.round((getUnderstood(s, paperId).length / paper.sections.length) * 100) : 0
}

export function overallProgressPct(s) {
  const total = papers.reduce((sum, p) => sum + p.sections.length, 0)
  const done = papers.reduce((sum, p) => sum + getUnderstood(s, p.id).length, 0)
  return total ? Math.round((done / total) * 100) : 0
}

export function completedPaperCount(s) {
  return papers.filter((p) => paperStatus(s, p.id) === 'done').length
}

const CATEGORY_PALETTE = ['#2E6BFF', '#22D3EE', '#F59E0B', '#16A34A', '#8B5CF6', '#EF4444', '#0E7490', '#DB2777', '#64748B']
const categories = [...new Set(nodes.map((n) => n.domain))]
export const domainColors = Object.fromEntries(categories.map((c, i) => [c, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]]))

export function domainCoverage(s) {
  const mastered = new Set(getMasteredIds(s))
  const names = [...new Set(nodes.map((n) => n.domain))]
  return names.map((name) => {
    const all = nodes.filter((n) => n.domain === name)
    const got = all.filter((n) => mastered.has(n.id)).length
    return { name, pct: Math.round((got / all.length) * 100), got, total: all.length, color: domainColors[name] }
  })
}