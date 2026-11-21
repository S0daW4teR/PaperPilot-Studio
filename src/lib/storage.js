const PREFIX = 'paperpilot:'

let writesDisabled = false

/* 导入/清空后即将刷新页面时调用：阻止 pagehide 计时结算覆盖刚写入的档案 */
export function disableWrites() {
  writesDisabled = true
}

export function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveState(key, value) {
  if (writesDisabled) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}