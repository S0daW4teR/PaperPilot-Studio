/* 学习路径引擎：在知识依赖图上做拓扑排序，结合诊断结果给出可执行的学习顺序。
   规则 P1：顺序必须满足依赖（前置排在前面，Kahn 拓扑排序）
   规则 P2：已 mastered 的节点不再进入推荐队列
   规则 P3：next = 队列中第一个「前置全部 mastered」的节点（当前真正可动手的节点）
   规则 P4：每个节点附理由：未开始→先读论文章节；已理解未验证→做小测；小测正确率低→先复习错题 */

export const PATH_RULES = {
  P1: '推荐顺序满足依赖约束（拓扑排序）',
  P2: '已 mastered 节点不进入推荐队列',
  P3: 'next 为队列中首个前置全部 mastered 的节点',
  P4: '理由按证据状态生成：未开始 / 未验证 / 正确率低',
}

function topoOrder(graph) {
  const indeg = new Map(graph.nodes.map((n) => [n.id, (n.deps ?? []).length]))
  const queue = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const n of graph.nodes) {
      if ((n.deps ?? []).includes(id)) {
        indeg.set(n.id, indeg.get(n.id) - 1)
        if (indeg.get(n.id) === 0) queue.push(n.id)
      }
    }
  }
  return order.length === graph.nodes.length ? order : graph.nodes.map((n) => n.id)
}

export function recommendPath(graph, diagnosis) {
  const order = topoOrder(graph)
  const threshold = graph.weights.masteredThreshold
  const queue = order.filter((id) => diagnosis.nodes[id].score < threshold)

  const items = queue.map((id) => {
    const node = graph.nodes.find((n) => n.id === id)
    const d = diagnosis.nodes[id]
    let reason, action
    if (d.readerCoverage === 0) {
      reason = '尚未开始：先阅读关联论文章节建立理解（规则 P4）'
      action = 'read'
    } else if (d.quizCount === 0) {
      reason = `论文已理解 ${Math.round(d.readerCoverage * 100)}% 但未验证：完成节点小测以确认掌握（规则 P4）`
      action = 'quiz'
    } else if (d.quizAccuracy < 0.8) {
      reason = `小测正确率 ${Math.round(d.quizAccuracy * 100)}%：先复习错题再重测（规则 P4）`
      action = 'review'
    } else {
      reason = `综合 ${d.score} 分未达 ${threshold}：补齐剩余证据（规则 P4）`
      action = 'quiz'
    }
    return { id, name: node.name, reason, action, score: d.score, state: d.state }
  })

  const next = items.find((it) => (graph.nodes.find((n) => n.id === it.id).deps ?? []).every((dep) => diagnosis.nodes[dep].state === 'mastered')) ?? null

  return { order: items, next, rule: PATH_RULES, topoOrder: order }
}

export function selfTest({ graph }) {
  const cases = []
  const t = (name, cond) => cases.push({ name, pass: !!cond })
  const zero = diagnoseZero(graph)
  const path = recommendPath(graph, zero)
  t('拓扑序满足依赖', path.topoOrder.every((id) => {
    const node = graph.nodes.find((n) => n.id === id)
    return (node.deps ?? []).every((d) => path.topoOrder.indexOf(d) < path.topoOrder.indexOf(id))
  }))
  t('无证据时 next 为无前置节点', path.next && !(graph.nodes.find((n) => n.id === path.next.id).deps ?? []).length)
  t('无证据时理由均为「尚未开始」', path.order.every((it) => it.action === 'read'))

  const allMastered = { nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, { score: 100, state: 'mastered', readerCoverage: 1, quizCount: 2, quizAccuracy: 1 }])) }
  const done = recommendPath(graph, allMastered)
  t('全部掌握后推荐队列为空', done.order.length === 0 && done.next === null)

  const partial = { nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, { score: 70, state: 'learning', readerCoverage: 1, quizCount: 0, quizAccuracy: 0 }])) }
  const p2 = recommendPath(graph, partial)
  t('已理解未验证时理由为做小测', p2.order.every((it) => it.action === 'quiz'))
  t('next 的前置必须 mastered（learning 前置不算）', p2.next === null || (graph.nodes.find((n) => n.id === p2.next.id).deps ?? []).every((d) => partial.nodes[d].state === 'mastered'))
  return { engine: 'pathEngine', cases }
}

function diagnoseZero(graph) {
  return { nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, { score: 0, state: n.deps.length ? 'locked' : 'available', readerCoverage: 0, quizCount: 0, quizAccuracy: 0 }])) }
}