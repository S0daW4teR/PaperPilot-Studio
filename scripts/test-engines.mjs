/* 引擎测试：node scripts/test-engines.mjs（或 npm run test:engines）
   运行六个引擎的 selfTest 单元断言 + 基于真实预置数据的集成断言。 */
import { diagnose, selfTest as testDiagnosis } from '../src/engines/diagnosisEngine.js'
import { recommendPath, selfTest as testPath } from '../src/engines/pathEngine.js'
import { analyzeAnswer, summarizeRecords, selfTest as testFeedback } from '../src/engines/feedbackEngine.js'
import { generateIdeas, selfTest as testInspiration } from '../src/engines/inspirationEngine.js'
import { checkOrder, checkMatch, checkDesign, shuffled, selfTest as testLab } from '../src/engines/labEngine.js'
import { drawQuestions, gradeSession, analyzeWeakness, reviewSuggestions, getQuestion, selfTest as testQuiz } from '../src/engines/quizEngine.js'
import { selfTest as testStudyTime, buildWeekStats, splitByDay } from '../src/engines/studyTimeEngine.js'
import { createSessionRecord } from '../src/lib/studySessionStorage.js'
import templates from '../src/data/ideaTemplates.json' with { type: 'json' }
import rawPaper from '../src/data/lorawan/paper.json' with { type: 'json' }
import rawKnowledge from '../src/data/lorawan/knowledge.json' with { type: 'json' }
import rawRelations from '../src/data/lorawan/knowledgeRelations.json' with { type: 'json' }
import rawGlossary from '../src/data/lorawan/glossary.json' with { type: 'json' }
import rawQuestions from '../src/data/lorawan/questions.json' with { type: 'json' }
import rawMethodLab from '../src/data/lorawan/methodLab.json' with { type: 'json' }
import { buildAll } from '../src/lib/lorawanAdapter.js'
import { testStudyFeatures } from './test-study-features.mjs'

const L = buildAll({
  paper: rawPaper,
  knowledge: rawKnowledge,
  relations: rawRelations,
  glossary: rawGlossary,
  questions: rawQuestions,
  methodLab: rawMethodLab,
})
const graph = L.graph
const bank = L.mapBank
const quizBank = L.quizBank
const labData = L.lab
const knowledge = { nodes: L.nodes }
const papersData = { papers: [L.paper] }

const data = { graph, bank, templates }
const labCtx = { exercises: labData.exercises }
const quizCtx = { bank: quizBank, papers: papersData.papers, graph, nodes: knowledge.nodes }
let failed = 0

function report(result) {
  const pass = result.cases.filter((c) => c.pass).length
  console.log(`\n[${result.engine}] ${pass}/${result.cases.length}`)
  for (const c of result.cases) {
    if (!c.pass) failed++
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`)
  }
}

function check(name, cond) {
  if (!cond) failed++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
}

console.log('== 单元断言（selfTest） ==')
report(testDiagnosis(data))
report(testPath(data))
report(testFeedback(data))
report(testInspiration(data))
report(testLab(labCtx))
report(testQuiz(quizCtx))
report(testStudyTime())

console.log('\n== 集成断言（用户预置 LoRaWAN 数据） ==')
const allSections = papersData.papers.flatMap((p) => p.sections.map((s) => s.id))
const allLinked = [...new Set(graph.nodes.flatMap((n) => n.linkedNodes))]
const allCorrect = bank.questions.map((q) => ({ qid: q.id, node: q.node, correct: true }))
const full = diagnose(graph, { masteredNodeIds: [...allLinked, ...allSections], quizAnswers: allCorrect })
check('全部证据齐备时 10 节点均 mastered', full.summary.masteredCount === graph.nodes.length)
const fullPath = recommendPath(graph, full)
check('全部掌握后路径队列为空', fullPath.order.length === 0)

const readerOnly = diagnose(graph, { masteredNodeIds: allSections, quizAnswers: [] })
check('仅论文证据时有小测题节点为 learning(70)、无小测题节点按 D5 掌握', graph.nodes.every((nd) => {
  const n = readerOnly.nodes[nd.id]
  return nd.hasQuiz === false ? n.state === 'mastered' : n.score === 70 && n.state === 'learning'
}))
const rp = recommendPath(graph, readerOnly)
check('仅论文证据时建议动作均为做小测', rp.order.every((i) => i.action === 'quiz'))
check('推荐顺序满足依赖约束', rp.topoOrder.every((id) => {
  const n = graph.nodes.find((x) => x.id === id)
  return n.deps.every((d) => rp.topoOrder.indexOf(d) < rp.topoOrder.indexOf(id))
}))

const wrongQ = bank.questions.find((q) => q.id === 'q_single_03')
const wrong = analyzeAnswer(bank, wrongQ.id, (wrongQ.answer + 1) % wrongQ.options.length)
check('q_single_03 答错匹配 kn_end_device_classes', wrong.matchedNodes.includes('kn_end_device_classes'))
const sum = summarizeRecords(bank, [
  { qid: wrongQ.id, node: wrongQ.node, correct: false },
  { qid: wrongQ.id, node: wrongQ.node, correct: false },
])
check('累计答错 2 触发优先复习', sum.nodes.find((n) => n.node === wrongQ.node).priorityReview)

const ideaA = generateIdeas(templates, 'd-lpwan', { seed: 3, weakNodeIds: ['kn_end_device_classes'] })
const ideaB = generateIdeas(templates, 'd-lpwan', { seed: 3, weakNodeIds: ['kn_end_device_classes'] })
check('灵感引擎确定性', JSON.stringify(ideaA) === JSON.stringify(ideaB))
check('灵感来源槽位均存在于模板', ideaA.ideas.every((i) => {
  const dir = templates.directions.find((d) => d.id === i.sources.direction)
  const [, sid] = i.sources.scenario.split('/')
  const [, mid] = i.sources.method.split('/')
  const [, kid] = i.sources.metric.split('/')
  return dir.scenarios.some((s) => s.id === sid) && dir.methods.some((m) => m.id === mid) && dir.metrics.some((k) => k.id === kid)
}))
check('薄弱焦点触发缺口提示', ideaA.ideas.every((i) => i.gapNote))

const flow = labData.exercises.find((e) => e.id === 'lab_order_01')
const match = labData.exercises.find((e) => e.id === 'lab_match_01')
const design = labData.exercises.find((e) => e.id === 'lab_judge_01')
const shuffledOrder = shuffled(flow.steps.map((s) => s.id), 1)
check('实验室排序洗牌后判分低于 100', checkOrder(flow, shuffledOrder).score < 100)
check('实验室排序恢复正确顺序得 100', checkOrder(flow, flow.steps.map((s) => s.id)).score === 100)
check('实验室匹配全对得 100', checkMatch(match, Object.fromEntries(match.needs.map((n) => [n.id, n.answer]))).score === 100)
check('实验室设计判断全对得 100', checkDesign(design, design.items.map((i) => i.answer)).score === 100)
check('实验室判分标签均存在于知识库', checkDesign(design, design.items.map((i) => i.answer)).items.every((it) => it.tags.every((t) => knowledge.nodes.some((n) => n.id === t))))

let drawOk = true
for (let seed = 1; seed <= 20; seed++) {
  const ids = drawQuestions(quizBank, seed)
  const types = ids.map((id) => getQuestion(quizBank, id).type)
  if (ids.length !== 5 || new Set(ids).size !== 5 || types.filter((t) => t === 'single').length !== 3 || types.filter((t) => t === 'judge').length !== 2) drawOk = false
}
check('20 个 seed 组卷均满足 3 选择 + 2 判断且不重复', drawOk)
const drawn = drawQuestions(quizBank, 9)
const realPicks = drawn.map((id, i) => (i < 3 ? getQuestion(quizBank, id).answer : (getQuestion(quizBank, id).answer + 1) % (getQuestion(quizBank, id).type === 'judge' ? 2 : 4)))
const graded = gradeSession(quizBank, drawn, realPicks)
check('真实选择序列评分 = 60', graded.score === 60)
const fakeSessions = [
  { qids: drawn, picks: realPicks, score: graded.score },
  { qids: drawn, picks: realPicks, score: graded.score },
]
const weak = analyzeWeakness(quizBank, fakeSessions, { nodes: knowledge.nodes })
check('重复错同标签累计为薄弱', weak.weak.every((w) => w.wrong >= 2) && weak.weak.length > 0)
const suggestions = reviewSuggestions(quizBank, fakeSessions, quizCtx)
check('复习建议动作全部可解析到预置资源', suggestions.length > 0 && suggestions.every((s) => !s.action || (s.action.type === 'map' ? graph.nodes.some((n) => n.id === s.action.nodeId) : papersData.papers.some((p) => p.id === s.action.paperId && p.sections.some((x) => x.id === s.action.sectionId)))))

const nowMs = Date.now()
const rec = createSessionRecord({ startMs: nowMs - 600000, endMs: nowMs, durationSeconds: 600, source: 'paper_reader', paperId: L.paper.id })
check('区间记录含 ISO 时间与真实秒差', rec.durationSeconds === 600 && !Number.isNaN(new Date(rec.startTime).getTime()) && rec.date.length === 10)
const weekNow = buildWeekStats([rec], nowMs)
check('本周统计计入当前区间', weekNow.totalSeconds === 600 && weekNow.studyDays === 1)
check('跨日切分秒数守恒', splitByDay(nowMs - 86400000, nowMs).reduce((s, p) => s + p.seconds, 0) === 86400)

await testStudyFeatures()

console.log(failed ? `\nFAILED: ${failed}` : '\nALL PASS')
process.exit(failed ? 1 : 0)