/* 校验用户预置 LoRaWAN 数据的 ID / 关联 / 前置关系完整性：
   node scripts/validate-lorawan-data.mjs */
import { buildSectionKnowledge, buildGraph } from '../src/lib/lorawanAdapter.js'
import paper from '../src/data/lorawan/paper.json' with { type: 'json' }
import knowledge from '../src/data/lorawan/knowledge.json' with { type: 'json' }
import relations from '../src/data/lorawan/knowledgeRelations.json' with { type: 'json' }
import glossary from '../src/data/lorawan/glossary.json' with { type: 'json' }
import questions from '../src/data/lorawan/questions.json' with { type: 'json' }
import methodLab from '../src/data/lorawan/methodLab.json' with { type: 'json' }

let failed = 0
const check = (name, cond, extra = '') => {
  if (!cond) failed++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' · ' + extra : ''}`)
}
const ids = (arr) => arr.map((x) => x.id)
const unique = (arr) => new Set(arr).size === arr.length

console.log('== 基础完整性 ==')
check('六份文件 paperId 一致', [knowledge, relations, glossary, questions, methodLab].every((f) => f.paperId === paper.id))
const knIds = ids(knowledge.knowledgePoints)
check('知识点 ID 唯一（10）', knIds.length === 10 && unique(knIds))
check('关系 ID 唯一', unique(ids(relations.relations)))
check('术语 ID 唯一', unique(ids(glossary.terms)))
check('题目 ID 唯一', unique(ids(questions.questions)))
check('练习 ID 唯一', unique(ids(methodLab.activities)))
check('论文章节 ID 唯一', unique(ids(paper.structure)))

console.log('== 前置知识关系 ==')
check('prerequisites 均指向存在知识点', knowledge.knowledgePoints.every((k) => (k.prerequisites ?? []).every((p) => knIds.includes(p))))
check('无自前置', knowledge.knowledgePoints.every((k) => !(k.prerequisites ?? []).includes(k.id)))
const preEdges = relations.relations.filter((r) => r.relationship === 'prerequisite')
const declared = knowledge.knowledgePoints.flatMap((k) => (k.prerequisites ?? []).map((p) => `${p}->${k.id}`))
const edgeSet = preEdges.map((r) => `${r.source}->${r.target}`)
check('prerequisite 边与 prerequisites 声明完全一致', declared.length === edgeSet.length && declared.every((d) => edgeSet.includes(d)), `${declared.length} 条`)
check('关系 source/target 均存在', relations.relations.every((r) => knIds.includes(r.source) && knIds.includes(r.target)))
const otherTypes = [...new Set(relations.relations.filter((r) => r.relationship !== 'prerequisite').map((r) => r.relationship))]
console.log('  INFO  其他关系类型（教学关联，非依赖）: ' + otherTypes.join(', '))
const graph = buildGraph(knowledge, relations, paper, buildSectionKnowledge(paper, knowledge))
const order = []
const seen = new Set()
const visit = (id) => {
  if (seen.has(id)) return
  seen.add(id)
  const n = graph.nodes.find((x) => x.id === id)
  n.deps.forEach(visit)
  order.push(id)
}
graph.nodes.forEach((n) => visit(n.id))
check('依赖图无环（拓扑序覆盖全部节点）', order.length === graph.nodes.length)

console.log('== 题目关联 ==')
check('题目 relatedKnowledge 均存在且非空', questions.questions.every((q) => q.relatedKnowledge.length > 0 && q.relatedKnowledge.every((k) => knIds.includes(k))))
check('选择题选项 ID 唯一且答案字母对应选项', questions.questions.filter((q) => q.type === 'single_choice').every((q) => unique(ids(q.options)) && q.options.some((o) => o.id.endsWith('_' + q.answer))))
check('判断题答案为 true/false 且选项为 正确/错误', questions.questions.filter((q) => q.type === 'true_false').every((q) => ['true', 'false'].includes(q.answer) && q.options[0].text === '正确' && q.options[1].text === '错误'))
check('每题均有解释', questions.questions.every((q) => (q.explanation ?? '').length > 10))
const noQuiz = knIds.filter((k) => !questions.questions.some((q) => q.relatedKnowledge.includes(k)))
console.log('  INFO  暂无小测题的知识点: ' + (noQuiz.join(', ') || '无'))

console.log('== 术语关联 ==')
check('术语 relatedKnowledge 均存在', glossary.terms.every((t) => t.relatedKnowledge.every((k) => knIds.includes(k))))
check('术语含定义与通俗解释', glossary.terms.every((t) => t.definition && t.simpleExplanation))

console.log('== 方法练习关联 ==')
for (const a of methodLab.activities) {
  check(`练习 ${a.id} 知识标签存在`, a.relatedKnowledge.every((k) => knIds.includes(k)))
  if (a.activityType === 'matching') {
    check(`练习 ${a.id} 匹配答案覆盖全部 item 且指向 option`, Object.keys(a.correctAnswer).length === a.items.length && a.items.every((it) => a.options.some((o) => o.id === a.correctAnswer[it.id])))
  }
  if (a.activityType === 'ordering') {
    check(`练习 ${a.id} 正确顺序为 items 的排列`, a.correctAnswer.length === a.items.length && a.correctAnswer.every((id) => a.items.some((it) => it.id === id)) && unique(a.correctAnswer))
  }
  if (a.activityType === 'scenario_judgment') {
    check(`练习 ${a.id} 判断答案指向 option`, a.options.some((o) => o.id === a.correctAnswer))
  }
}

console.log('== 章节 ↔ 知识点 source 匹配 ==')
const map = buildSectionKnowledge(paper, knowledge)
const covered = new Set(Object.values(map).flat())
check('每个知识点至少关联一个章节', knIds.every((k) => covered.has(k)), `覆盖 ${covered.size}/${knIds.length}`)
for (const [sec, list] of Object.entries(map)) console.log(`  INFO  ${sec} → ${list.join(', ') || '无'}`)
check('每个章节至少关联一个知识点', Object.values(map).every((l) => l.length > 0))

console.log(failed ? `\nFAILED: ${failed}` : '\nALL PASS')
process.exit(failed ? 1 : 0)