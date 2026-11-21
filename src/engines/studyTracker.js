export const IDLE_MS = 5 * 60 * 1000
export const CHECKPOINT_MS = 15000

export function createStudyTracker({ onRecord, wallNow = Date.now, monoNow = () => performance.now(), createId = () => crypto.randomUUID() }) {
  let active = false
  let previous
  let lastActivity
  let segment = null
  let context = { source: 'dashboard', paperId: null }

  const sample = () => ({ wall: wallNow(), mono: monoNow() })
  const publish = () => {
    if (segment && segment.endMs > segment.startMs) {
      onRecord({ ...segment, durationSeconds: (segment.endMs - segment.startMs) / 1000 })
    }
  }

  function advance(persist = true) {
    const now = sample()
    if (!active) return now
    const elapsed = now.mono - previous.mono
    const wallElapsed = now.wall - previous.wall
    // 时钟跳变的区间无法可靠归属日期，保留此前检查点但不估算异常间隔。
    if (elapsed < 0 || Math.abs(wallElapsed - elapsed) > 2000) {
      segment = null
      previous = now
      return now
    }
    const allowed = Math.max(0, Math.min(elapsed, lastActivity + IDLE_MS - previous.mono))
    let from = segment?.endMs ?? previous.wall
    const end = from + allowed
    while (from < end) {
      const midnight = new Date(from)
      midnight.setHours(24, 0, 0, 0)
      const to = Math.min(end, midnight.getTime())
      if (!segment) segment = { id: createId(), startMs: from, endMs: from, ...context }
      segment.endMs = to
      from = to
      if (to === midnight.getTime()) {
        publish()
        segment = null
      }
    }
    if (persist || now.mono >= lastActivity + IDLE_MS) publish()
    if (now.mono >= lastActivity + IDLE_MS) segment = null
    previous = now
    return now
  }

  return {
    start(nextContext, activityAt) {
      if (active) return
      context = nextContext
      previous = sample()
      lastActivity = activityAt ?? previous.mono
      active = true
      segment = null
    },
    tick: advance,
    activity() {
      const now = advance(false)
      if (active) lastActivity = now.mono
    },
    setContext(nextContext) {
      if (context.source === nextContext.source && context.paperId === nextContext.paperId) return
      advance()
      context = nextContext
      segment = null
    },
    stop() {
      advance()
      active = false
      segment = null
    },
    get idle() { return active && monoNow() - lastActivity >= IDLE_MS },
  }
}
