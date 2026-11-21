import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createStudyTracker, IDLE_MS } from '../src/engines/studyTracker.js'
import { addLocalDays, buildWeekStats, dayKey, sessionDays, weekStart } from '../src/engines/studyTimeEngine.js'
import { createSessionRecord, mergeStudySessions, recoverStudySessions } from '../src/lib/studySessionStorage.js'
import { filterPapers, EMPTY_FILTERS } from '../src/lib/libraryFilter.js'

export async function testStudyFeatures() {
  let count = 0
  const test = (name, fn) => { fn(); count++; console.log(`  PASS  ${name}`) }
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.002, `${a} != ${b}`)
  const fixture = (start = new Date(2026, 10, 18, 12).getTime()) => {
    let wall = start
    let mono = 0
    let id = 0
    let records = []
    const tracker = createStudyTracker({ wallNow: () => wall, monoNow: () => mono, createId: () => `test-${++id}`, onRecord: (r) => { records = mergeStudySessions(records, [createSessionRecord(r)]) } })
    return {
      tracker,
      step(ms) { wall += ms; mono += ms },
      jump(ms) { wall += ms },
      records: () => records,
      total: () => records.reduce((sum, r) => sum + r.durationSeconds, 0),
    }
  }
  const context = { source: 'paper_reader', paperId: 'p1' }
  test('首次进入不生成记录，检查点按稳定 ID 更新而非重复累加', () => {
    const f = fixture(); f.tracker.start(context)
    assert.equal(f.records().length, 0)
    f.step(15000); f.tracker.tick(); f.step(15000); f.tracker.tick()
    assert.equal(f.records().length, 1); near(f.total(), 30)
    f.tracker.tick(); near(f.total(), 30)
  })
  test('切路由结算最后不足 15 秒的区间，并保持论文 ID 与来源', () => {
    const f = fixture(); f.tracker.start(context); f.step(3250)
    f.tracker.setContext({ source: 'library', paperId: null }); f.step(4250); f.tracker.stop()
    near(f.total(), 7.5); assert.equal(f.records().length, 2)
    assert.equal(f.records()[0].paperId, 'p1'); assert.equal(f.records()[1].source, 'library')
  })
  test('后台和 pagehide 重复结算幂等，恢复不会补算后台间隔', () => {
    const f = fixture(); f.tracker.start(context); f.step(8000); f.tracker.stop(); f.tracker.stop()
    f.step(600000); f.tracker.tick(); near(f.total(), 8)
    f.tracker.start(context); f.step(7000); f.tracker.stop(); near(f.total(), 15)
  })
  test('五分钟无操作恰好截止，迟到 tick 不漏计最后区间', () => {
    const f = fixture(); f.tracker.start(context); f.step(IDLE_MS + 5000); f.tracker.tick()
    near(f.total(), 300); assert.equal(f.tracker.idle, true)
    f.step(600000); f.tracker.tick(); near(f.total(), 300)
    f.tracker.activity(); f.step(8000); f.tracker.stop(); near(f.total(), 308)
    assert.equal(f.records().length, 2)
  })
  test('高频操作不按次取整、不频繁持久化，亚秒时长守恒', () => {
    const f = fixture(); f.tracker.start(context)
    for (let i = 0; i < 100; i++) { f.step(125); f.tracker.activity() }
    assert.equal(f.records().length, 0); f.tracker.stop(); near(f.total(), 12.5)
  })
  test('跨本地零点分日期保存，秒数守恒', () => {
    const f = fixture(new Date(2026, 10, 18, 23, 59, 55).getTime())
    f.tracker.start(context); f.step(12000); f.tracker.stop()
    assert.deepEqual(f.records().map((r) => r.date), ['2026-11-18', '2026-11-19'])
    near(f.total(), 12); near(f.records()[0].durationSeconds, 5)
  })
  for (const jump of [3600000, -3600000]) test(`设备时钟${jump > 0 ? '前跳' : '回拨'}不制造时长`, () => {
    const f = fixture(); f.tracker.start(context); f.step(10000); f.tracker.tick()
    f.jump(jump); f.step(1000); f.tracker.tick(); near(f.total(), 10)
    f.step(8000); f.tracker.stop(); near(f.total(), 18)
  })
  test('旧 openSession 只恢复已记录秒数，反复恢复不重复、不追加离线时间', () => {
    const old = { study: { totalSeconds: 99999 }, openSession: { startMs: new Date(2026, 10, 18).getTime(), seconds: 25, source: 'reader', paperId: 'p1' } }
    const recovered = recoverStudySessions(old)
    assert.equal(recovered[0].durationSeconds, 25)
    assert.equal(recoverStudySessions({ ...old, studySessions: recovered }).length, 1)
    assert.equal(recoverStudySessions({ study: old.study }).length, 0)
  })
  test('旧版本逐次取整的记录保留并限制到实际时间跨度', () => {
    const start = new Date(2026, 10, 18).getTime()
    const record = createSessionRecord({ startMs: start, endMs: start + 9700, source: 'reader' })
    const migrated = recoverStudySessions({ studySessions: [{ ...record, durationSeconds: 10 }] })
    assert.equal(migrated.length, 1); near(migrated[0].durationSeconds, 9.7)
  })
  test('超过旧 1000 条上限仍保留真实历史', () => {
    const start = new Date(2026, 10, 18).getTime()
    const records = Array.from({ length: 1001 }, (_, i) => createSessionRecord({ id: `${i}`, startMs: start + i * 1000, endMs: start + (i + 1) * 1000, source: 'quiz' }))
    assert.equal(mergeStudySessions(records).length, 1001)
  })
  test('重叠记录、重复导入与未来时间不会重复或预先计入', () => {
    const start = new Date(2026, 10, 18).getTime()
    const a = createSessionRecord({ id: 'a', startMs: start, endMs: start + 60000, source: 'reader' })
    const b = createSessionRecord({ id: 'b', startMs: start + 30000, endMs: start + 90000, source: 'quiz' })
    near(buildWeekStats([a, a, b], start + 90000).totalSeconds, 90)
    near(buildWeekStats([a, b], start + 45000).totalSeconds, 45)
    near(buildWeekStats([a, b], start - 1).totalSeconds, 0)
  })
  test('跨周记录按周日与周一分摊，无历史不产生对比', () => {
    const start = new Date(2026, 10, 22, 23, 59, 30).getTime()
    const rec = createSessionRecord({ startMs: start, endMs: start + 60000, source: 'quiz' })
    const stats = buildWeekStats([rec], start + 60000)
    near(stats.totalSeconds, 30); near(stats.lastWeekTotalSeconds, 30); assert.equal(stats.studyDays, 1)
    assert.equal(buildWeekStats([], start).lastWeekTotalSeconds, null)
  })
  const originalTZ = process.env.TZ
  try {
    for (const tz of ['Asia/Shanghai', 'America/New_York', 'Europe/Berlin']) {
      process.env.TZ = tz
      for (const [month, date] of [[2, 8], [10, 1], [2, 29], [9, 25]]) {
        test(`${tz} ${month + 1}/${date} 夏令时周使用本地日历七天`, () => {
          const now = new Date(2026, month, date, 23, 59, 59).getTime()
          const start = weekStart(now)
          const record = createSessionRecord({ startMs: new Date(2026, month, date, 23, 59).getTime(), endMs: now, source: 'quiz' })
          const stats = buildWeekStats([record], now)
          assert.equal(new Set(stats.days.map((d) => d.key)).size, 7)
          assert.equal(stats.days[6].key, dayKey(addLocalDays(start, 6)))
          near(stats.days[6].seconds, 59)
          assert.equal(sessionDays([record], now).length, 1)
        })
      }
    }
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }

  const previousWindow = globalThis.window
  const previousStorage = globalThis.localStorage
  const saved = new Map()
  globalThis.window = { addEventListener() {} }
  globalThis.localStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) }
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const store = await server.ssrLoadModule('/src/lib/learningStore.js')
    const state = () => JSON.parse(saved.get('paperpilot:learning') ?? '{}')
    const list = store.papers
    const query = (text = '', filters = {}) => filterPapers(list, { query: text, filters: { ...EMPTY_FILTERS, ...filters } }, (id) => store.paperStatus(state(), id))
    test('目录复用 1 篇现有真实文献和 3 篇明确演示案例', () => {
      assert.equal(list.length, 4); assert.equal(list.filter((p) => !p.demo).length, 1)
      assert.ok(list.filter((p) => p.demo).every((p) => p.authors === null && p.doi === null && p.year === null))
    })
    test('标题、关键词大小写搜索与四项筛选可组合', () => {
      assert.equal(query('lorawan').length, 1)
      assert.equal(query('PMSM', { field: '电气工程', type: '教学演示案例', difficulty: '进阶', status: 'not-started' })[0].id, 'p2')
      assert.equal(query('PMSM', { difficulty: '入门' }).length, 0)
      assert.equal(query('不存在的论文').length, 0)
      assert.equal(filterPapers([], { query: '', filters: EMPTY_FILTERS }, () => 'not-started').length, 0)
      assert.equal(query().length, 4)
    })
    test('打开阅读即为学习中，掌握与完成仅由真实标记推导，取消理解会回退', () => {
      const paper = store.getPaper('p1')
      assert.equal(store.paperStatus(state(), paper.id), 'not-started')
      store.recordReading(paper.id, paper.sections[0].id)
      assert.equal(store.paperStatus(state(), paper.id), 'learning')
      assert.equal(store.paperMasteredCount(state(), paper.id), 0)
      for (const section of paper.sections) store.toggleUnderstood(paper.id, section.id)
      assert.equal(store.paperStatus(state(), paper.id), 'done')
      assert.ok(store.paperMasteredCount(state(), paper.id) > 0)
      store.toggleUnderstood(paper.id, paper.sections[0].id)
      assert.equal(store.paperStatus(state(), paper.id), 'learning')
    })
    test('空论文和缺失章节不能被标为完成，失效旧章节不算进度', () => {
      assert.equal(store.hasSectionContent({}), false)
      assert.equal(store.paperStatus({ understood: { p2: ['obsolete'] } }, 'p2'), 'not-started')
      assert.equal(store.paperProgressPct({}, 'missing'), 0)
      const paper = store.getPaper('p2'); const sections = paper.sections
      paper.sections = []
      try { assert.equal(store.paperStatus(state(), paper.id), 'not-started'); assert.equal(store.paperProgressPct(state(), paper.id), 0) }
      finally { paper.sections = sections }
    })
    test('保留旧答题、笔记与字段；计时检查点不覆盖其他标签新写入的数据', () => {
      saved.set('paperpilot:learning', JSON.stringify({ ...state(), notes: [{ id: 'old-note' }], quizAnswers: [{ qid: 'old-q' }], study: { totalSeconds: 9999 } }))
      const start = Date.now() - 5000
      const record = createSessionRecord({ startMs: start, endMs: start + 5000, source: 'quiz' })
      store.saveStudySession(record); store.saveStudySession(record)
      assert.equal(state().notes[0].id, 'old-note'); assert.equal(state().quizAnswers[0].qid, 'old-q')
      assert.equal(state().studySessions.length, 1); near(store.getStudy(state()).totalSeconds, 5)
    })
    test('档案兼容旧格式并拒绝无效学习区间和阅读进度', () => {
      const archive = (learning) => ({ app: 'paperpilot-studio', version: 1, storage: { learning } })
      assert.ok(store.validateArchive(archive({ understood: { p1: ['background'] } })).ok)
      assert.ok(store.validateArchive(archive(state())).ok)
      assert.equal(store.validateArchive(archive({ studySessions: [{ durationSeconds: -5 }] })).ok, false)
      assert.equal(store.validateArchive(archive({ readingProgress: [] })).ok, false)
      assert.equal(store.validateArchive(archive({ understood: { p1: 'bad' } })).ok, false)
    })

    const { PROFILE_GRADES, isUserProfile, saveUserProfile, skipProfileSetup, profileInitial } = await server.ssrLoadModule('/src/lib/userProfileStore.js')
    const profileKey = 'paperpilot:userProfile'
    const skippedKey = 'paperpilot:profileSetupSkipped'
    const persistedProfile = () => JSON.parse(saved.get(profileKey) ?? 'null')
    const learningBeforeProfiles = saved.get('paperpilot:learning')
    const validProfile = { name: '林晓', major: '跨学科创新 / Computational Media', grade: '研究生', updatedAt: '2026-11-18T12:00:00.000Z' }
    const malformedProfiles = [
      null, [], '林晓', 42, true, {},
      ...[undefined, '', ' \t\n　', 42, '名'.repeat(81)].map((name) => ({ ...validProfile, name })),
      ...[undefined, null, 42, '专'.repeat(121)].map((major) => ({ ...validProfile, major })),
      ...[undefined, null, 1, '大五'].map((grade) => ({ ...validProfile, grade })),
      ...[undefined, null, 0, '', 'not-a-date'].map((updatedAt) => ({ ...validProfile, updatedAt })),
    ]
    const withFailedWrites = (fn) => {
      const setItem = globalThis.localStorage.setItem
      globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError') }
      try { fn() } finally { globalThis.localStorage.setItem = setItem }
    }
    test('首次加载个人档案不生成虚构身份或跳过标记', () => {
      assert.equal(saved.has(profileKey), false)
      assert.equal(saved.has(skippedKey), false)
      assert.equal(persistedProfile(), null)
      assert.equal(isUserProfile(persistedProfile()), false)
      assert.equal(profileInitial(persistedProfile()), '')
    })
    test('空姓名和纯空白姓名保存失败，不生成档案', () => {
      const before = new Map(saved)
      for (const name of ['', ' \t\n　']) {
        const result = saveUserProfile({ name, major: '', grade: '' })
        assert.equal(result.ok, false); assert.ok(result.error)
        assert.deepEqual(saved, before)
      }
    })
    test('跳过写入失败返回 false，不持久化标记或虚构身份', () => {
      const before = new Map(saved)
      withFailedWrites(() => assert.equal(skipProfileSetup(), false))
      assert.deepEqual(saved, before)
    })
    test('跳过设置只持久化布尔标记，不创建身份', () => {
      assert.equal(skipProfileSetup(), true)
      assert.equal(JSON.parse(saved.get(skippedKey)), true)
      assert.equal(saved.has(profileKey), false)
      assert.equal(saved.get('paperpilot:learning'), learningBeforeProfiles)
    })
    test('年级选项保持六个约定中文值', () => {
      assert.deepEqual(PROFILE_GRADES, ['大一', '大二', '大三', '大四', '研究生', '其他'])
    })
    for (const grade of PROFILE_GRADES) test(`中文和英文姓名、自定义专业可保存年级：${grade}`, () => {
      for (const name of ['林晓', 'Ada Lovelace']) {
        assert.deepEqual(saveUserProfile({ name, major: validProfile.major, grade }), { ok: true })
        const profile = persistedProfile()
        assert.deepEqual(profile, { name, major: validProfile.major, grade, updatedAt: profile.updatedAt })
        assert.equal(isUserProfile(profile), true)
      }
    })
    test('专业和年级允许留空，专业空白归一化为空字符串', () => {
      for (const major of ['', ' \t　']) {
        assert.equal(saveUserProfile({ name: 'Ada', major, grade: '' }).ok, true)
        assert.equal(persistedProfile().major, '')
        assert.equal(persistedProfile().grade, '')
        assert.equal(isUserProfile(persistedProfile()), true)
      }
    })
    test('姓名和专业去除首尾空白，并持久化本次保存的 ISO 时间', () => {
      const before = Date.now()
      assert.equal(saveUserProfile({ name: ' \t Ada Lovelace　', major: '　计算机科学 / AI \n', grade: '大三' }).ok, true)
      const profile = persistedProfile()
      const timestamp = Date.parse(profile.updatedAt)
      assert.deepEqual(profile, { name: 'Ada Lovelace', major: '计算机科学 / AI', grade: '大三', updatedAt: profile.updatedAt })
      assert.equal(new Date(timestamp).toISOString(), profile.updatedAt)
      assert.ok(timestamp >= before && timestamp <= Date.now())
    })
    test('姓名 80 字和专业 120 字边界可保存，非法编辑不替换原档案', () => {
      const input = { name: '名'.repeat(80), major: '专'.repeat(120), grade: '' }
      assert.equal(saveUserProfile(input).ok, true)
      assert.equal(persistedProfile().name, input.name)
      assert.equal(persistedProfile().major, input.major)
      const before = new Map(saved)
      for (const patch of [{ name: '' }, { name: ' \t　' }, { name: '名'.repeat(81) }, { major: '专'.repeat(121) }, { grade: '大五' }]) {
        const result = saveUserProfile({ ...input, ...patch })
        assert.equal(result.ok, false); assert.ok(result.error)
        assert.deepEqual(saved, before)
      }
    })
    test('存储写入失败返回错误且保留先前档案和所有已保存数据', () => {
      const before = new Map(saved)
      withFailedWrites(() => {
        const result = saveUserProfile({ name: 'New Name', major: 'New Major', grade: '其他' })
        assert.equal(result.ok, false); assert.ok(result.error)
      })
      assert.deepEqual(saved, before)
    })
    test('头像使用真实姓名首个 Unicode 字符，英文大写且缺失身份为空', () => {
      assert.equal(profileInitial(null), '')
      assert.equal(profileInitial(undefined), '')
      for (const [name, initial] of [[' \t ', ''], [' 林晓 ', '林'], [' ada Lovelace ', 'A'], ['\u{20000}明', '\u{20000}']]) {
        assert.equal(profileInitial({ ...validProfile, name }), initial)
      }
    })
    test('档案校验拒绝错误结构、类型、长度、年级和时间', () => {
      assert.equal(isUserProfile(validProfile), true)
      assert.equal(isUserProfile({ ...validProfile, major: '', grade: '' }), true)
      assert.equal(isUserProfile(undefined), false)
      for (const profile of malformedProfiles) assert.equal(isUserProfile(profile), false, JSON.stringify(profile))
    })
    test('个人档案保存、无效编辑和跳过设置不改变学习记录', () => {
      assert.equal(saved.get('paperpilot:learning'), learningBeforeProfiles)
    })

    // Use explicit objects: the localStorage mock stores keys in a Map, not enumerable properties.
    const profileArchive = (storage) => ({ app: 'paperpilot-studio', version: 1, storage })
    test('档案接收并应用个人资料及 true/false 跳过标记，不改学习记录', () => {
      for (const profile of [validProfile, { ...validProfile, name: 'Ada', major: '', grade: '' }]) {
        for (const profileSetupSkipped of [true, false]) {
          const archive = profileArchive({ userProfile: profile, profileSetupSkipped })
          assert.deepEqual(store.validateArchive(archive), { ok: true })
          store.applyArchive(archive.storage)
          assert.deepEqual(persistedProfile(), profile)
          assert.equal(JSON.parse(saved.get(skippedKey)), profileSetupSkipped)
          assert.equal(saved.get('paperpilot:learning'), learningBeforeProfiles)
        }
      }
    })
    test('档案拒绝畸形个人资料和非布尔跳过标记，校验不改变持久化数据', () => {
      const before = new Map(saved)
      for (const userProfile of malformedProfiles) {
        const result = store.validateArchive(profileArchive({ userProfile }))
        assert.equal(result.ok, false, JSON.stringify(userProfile)); assert.ok(result.error)
      }
      for (const profileSetupSkipped of [null, 'true', 'false', 0, 1, {}, []]) {
        const result = store.validateArchive(profileArchive({ profileSetupSkipped }))
        assert.equal(result.ok, false, JSON.stringify(profileSetupSkipped)); assert.ok(result.error)
      }
      assert.deepEqual(saved, before)
    })
    test('旧档案不含个人资料仍可校验和应用，不创建或覆盖身份', () => {
      const archive = profileArchive({ learning: state() })
      assert.deepEqual(store.validateArchive(archive), { ok: true })
      for (const profile of [null, validProfile]) {
        saved.delete(profileKey); saved.delete(skippedKey)
        if (profile) {
          saved.set(profileKey, JSON.stringify(profile))
          saved.set(skippedKey, 'true')
        }
        const before = new Map(saved)
        store.applyArchive(archive.storage)
        assert.deepEqual(saved, before)
        assert.equal(saved.get('paperpilot:learning'), learningBeforeProfiles)
      }
    })
  } finally {
    await server.close()
    globalThis.window = previousWindow
    globalThis.localStorage = previousStorage
  }
  console.log(`\nStudy/library regression: ${count} PASS`)
}
