/* 测试反馈引擎：把答题结果映射回知识节点，输出可追溯的补救建议。
   规则 F1：答错 → 匹配题目标注的 node 与 linked 知识节点，返回题库预置解析
   规则 F2：同一节点累计答错 ≥ 2 → 标记「优先复习」
   规则 F3：同一节点连续答对 ≥ 2 → 标记「可进入验证完成态」，供诊断引擎加权 */

export const FEEDBACK_RULES = {
  F1: '答错答案匹配题目标注 node 与 linked 节点，解析来自题库预置 explain',
  F2: '节点累计答错≥2 → 优先复习',
  F3: '节点连续答对≥2 → 验证充分提示',
}

export function analyzeAnswer(bank, questionId, chosenIndex) {
  const q = bank.questions.find((x) => x.id === questionId)
  if (!q) return { error: 'unknown_question', ruleId: 'F1' }
  const correct = chosenIndex === q.answer
  return {
    questionId,
    node: q.node,
    correct,
    chosenIndex,
    correctIndex: q.answer,
    matchedNodes: correct ? [] : [q.node],
    matchedKnowledge: correct ? [] : q.linked ?? [],
    explanation: q.explain,
    ruleId: 'F1',
    remediation: correct
      ? null
      : { node: q.node, action: 'review', text: `回到「${q.node}」节点：重读解释与关联论文章节，再重测本题。` },
  }
}

export function summarizeRecords(bank, answers) {
  const byNode = new Map()
  for (const a of answers) {
    if (!byNode.has(a.node)) byNode.set(a.node, { node: a.node, total: 0, wrong: 0, questionIds: [], streak: 0, maxStreak: 0 })
    const rec = byNode.get(a.node)
    rec.total += 1
    if (a.correct) {
      rec.streak += 1
      rec.maxStreak = Math.max(rec.maxStreak, rec.streak)
    } else {
      rec.streak = 0
      rec.wrong += 1
      if (!rec.questionIds.includes(a.qid)) rec.questionIds.push(a.qid)
    }
  }
  const nodes = [...byNode.values()].map((rec) => ({
    ...rec,
    accuracy: rec.total ? rec.wrong === 0 ? 1 : (rec.total - rec.wrong) / rec.total : 0,
    priorityReview: rec.wrong >= 2,
    verifiedStreak: rec.maxStreak >= 2,
    ruleIds: [rec.wrong >= 2 ? 'F2' : null, rec.maxStreak >= 2 ? 'F3' : null].filter(Boolean),
  }))
  return {
    nodes,
    weakNodes: nodes.filter((n) => n.wrong > 0).sort((a, b) => b.wrong - a.wrong),
    report: nodes.flatMap((n) =>
      n.questionIds.map((qid) => {
        const q = bank.questions.find((x) => x.id === qid)
        return { node: n.node, questionId: qid, prompt: q?.prompt, explanation: q?.explain, ruleId: 'F1' }
      }),
    ),
  }
}

export function selfTest({ bank }) {
  const cases = []
  const t = (name, cond) => cases.push({ name, pass: !!cond })
  const q = bank.questions[0]
  const wrong = analyzeAnswer(bank, q.id, (q.answer + 1) % q.options.length)
  t('答错匹配到标注节点', wrong.correct === false && wrong.matchedNodes.includes(q.node))
  t('答错返回预置解析', wrong.explanation === q.explain && wrong.ruleId === 'F1')
  t('答错给出补救建议', !!wrong.remediation && wrong.remediation.node === q.node)
  const right = analyzeAnswer(bank, q.id, q.answer)
  t('答对不产生薄弱匹配', right.correct === true && right.matchedNodes.length === 0)
  t('未知题目返回错误标记', analyzeAnswer(bank, 'nope', 0).error === 'unknown_question')

  const answers = [
    { qid: q.id, node: q.node, correct: false },
    { qid: q.id, node: q.node, correct: false },
    { qid: q.id, node: q.node, correct: true },
    { qid: q.id, node: q.node, correct: true },
  ]
  const sum = summarizeRecords(bank, answers)
  const rec = sum.nodes.find((n) => n.node === q.node)
  t('累计答错≥2 触发 F2', rec.priorityReview === true && rec.ruleIds.includes('F2'))
  t('连续答对≥2 触发 F3', rec.verifiedStreak === true && rec.ruleIds.includes('F3'))
  t('错题报告可追溯到题目', sum.report.every((r) => r.prompt && r.explanation))
  return { engine: 'feedbackEngine', cases }
}