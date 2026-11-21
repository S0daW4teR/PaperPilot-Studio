/* 知识诊断引擎：把「论文理解」与「小测记录」两类证据按固定权重换算为节点掌握度。
   规则 D1：readerCoverage = 已掌握关联知识节点 / 关联节点总数
   规则 D2：quizAccuracy = 该节点小测答对数 / 答题数（无记录记 0）
   规则 D3：score = round(100 × (0.7 × readerCoverage + 0.3 × quizAccuracy))
   规则 D4：score ≥ 80 → mastered；≥ 40 → learning；其余前置全 mastered → available，否则 locked
   规则 D5：预置题库中无小测题的节点（hasQuiz=false），以论文理解为唯一证据：score = round(100 × readerCoverage) */

export const DIAGNOSIS_RULES = {
  D1: 'readerCoverage = 已掌握关联知识节点数 / 关联节点总数',
  D2: 'quizAccuracy = 节点小测答对数 / 答题数，无记录记 0',
  D3: 'score = round(100 × (READER_WEIGHT × readerCoverage + QUIZ_WEIGHT × quizAccuracy))',
  D4: 'score≥80 mastered；score≥40 learning；其余前置全 mastered 为 available，否则 locked',
  D5: '节点无预置小测题时，score = round(100 × readerCoverage)，论文理解为唯一证据',
}

export function diagnose(graph, evidence = {}) {
  const { masteredNodeIds = [], quizAnswers = [] } = evidence
  const masteredSet = new Set(masteredNodeIds)
  const w = graph.weights
  const nodes = {}

  for (const node of graph.nodes) {
    const linked = node.linkedNodes ?? []
    const readerCoverage = linked.length
      ? linked.filter((id) => masteredSet.has(id)).length / linked.length
      : 0
    const records = quizAnswers.filter((a) => a.node === node.id)
    const quizCount = records.length
    const quizAccuracy = quizCount ? records.filter((a) => a.correct).length / quizCount : 0
    const noQuiz = node.hasQuiz === false
    const score = noQuiz
      ? Math.round(100 * readerCoverage)
      : Math.round(100 * (w.reader * readerCoverage + w.quiz * quizAccuracy))
    nodes[node.id] = { readerCoverage, quizAccuracy, quizCount, noQuiz, score, state: 'locked', prereqsMastered: false, reasons: [] }
  }

  for (const node of graph.nodes) {
    const n = nodes[node.id]
    n.prereqsMastered = (node.deps ?? []).every((d) => nodes[d]?.state === 'mastered')
    if (n.score >= w.masteredThreshold) n.state = 'mastered'
    else if (n.score >= w.learningThreshold) n.state = 'learning'
    else n.state = n.prereqsMastered ? 'available' : 'locked'

    if (n.readerCoverage > 0) n.reasons.push(`论文证据：关联节点已掌握 ${Math.round(n.readerCoverage * 100)}%（规则 D1）`)
    if (n.noQuiz) n.reasons.push('该节点无预置小测题，论文理解为唯一证据（规则 D5）')
    else if (n.quizCount > 0) n.reasons.push(`小测证据：${n.quizCount} 题答对 ${Math.round(n.quizAccuracy * 100)}%（规则 D2）`)
    else n.reasons.push('尚无小测记录，验证部分计 0（规则 D2）')
    n.reasons.push(`综合 ${n.score} 分 → ${n.state}（规则 D3/D4）`)
  }

  const list = Object.values(nodes)
  return {
    nodes,
    summary: {
      masteredCount: list.filter((n) => n.state === 'mastered').length,
      learningCount: list.filter((n) => n.state === 'learning').length,
      lockedCount: list.filter((n) => n.state === 'locked').length,
      avgScore: Math.round(list.reduce((s, n) => s + n.score, 0) / list.length),
      weakIds: graph.nodes.filter((nd) => nodes[nd.id].score < w.masteredThreshold).map((nd) => nd.id),
    },
  }
}

export function selfTest({ graph }) {
  const cases = []
  const t = (name, cond) => cases.push({ name, pass: !!cond })
  const empty = diagnose(graph, {})
  t('无证据时所有节点分数为 0', Object.values(empty.nodes).every((n) => n.score === 0))
  t('无证据且无前置的节点为 available', empty.nodes[graph.nodes.find((n) => !n.deps.length).id].state === 'available')
  t('无证据且有前置的节点为 locked', empty.nodes[graph.nodes.find((n) => n.deps.length).id].state === 'locked')

  const first = graph.nodes.find((n) => n.hasQuiz !== false) ?? graph.nodes[0]
  const full = diagnose(graph, { masteredNodeIds: first.linkedNodes, quizAnswers: [] })
  t('仅论文证据得分 = 70（learning）', full.nodes[first.id].score === 70 && full.nodes[first.id].state === 'learning')

  const verified = diagnose(graph, {
    masteredNodeIds: first.linkedNodes,
    quizAnswers: [{ node: first.id, correct: true }, { node: first.id, correct: true }],
  })
  t('论文+全对小测得分 = 100（mastered）', verified.nodes[first.id].score === 100 && verified.nodes[first.id].state === 'mastered')

  const half = diagnose(graph, {
    masteredNodeIds: first.linkedNodes,
    quizAnswers: [{ node: first.id, correct: true }, { node: first.id, correct: false }],
  })
  t('小测对半时得分 = 85（mastered）', half.nodes[first.id].score === 85)

  const wrongOnly = diagnose(graph, { masteredNodeIds: [], quizAnswers: [{ node: first.id, correct: false }] })
  t('仅答错记录得分 0 且状态不升级', wrongOnly.nodes[first.id].score === 0)
  t('summary 统计自洽', empty.summary.masteredCount + empty.summary.learningCount + empty.summary.lockedCount <= graph.nodes.length)
  const noQuizNode = graph.nodes.find((n) => n.hasQuiz === false)
  if (noQuizNode) {
    const d5 = diagnose(graph, { masteredNodeIds: noQuizNode.linkedNodes, quizAnswers: [] })
    t('无小测题节点按 D5 以论文理解判掌握', d5.nodes[noQuizNode.id].score === 100 && d5.nodes[noQuizNode.id].state === 'mastered')
  } else {
    t('无小测题节点按 D5 以论文理解判掌握（本图无此类节点，跳过）', true)
  }
  return { engine: 'diagnosisEngine', cases }
}