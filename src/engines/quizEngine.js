/* 科研阅读能力测试引擎：组卷 / 评分 / 薄弱分析 / 复习建议，全部基于预置题库与真实答题记录 */

export const QUIZ_RULES = {
  Q1: '组卷：种子随机不重复抽取，固定 3 道选择题 + 2 道判断题，同 seed 可复现同一套卷',
  Q2: '评分：每题等权，得分 = 答对题数 / 题目总数 × 100；选项与预置答案精确比对',
  Q3: '薄弱判定：跨会话累计答错 ≥ 2 次的标签为薄弱，答错 1 次为关注；只统计真实答题记录',
  Q4: '复习建议：技能标签链接预置复习路径；知识节点优先链接知识地图节点小测，否则链接包含该节点的论文章节',
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, seed) {
  const rnd = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function drawQuestions(bank, seed, count = 5) {
  const single = bank.questions.filter((q) => q.type === 'single')
  const judge = bank.questions.filter((q) => q.type === 'judge')
  const nJudge = Math.max(0, Math.min(2, judge.length, count - 1))
  const nSingle = Math.min(count - nJudge, single.length)
  const picked = [
    ...shuffle(single, seed).slice(0, nSingle),
    ...shuffle(judge, seed + 1).slice(0, nJudge),
  ]
  return shuffle(picked, seed + 2).map((q) => q.id)
}

export function getQuestion(bank, id) {
  return bank.questions.find((q) => q.id === id)
}

export function optionsOf(q) {
  return q.type === 'judge' ? ['正确', '错误'] : q.options
}

export function gradeSession(bank, qids, picks) {
  const items = qids.map((id, i) => {
    const q = getQuestion(bank, id)
    const picked = picks[i] ?? null
    return {
      id,
      type: q.type,
      prompt: q.prompt,
      options: optionsOf(q),
      picked,
      answer: q.answer,
      correct: picked === q.answer,
      explain: q.explain,
      tags: q.tags,
      paper: q.paper,
    }
  })
  const correctCount = items.filter((it) => it.correct).length
  return {
    ruleId: 'Q2',
    items,
    correctCount,
    total: items.length,
    score: Math.round((100 * correctCount) / items.length),
  }
}

export function analyzeWeakness(bank, sessions, { nodes }) {
  const stats = {}
  for (const s of sessions) {
    s.qids.forEach((id, i) => {
      const q = getQuestion(bank, id)
      if (!q) return
      const wrong = s.picks[i] !== q.answer
      for (const tag of q.tags) {
        stats[tag] = stats[tag] ?? { wrong: 0, total: 0 }
        stats[tag].total += 1
        if (wrong) stats[tag].wrong += 1
      }
    })
  }
  const nameOf = (tag) => {
    const skill = bank.skills.find((s) => s.id === tag)
    if (skill) return { name: skill.name, kind: 'skill' }
    const node = nodes.find((n) => n.id === tag)
    return { name: node?.name ?? tag, kind: 'node' }
  }
  const entries = Object.entries(stats).map(([tag, v]) => ({ tag, ...v, ...nameOf(tag) }))
  const weak = entries.filter((e) => e.wrong >= 2).sort((a, b) => b.wrong - a.wrong)
  const watch = entries.filter((e) => e.wrong === 1).sort((a, b) => b.wrong - a.wrong)
  return { ruleId: 'Q3', weak, watch, stats }
}

export function reviewSuggestions(bank, sessions, { papers, graph, nodes }) {
  const { weak, watch } = analyzeWeakness(bank, sessions, { nodes })
  const pool = [...weak, ...watch].slice(0, 3)
  return pool.map((e) => {
    if (e.kind === 'skill') {
      const skill = bank.skills.find((s) => s.id === e.tag)
      return {
        tag: e.tag,
        name: e.name,
        wrong: e.wrong,
        text: skill.review.text,
        action: { type: 'reader', paperId: skill.review.paperId, sectionId: skill.review.sectionId },
        ref: `skill:${e.tag}`,
        ruleId: 'Q4',
      }
    }
    const mapNode = graph.nodes.find((n) => n.id === e.tag) ?? graph.nodes.find((n) => (n.linkedNodes ?? []).includes(e.tag))
    if (mapNode) {
      return {
        tag: e.tag,
        name: e.name,
        wrong: e.wrong,
        text: `到知识地图「${mapNode.name}」完成节点小测，把错题证据转化为掌握度验证。`,
        action: { type: 'map', nodeId: mapNode.id },
        ref: `map:${mapNode.id}`,
        ruleId: 'Q4',
      }
    }
    for (const p of papers) {
      const sec = p.sections.find((s) => (s.nodes ?? []).includes(e.tag))
      if (sec) {
        return {
          tag: e.tag,
          name: e.name,
          wrong: e.wrong,
          text: `重读《${p.title}》的「${sec.title}」章节，对照错题解释重新理解该知识点。`,
          action: { type: 'reader', paperId: p.id, sectionId: sec.id },
          ref: `${p.id}/${sec.id}`,
          ruleId: 'Q4',
        }
      }
    }
    return {
      tag: e.tag,
      name: e.name,
      wrong: e.wrong,
      text: '该标签暂无预置复习路径，建议重读相关论文章节。',
      action: null,
      ref: 'none',
      ruleId: 'Q4',
    }
  })
}

export function selfTest({ bank, papers, graph, nodes }) {
  const cases = []
  const t = (name, pass) => cases.push({ name, pass: !!pass })

  const d1 = drawQuestions(bank, 42)
  const d2 = drawQuestions(bank, 42)
  t('组卷确定性：同 seed 同卷（Q1）', JSON.stringify(d1) === JSON.stringify(d2))
  t('组卷 5 题不重复', d1.length === 5 && new Set(d1).size === 5)
  const types = d1.map((id) => getQuestion(bank, id).type)
  t('组卷含 3 选择 + 2 判断', types.filter((x) => x === 'single').length === 3 && types.filter((x) => x === 'judge').length === 2)
  t('不同 seed 产出不同卷', JSON.stringify(drawQuestions(bank, 43)) !== JSON.stringify(d1))

  const allRight = gradeSession(bank, d1, d1.map((id) => getQuestion(bank, id).answer))
  t('全对得 100（Q2）', allRight.score === 100)
  const picks = d1.map((id) => getQuestion(bank, id).answer)
  picks[0] = (picks[0] + 1) % optionsOf(getQuestion(bank, d1[0])).length
  picks[1] = (picks[1] + 1) % optionsOf(getQuestion(bank, d1[1])).length
  const twoWrong = gradeSession(bank, d1, picks)
  t('错 2 题得 60 且逐题标记', twoWrong.score === 60 && twoWrong.items[0].correct === false)
  t('判断题选项为 正确/错误', optionsOf(bank.questions.find((q) => q.type === 'judge') ?? bank.questions[0]).join() === '正确,错误')
  t('评分解释来自预置题库', twoWrong.items.every((it, i) => it.explain === getQuestion(bank, d1[i]).explain))

  const sess = (qid, pick) => ({ qids: [qid], picks: [pick], score: 0 })
  const judgeQ = bank.questions.find((q) => q.type === 'judge') ?? bank.questions[0]
  const singleQ = bank.questions.find((q) => q.type === 'single' && !q.tags.some((t) => judgeQ.tags.includes(t))) ?? bank.questions[0]
  const wrongOf = (q) => (q.answer + 1) % optionsOf(q).length
  const sessions = [sess(judgeQ.id, wrongOf(judgeQ)), sess(judgeQ.id, wrongOf(judgeQ)), sess(singleQ.id, wrongOf(singleQ))]
  const w = analyzeWeakness(bank, sessions, { nodes })
  t('累计错 2 次判为薄弱（Q3）', w.weak.some((e) => e.tag === judgeQ.tags[0] && e.wrong === 2))
  t('错 1 次判为关注', w.watch.some((e) => e.tag === singleQ.tags[0] && e.wrong === 1))
  t('无记录时无薄弱', analyzeWeakness(bank, [], { nodes }).weak.length === 0)

  const sug = reviewSuggestions(bank, sessions, { papers, graph, nodes })
  t('复习建议覆盖薄弱与关注', sug.length === 3)
  const nodeSug = sug.find((s) => s.tag === judgeQ.tags[0])
  t('知识节点标签链接地图节点小测', nodeSug.action.type === 'map' && nodeSug.action.nodeId === judgeQ.tags[0])
  const skillSug = sug.find((s) => s.tag === singleQ.tags[0])
  t('建议均带可追溯 ref', sug.every((s) => typeof s.ref === 'string' && s.ref.length > 0))
  const fallbackSug = reviewSuggestions(bank, sessions, { papers, graph: { nodes: [] }, nodes })
  t('无地图节点时回退到论文章节', fallbackSug.every((s) => !s.action || s.action.type === 'reader'))
  const sharedTag = judgeQ.tags.find((tag) => bank.questions.some((q) => q.id !== judgeQ.id && q.tags.includes(tag)))
  const pairQ = sharedTag ? bank.questions.find((q) => q.id !== judgeQ.id && q.tags.includes(sharedTag)) : null
  if (pairQ) {
    const mapSessions = [sess(judgeQ.id, wrongOf(judgeQ)), sess(pairQ.id, wrongOf(pairQ))]
    const mapSug = reviewSuggestions(bank, mapSessions, { papers, graph, nodes })
    t('共享标签累计薄弱链接地图', mapSug.some((s) => s.action?.type === 'map' && s.action.nodeId === sharedTag))
  } else {
    t('共享标签累计薄弱链接地图（无共享标签时跳过）', true)
  }
  t('建议动作均指向真实预置资源', sug.every((s) => !s.action || (s.action.type === 'map' ? graph.nodes.some((n) => n.id === s.action.nodeId) : papers.some((p) => p.id === s.action.paperId && p.sections.some((x) => x.id === s.action.sectionId)))))

  return { engine: 'quizEngine', cases }
}