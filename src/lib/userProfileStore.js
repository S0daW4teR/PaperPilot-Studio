import { useSyncExternalStore } from 'react'
import { loadState, saveState } from './storage.js'

export const PROFILE_GRADES = ['大一', '大二', '大三', '大四', '研究生', '其他']

export function isUserProfile(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 80
    && typeof value.major === 'string' && value.major.length <= 120
    && (value.grade === '' || PROFILE_GRADES.includes(value.grade))
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
}

function readState() {
  const profile = loadState('userProfile', null)
  return {
    profile: isUserProfile(profile) ? profile : null,
    setupSkipped: loadState('profileSetupSkipped', false) === true,
  }
}

let state = readState()
const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener())
}

window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== 'paperpilot:userProfile' && event.key !== 'paperpilot:profileSetupSkipped') return
  state = readState()
  emit()
})

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useUserProfile() {
  return useSyncExternalStore(subscribe, () => state)
}

export function saveUserProfile({ name, major, grade }) {
  const profile = { name: name.trim(), major: major.trim(), grade, updatedAt: new Date().toISOString() }
  if (!profile.name) return { ok: false, error: '请输入姓名，不能只填写空格。' }
  if (!isUserProfile(profile)) return { ok: false, error: '请检查姓名、专业长度和年级选项。' }
  if (!saveState('userProfile', profile)) {
    return { ok: false, error: '保存失败：本地存储不可写或空间不足，请检查浏览器设置后重试。' }
  }
  state = { ...state, profile }
  emit()
  return { ok: true }
}

export function skipProfileSetup() {
  const saved = saveState('profileSetupSkipped', true)
  state = { ...state, setupSkipped: true }
  emit()
  return saved === true
}

export function profileInitial(profile) {
  return Array.from(profile?.name.trim() ?? '')[0]?.toLocaleUpperCase() ?? ''
}
