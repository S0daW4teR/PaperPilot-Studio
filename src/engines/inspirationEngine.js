/* 科研灵感引擎：从预置研究案例模板的「场景 × 方法 × 指标」槽位中做确定性组合。
   规则 I1：场景 = scenarios[seed mod S]
   规则 I2：方法 = methods[(seed + weakIndex) mod M]，weakIndex 为方向焦点节点在薄弱列表中的序号（不在则 0）
   规则 I3：指标 = metrics[(seed + 1) mod K]
   规则 I4：焦点节点薄弱时追加缺口验证建议；每条输出携带槽位来源 id 与规则说明
   不含任何生成式内容：同一 (direction, seed, weak) 输入必得同一输出。 */

export const INSPIRATION_RULES = {
  I1: '场景槽 = scenarios[seed mod S]',
  I2: '方法槽 = methods[(seed + weakIndex) mod M]',
  I3: '指标槽 = metrics[(seed + 1) mod K]',
  I4: '焦点节点薄弱时追加缺口验证建议；输出携带来源槽位 id',
}

export function listDirections(templates) {
  return templates.directions.map((d) => ({ id: d.id, name: d.name, focusNode: d.focusNode }))
}

export function generateIdeas(templates, directionId, { weakNodeIds = [], seed = 0, count = 3 } = {}) {
  const dir = templates.directions.find((d) => d.id === directionId)
  if (!dir) return { ideas: [], rule: INSPIRATION_RULES, error: 'unknown_direction' }
  const weakIndex = Math.max(0, weakNodeIds.indexOf(dir.focusNode))
  const focusWeak = weakNodeIds.includes(dir.focusNode)

  const ideas = []
  for (let i = 0; i < count; i++) {
    const s = seed + i
    const scenario = dir.scenarios[s % dir.scenarios.length]
    const method = dir.methods[(s + weakIndex) % dir.methods.length]
    const metric = dir.metrics[(s + 1) % dir.metrics.length]
    ideas.push({
      id: `${dir.id}-seed${s}`,
      title: `${scenario.text}：${method.text}`,
      question: `在「${scenario.text}」中，${method.text}能否在可接受成本下改善${metric.text}？`,
      plan: [method.step, metric.measure, dir.validation],
      difficulty: method.difficulty,
      gapNote: focusWeak
        ? `缺口提示：你的「${dir.focusNode}」节点掌握度不足，建议先补齐该前置知识再开展本探索（规则 I4）。`
        : null,
      sources: {
        direction: dir.id,
        scenario: `${dir.id}/${scenario.id}`,
        method: `${dir.id}/${method.id}`,
        metric: `${dir.id}/${metric.id}`,
        seed: s,
      },
    })
  }
  return { ideas, rule: INSPIRATION_RULES, ruleText: templates.ruleText, direction: dir.id }
}

export function selfTest({ templates }) {
  const cases = []
  const t = (name, cond) => cases.push({ name, pass: !!cond })
  const dir = templates.directions[0]
  const a = generateIdeas(templates, dir.id, { seed: 0 })
  const b = generateIdeas(templates, dir.id, { seed: 0 })
  t('确定性：同输入同输出', JSON.stringify(a) === JSON.stringify(b))
  t('默认产出 3 条建议', a.ideas.length === 3)
  t('每条建议携带可追溯来源', a.ideas.every((i) => i.sources.scenario.startsWith(dir.id) && i.sources.method.startsWith(dir.id) && i.sources.metric.startsWith(dir.id)))
  t('场景槽符合 I1 取模规则', a.ideas[0].sources.scenario === `${dir.id}/${dir.scenarios[0].id}`)
  t('指标槽符合 I3 取模规则', a.ideas[0].sources.metric === `${dir.id}/${dir.metrics[1 % dir.metrics.length].id}`)
  const shifted = generateIdeas(templates, dir.id, { seed: 1 })
  t('seed 变化产生不同组合', shifted.ideas[0].title !== a.ideas[0].title)
  const weak = generateIdeas(templates, dir.id, { seed: 0, weakNodeIds: [dir.focusNode] })
  t('焦点薄弱时追加缺口提示（I4）', weak.ideas.every((i) => !!i.gapNote))
  const strong = generateIdeas(templates, dir.id, { seed: 0, weakNodeIds: ['other-node'] })
  t('焦点不薄弱时无缺口提示', strong.ideas.every((i) => i.gapNote === null))
  t('未知方向返回错误标记', generateIdeas(templates, 'nope').error === 'unknown_direction')
  t('难度来自方法槽预置值', a.ideas.every((i) => dir.methods.some((m) => m.difficulty === i.difficulty)))
  return { engine: 'inspirationEngine', cases }
}