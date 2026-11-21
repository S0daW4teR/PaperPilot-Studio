/* 方法实验室判分引擎：纯函数，输入预置练习与用户操作，输出带规则编号的判分结果 */

export const LAB_RULES = {
  L1: '排序判分：用户顺序与预置正确顺序逐位置比对，得分 = 位置正确数 / 步骤总数 × 100',
  L2: '匹配判分：每条需求所选技术与预置答案精确比对，得分 = 答对需求数 / 需求总数 × 100',
  L3: '设计判断判分：每个子题所选选项与预置答案精确比对，得分 = 答对子题数 / 子题总数 × 100',
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled(ids, seed) {
  const rnd = mulberry32(seed)
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function checkOrder(exercise, userIds) {
  const items = exercise.steps.map((s, i) => ({
    id: s.id,
    text: s.text,
    correct: userIds[i] === s.id,
    expectedIndex: i,
    actualIndex: userIds.indexOf(s.id),
    explain: s.explain,
    tags: s.tags,
  }))
  const correctCount = items.filter((it) => it.correct).length
  return {
    ruleId: 'L1',
    items,
    correctCount,
    total: items.length,
    score: Math.round((100 * correctCount) / items.length),
  }
}

export function checkMatch(exercise, picks) {
  const items = exercise.needs.map((n) => {
    const picked = picks[n.id] ?? null
    const tech = exercise.techs.find((t) => t.id === n.answer)
    return {
      id: n.id,
      text: n.text,
      picked,
      pickedName: exercise.techs.find((t) => t.id === picked)?.name ?? null,
      answer: n.answer,
      answerName: tech?.name ?? '',
      correct: picked === n.answer,
      explain: n.explain,
      tags: n.tags,
    }
  })
  const correctCount = items.filter((it) => it.correct).length
  return {
    ruleId: 'L2',
    items,
    correctCount,
    total: items.length,
    score: Math.round((100 * correctCount) / items.length),
  }
}

export function checkDesign(exercise, picks) {
  const items = exercise.items.map((it, i) => {
    const picked = picks[i] ?? null
    return {
      id: it.id,
      prompt: it.prompt,
      options: it.options,
      picked,
      answer: it.answer,
      correct: picked === it.answer,
      explain: it.explain,
      tags: it.tags,
    }
  })
  const correctCount = items.filter((it) => it.correct).length
  return {
    ruleId: 'L3',
    items,
    correctCount,
    total: items.length,
    score: Math.round((100 * correctCount) / items.length),
  }
}

export function selfTest({ exercises }) {
  const cases = []
  const t = (name, pass) => cases.push({ name, pass: !!pass })
  const flow = exercises.find((e) => e.kind === 'order')
  const match = exercises.find((e) => e.kind === 'match')
  const design = exercises.find((e) => e.kind === 'design')
  const ids = flow.steps.map((s) => s.id)

  const a = shuffled(ids, 7)
  const b = shuffled(ids, 7)
  t('洗牌确定性：同 seed 同结果', JSON.stringify(a) === JSON.stringify(b))
  t('洗牌是原序列的排列', [...a].sort().join() === [...ids].sort().join())
  t('seed 7 的洗牌不等于原序', a.join() !== ids.join())

  const perfect = checkOrder(flow, ids)
  t('全对排序得 100（L1）', perfect.score === 100 && perfect.correctCount === ids.length)
  const swapped = [ids[1], ids[0], ...ids.slice(2)]
  const sw = checkOrder(flow, swapped)
  const swapExpect = Math.round((100 * (ids.length - 2)) / ids.length)
  t('交换前两步仅两步错', sw.score === swapExpect && sw.correctCount === ids.length - 2)
  t('排序错题携带预置解释', sw.items[0].explain === flow.steps[0].explain && sw.items[0].correct === false)

  const goodPicks = Object.fromEntries(match.needs.map((n) => [n.id, n.answer]))
  const gm = checkMatch(match, goodPicks)
  t('全对匹配得 100（L2）', gm.score === 100)
  const wrongTech = match.techs.find((t) => t.id !== match.needs[0].answer)
  const badPicks = { ...goodPicks, [match.needs[0].id]: wrongTech.id }
  const bm = checkMatch(match, badPicks)
  const expectName = match.techs.find((t) => t.id === match.needs[0].answer).name
  t('错配需求判错并给出正确答案名', bm.items[0].correct === false && bm.items[0].answerName === expectName)
  t('未作答需求判错且 picked 为 null', checkMatch(match, {}).items.every((it) => !it.correct && it.picked === null))

  const dPicks = design.items.map((it) => it.answer)
  t('全对设计判断得 100（L3）', checkDesign(design, dPicks).score === 100)
  const dBad = [...dPicks]
  dBad[0] = (dPicks[0] + 1) % design.items[0].options.length
  const db = checkDesign(design, dBad)
  const dExpect = Math.round((100 * (design.items.length - 1)) / design.items.length)
  t('错一题设计判断按比例扣分', db.score === dExpect && db.items[0].correct === false)
  t('所有判分解释可追溯到预置文本', db.items.every((it, i) => it.explain === design.items[i].explain))

  return { engine: 'labEngine', cases }
}