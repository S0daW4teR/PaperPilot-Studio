/* 学习时长统计引擎：纯函数。周定义为本地时间周一 00:00 至周日 23:59:59。 */

export const STUDY_TIME_RULES = {
  T1: '学习区间仅页面可见且 5 分钟内有操作时累计；后台/空闲/关页时结算为独立记录',
  T2: 'durationSeconds 来自真实时间差；跨本地零点的区间按日期切分，不重复计算',
  T3: '本周 = 本地周一 00:00 起 7 天；上周对比仅在上周存在真实记录时显示',
  T4: '显示规则：<1 小时显示分钟；≥1 小时显示小时+分钟；无记录显示 0 分钟',
}

export function dayKey(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function weekStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec))
  if (s < 3600) return `${Math.floor(s / 60)} 分钟`
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分钟`
}

/* 把 [startMs, endMs) 按本地零点切分为按日归属的片段 */
export function splitByDay(startMs, endMs) {
  const out = []
  let cur = startMs
  while (cur < endMs) {
    const d = new Date(cur)
    d.setHours(24, 0, 0, 0)
    const boundary = Math.min(d.getTime(), endMs)
    out.push({ startMs: cur, endMs: boundary, date: dayKey(cur), seconds: (boundary - cur) / 1000 })
    cur = boundary
  }
  return out
}

export function addLocalDays(ts, count) {
  const d = new Date(ts)
  d.setDate(d.getDate() + count)
  return d.getTime()
}

export function sessionDays(sessions, nowTs = Date.now()) {
  const intervals = sessions.flatMap((s) => {
    const startMs = Date.parse(s.startTime)
    const seconds = s.durationSeconds
    const endMs = Math.min(s.endTime ? Date.parse(s.endTime) : startMs + seconds * 1000, startMs + seconds * 1000, nowTs)
    return Number.isFinite(startMs) && Number.isFinite(seconds) && seconds > 0 && endMs > startMs
      ? [{ startMs, endMs }]
      : []
  }).sort((a, b) => a.startMs - b.startMs)
  const parts = []
  let countedUntil = -Infinity
  for (const interval of intervals) {
    const start = Math.max(interval.startMs, countedUntil)
    if (start < interval.endMs) parts.push(...splitByDay(start, interval.endMs))
    countedUntil = Math.max(countedUntil, interval.endMs)
  }
  return parts
}

export function buildWeekStats(sessions, nowTs) {
  const start = weekStart(nowTs)
  const previousStart = addLocalDays(start, -7)
  const end = addLocalDays(start, 7)
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const days = labels.map((label, i) => ({ key: dayKey(addLocalDays(start, i)), label, seconds: 0 }))
  let lastWeekTotal = 0
  for (const part of sessionDays(sessions, nowTs)) {
    if (part.startMs >= start && part.startMs < end) {
      days.find((d) => d.key === part.date).seconds += part.seconds
    } else if (part.startMs >= previousStart && part.startMs < start) {
      lastWeekTotal += part.seconds
    }
  }
  return {
    weekStartMs: start,
    days,
    totalSeconds: days.reduce((sum, d) => sum + d.seconds, 0),
    studyDays: days.filter((d) => d.seconds > 0).length,
    lastWeekTotalSeconds: lastWeekTotal > 0 ? lastWeekTotal : null,
  }
}

export function studyStreak(sessions, nowTs) {
  const set = new Set(sessionDays(sessions, nowTs).map((s) => s.date))
  let streak = 0
  let cursor = new Date(nowTs)
  cursor.setHours(0, 0, 0, 0)
  if (!set.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function selfTest() {
  const cases = []
  const t = (name, pass) => cases.push({ name, pass: !!pass })
  const now = new Date(2026, 10, 18, 12, 0, 0).getTime()
  const ws = weekStart(now)
  t('周起点为本地周一 00:00', new Date(ws).getDay() === 1 && new Date(ws).getHours() === 0)
  t('周日归属本周而非下周', dayKey(ws + 6 * 86400000) === dayKey(new Date(2026, 10, 22).getTime()))
  t('formatDuration 小于 1 小时显示分钟', formatDuration(59 * 60) === '59 分钟')
  t('formatDuration 大于等于 1 小时显示小时分钟', formatDuration(3600 + 120) === '1 小时 2 分钟')
  t('formatDuration 无记录为 0 分钟', formatDuration(0) === '0 分钟')
  const a = new Date(2026, 10, 18, 23, 50, 0).getTime()
  const b = new Date(2026, 10, 19, 0, 10, 0).getTime()
  const parts = splitByDay(a, b)
  t('跨零点区间切分为两段且秒数守恒', parts.length === 2 && parts[0].seconds + parts[1].seconds === 20 * 60)
  t('跨零点片段归属各自日期', parts[0].date === '2026-11-18' && parts[1].date === '2026-11-19')
  const sess = (startMs, sec) => ({ startTime: new Date(startMs).toISOString(), durationSeconds: sec, date: dayKey(startMs) })
  const empty = buildWeekStats([], now)
  t('无记录时本周 0 且上周对比为 null', empty.totalSeconds === 0 && empty.lastWeekTotalSeconds === null && empty.studyDays === 0)
  const stats = buildWeekStats([sess(ws + 3600000, 600), sess(ws + 2 * 86400000, 1200), sess(ws - 86400000, 300)], now)
  t('本周按日累加真实秒数', stats.days[0].seconds === 600 && stats.days[2].seconds === 1200 && stats.totalSeconds === 1800)
  t('学习天数只计有记录的天', stats.studyDays === 2)
  t('上周有记录时给出对比值', stats.lastWeekTotalSeconds === 300)
  t('连续学习天数从今天或昨天起算', studyStreak([sess(now - 60000, 60), sess(now - 86400000, 60)], now) === 2)
  t('中断后连续天数重置', studyStreak([sess(now - 60000, 60), sess(now - 3 * 86400000, 60)], now) === 1)
  return { engine: 'studyTimeEngine', cases }
}