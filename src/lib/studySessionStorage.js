import { dayKey } from '../engines/studyTimeEngine.js'

export function createSessionRecord({ id = crypto.randomUUID(), startMs, endMs, source, paperId }) {
  startMs = Math.floor(startMs)
  endMs = Math.floor(endMs)
  return {
    id,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    durationSeconds: (endMs - startMs) / 1000,
    date: dayKey(startMs),
    source: source ?? 'unknown',
    paperId: paperId ?? null,
  }
}

export function isSessionRecord(record) {
  if (!record || typeof record.id !== 'string' || !record.id) return false
  const start = Date.parse(record.startTime)
  const end = Date.parse(record.endTime)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    && Number.isFinite(record.durationSeconds) && record.durationSeconds > 0
    && typeof record.source === 'string'
    && (record.paperId == null || typeof record.paperId === 'string')
}

export function mergeStudySessions(...lists) {
  const byId = new Map()
  for (const record of lists.flat()) {
    if (!isSessionRecord(record)) continue
    // 旧计时器逐次取整可能超出时间戳跨度，迁移只保留可验证的时长。
    const normalized = { ...record, durationSeconds: Math.min(record.durationSeconds, (Date.parse(record.endTime) - Date.parse(record.startTime)) / 1000), date: dayKey(Date.parse(record.startTime)) }
    const old = byId.get(record.id)
    if (!old || old.durationSeconds < normalized.durationSeconds) byId.set(record.id, normalized)
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
}

export function recoverStudySessions(learning) {
  const sessions = Array.isArray(learning.studySessions) ? learning.studySessions : []
  const open = learning.openSession
  if (!open || !Number.isFinite(open.startMs) || !Number.isFinite(open.seconds) || open.seconds <= 0) {
    return mergeStudySessions(sessions)
  }
  const endMs = open.startMs + open.seconds * 1000
  if (!Number.isFinite(new Date(endMs).getTime())) return mergeStudySessions(sessions)
  const recovered = createSessionRecord({
    id: `recovered_${open.startMs}_${open.source}_${open.paperId ?? ''}`,
    startMs: open.startMs,
    endMs,
    source: open.source,
    paperId: open.paperId,
  })
  return mergeStudySessions(sessions, [recovered])
}
