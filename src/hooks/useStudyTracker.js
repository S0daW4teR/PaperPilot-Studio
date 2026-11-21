import { useEffect, useRef } from 'react'
import { saveStudySession } from '../lib/learningStore.js'
import { createSessionRecord } from '../lib/studySessionStorage.js'
import { CHECKPOINT_MS, IDLE_MS, createStudyTracker } from '../engines/studyTracker.js'

export function useStudyTracker(route, paperId) {
  const context = useRef(null)
  context.current = { source: route === 'reader' ? 'paper_reader' : route, paperId: route === 'reader' ? paperId : null }
  const trackerRef = useRef(null)

  useEffect(() => {
    const tracker = createStudyTracker({ onRecord: (record) => saveStudySession(createSessionRecord(record)) })
    trackerRef.current = tracker
    let request = null
    let release = null
    let stopped = false
    let lastInteraction = performance.now()

    const pause = () => {
      tracker.stop()
      request?.abort()
      request = null
      release?.()
      release = null
    }
    const resume = () => {
      if (stopped || document.visibilityState !== 'visible' || request || !navigator.locks || performance.now() - lastInteraction >= IDLE_MS) return
      const controller = new AbortController()
      request = controller
      navigator.locks.request('paperpilot:study-tracker', { signal: controller.signal }, async () => {
        if (controller.signal.aborted || stopped || performance.now() - lastInteraction >= IDLE_MS) return
        tracker.start(context.current, lastInteraction)
        await new Promise((resolve) => { release = resolve })
      }).catch((error) => {
        if (error.name !== 'AbortError') console.error('学习计时无法取得跨标签锁', error)
      }).finally(() => {
        if (request === controller) request = null
      })
    }
    const onShow = () => {
      lastInteraction = performance.now()
      resume()
    }
    const visibility = () => document.visibilityState === 'visible' ? onShow() : pause()
    const activity = () => {
      if (document.visibilityState !== 'visible') return
      lastInteraction = performance.now()
      tracker.activity()
      resume()
    }
    const interval = setInterval(() => {
      tracker.tick()
      if (tracker.idle) pause()
    }, CHECKPOINT_MS)
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }))
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pause)
    window.addEventListener('pageshow', onShow)
    resume()
    return () => {
      stopped = true
      clearInterval(interval)
      events.forEach((event) => window.removeEventListener(event, activity))
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', pause)
      window.removeEventListener('pageshow', onShow)
      pause()
      trackerRef.current = null
    }
  }, [])

  useEffect(() => {
    trackerRef.current?.setContext(context.current)
  }, [route, paperId])
}
