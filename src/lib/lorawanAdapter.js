/* LoRaWAN 预置数据适配器：把用户提供的六份 JSON 归一化为现有页面/引擎所需的形状。
   纯函数、不修改原始数据；章节↔知识点关联依据双方 source 字段的编号匹配（见 matchSectionRefs）。 */

const NUM = /^(\d+(?:\.\d+)*)/

function numKey(ref) {
  const m = NUM.exec(ref.trim())
  return m ? m[1].split('.').map(Number) : null
}

function isPrefix(a, b) {
  return a.length <= b.length && a.every((v, i) => v === b[i])
}

/* 展开 "2.1—2.3" / "3.1.1—3.1.4" / "Figures 1—5" / "Tables 6—8" 这类范围写法 */
function expandRef(ref) {
  const range = /^(.*?)(\d+)\s*[—–-]\s*(\d+)$/.exec(ref.trim())
  if (!range) return [ref.trim()]
  const [, head, a, b] = range
  const lo = Number(a)
  const hi = Number(b)
  if (hi < lo || hi - lo > 40) return [ref.trim()]
  const out = []
  for (let i = lo; i <= hi; i++) out.push(`${head}${i}`.trim())
  return out
}

function refMatches(a, b) {
  for (const ra of expandRef(a)) {
    for (const rb of expandRef(b)) {
      if (ra === rb) return true
      const na = numKey(ra)
      const nb = numKey(rb)
      if (na && nb && (isPrefix(na, nb) || isPrefix(nb, na))) return true
    }
  }
  return false
}

export function matchSectionRefs(knSource, secSource) {
  const ks = knSource?.sections ?? []
  const ss = secSource?.sections ?? []
  return ks.some((k) => ss.some((s) => refMatches(k, s)))
}

export function buildSectionKnowledge(paper, knowledge) {
  const map = {}
  for (const sec of paper.structure) {
    map[sec.id] = knowledge.knowledgePoints
      .filter((kn) => matchSectionRefs(kn.source, sec.source))
      .map((kn) => kn.id)
  }
  return map
}

export function normalizePaper(paper, sectionKnowledge) {
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    publication: paper.publication,
    doi: paper.doi,
    url: paper.url,
    license: paper.license,
    researchField: paper.researchField,
    paperType: paper.paperType,
    language: paper.language,
    audience: paper.audience,
    sourcePolicy: paper.sourcePolicy,
    reviewMethod: paper.reviewMethod,
    visualEvidence: paper.visualEvidence,
    qualityNotes: paper.qualityNotes,
    field: paper.researchField[0] ?? '物联网',
    level: '综述',
    abstract: paper.structure[0]?.studentExplanation ?? '',
    sections: paper.structure.map((s) => ({
      id: s.id,
      title: s.name,
      subtitle: (s.source?.sections ?? []).join(' · '),
      professionalSummary: s.professionalSummary,
      studentExplanation: s.studentExplanation,
      source: s.source,
      contentOrigin: s.contentOrigin,
      nodes: sectionKnowledge[s.id] ?? [],
    })),
  }
}

export function normalizeNodes(knowledge) {
  return knowledge.knowledgePoints.map((kn) => ({
    id: kn.id,
    name: kn.name,
    en: '',
    domain: kn.category,
    category: kn.category,
    difficulty: kn.difficulty,
    prerequisites: kn.prerequisites ?? [],
    explanation: kn.explanation,
    learningObjectives: kn.learningObjectives ?? [],
    example: kn.example,
    source: kn.source,
    def: kn.explanation,
    tip: kn.example,
  }))
}

/* 图谱布局：按前置依赖最长路径分层（列），层内居中排布（行） */
export function buildGraph(knowledge, relations, paper, sectionKnowledge) {
  const nodes = normalizeNodes(knowledge)
  const depth = {}
  const calc = (id) => {
    if (depth[id] !== undefined) return depth[id]
    const kn = knowledge.knowledgePoints.find((n) => n.id === id)
    const pres = kn.prerequisites ?? []
    depth[id] = pres.length ? Math.max(...pres.map(calc)) + 1 : 0
    return depth[id]
  }
  nodes.forEach((n) => calc(n.id))
  const layers = {}
  nodes.forEach((n) => {
    ;(layers[depth[n.id]] ??= []).push(n)
  })
  const NODE_W = 176
  const NODE_H = 88
  const COL_W = 196
  const ROW_H = 112
  const maxDepth = Math.max(...Object.keys(layers).map(Number))
  const maxRows = Math.max(...Object.values(layers).map((l) => l.length))
  const height = Math.max(520, maxRows * ROW_H + 80)
  const width = 40 + maxDepth * COL_W + NODE_W + 40
  for (const [d, list] of Object.entries(layers)) {
    list.forEach((n, i) => {
      n.x = 40 + Number(d) * COL_W
      n.y = height / 2 - ((list.length - 1) * ROW_H) / 2 + i * ROW_H - NODE_H / 2
      n.deps = n.prerequisites
      /* linkedNodes 用「关联章节」表示：诊断引擎的论文覆盖率 = 已理解关联章节 / 关联章节总数 */
      n.linkedNodes = Object.keys(sectionKnowledge).filter((s) => sectionKnowledge[s].includes(n.id))
      const secId = n.linkedNodes[0]
      n.paper = { paperId: paper.id, sectionId: secId }
      n.desc = n.explanation
      n.keyPoints = n.learningObjectives
    })
  }
  return {
    caseId: paper.id,
    caseTitle: 'LoRaWAN 综述知识图谱',
    caseDesc: `基于《${paper.title}》预置的 ${nodes.length} 个知识点与 ${relations.relations.length} 条关系；掌握度由论文理解 70% + 小测验证 30% 规则计算，全部证据可追溯。`,
    weights: { reader: 0.7, quiz: 0.3, masteredThreshold: 80, learningThreshold: 40 },
    viewBox: { w: width, h: height },
    nodes,
    edges: relations.relations,
  }
}

export function buildMapBank(questions) {
  return {
    questions: questions.questions.map((q) => ({
      id: q.id,
      node: q.relatedKnowledge[0],
      linked: q.relatedKnowledge,
      type: q.type,
      prompt: q.question,
      options: q.options.map((o) => o.text),
      answer: q.type === 'true_false' ? (q.answer === 'true' ? 0 : 1) : q.answer.charCodeAt(0) - 65,
      explain: q.explanation,
      difficulty: q.difficulty,
    })),
  }
}

export function buildQuizBank(questions, paper, sectionKnowledge) {
  const firstSection = (knId) =>
    Object.keys(sectionKnowledge).find((s) => sectionKnowledge[s].includes(knId)) ?? paper.structure[0].id
  return {
    ruleText:
      '组卷与评分规则 Q1–Q4：种子随机不重复抽取 3 道选择 + 2 道判断；每题 20 分；累计答错 ≥ 2 次的标签判为薄弱、1 次为关注；复习建议链接到知识地图节点或论文章节。',
    skills: [],
    questions: questions.questions.map((q) => ({
      id: q.id,
      type: q.type === 'true_false' ? 'judge' : 'single',
      prompt: q.question,
      options: q.options.map((o) => o.text),
      answer: q.type === 'true_false' ? (q.answer === 'true' ? 0 : 1) : q.answer.charCodeAt(0) - 65,
      explain: q.explanation,
      tags: q.relatedKnowledge,
      difficulty: q.difficulty,
      paper: { paperId: paper.id, sectionId: firstSection(q.relatedKnowledge[0]) },
    })),
  }
}

export function buildExercises(methodLab) {
  return {
    ruleText:
      '判分规则 L1–L3：排序按位置完全正确计对错，匹配与判断按选项精确比对；解释与知识标签均来自预置 methodLab.json，不生成新内容。',
    exercises: methodLab.activities.map((a) => {
      if (a.activityType === 'ordering') {
        const order = a.correctAnswer
        return {
          id: a.id,
          kind: 'order',
          title: a.title,
          icon: 'trendUp',
          brief: '按论文综述流程恢复步骤顺序',
          prompt: a.prompt,
          hint: '先规划、再检索、后人工审查，最后归纳结果。',
          tags: a.relatedKnowledge,
          source: a.source,
          explainShared: a.explanation,
          steps: order.map((id) => {
            const it = a.items.find((x) => x.id === id)
            return { id, text: it.label, explain: a.explanation, tags: a.relatedKnowledge }
          }),
        }
      }
      if (a.activityType === 'matching') {
        return {
          id: a.id,
          kind: 'match',
          title: a.title,
          icon: 'nodes',
          brief: '为系统组成部分匹配主要作用',
          prompt: a.prompt,
          hint: '端设备产生数据、网关转发、后端处理。',
          tags: a.relatedKnowledge,
          source: a.source,
          explainShared: a.explanation,
          techs: a.options.map((o) => ({ id: o.id, name: o.label, spec: '' })),
          needs: a.items.map((it) => ({
            id: it.id,
            text: it.label,
            answer: a.correctAnswer[it.id],
            explain: a.explanation,
            tags: a.relatedKnowledge,
          })),
        }
      }
      return {
        id: a.id,
        kind: 'design',
        title: a.title,
        icon: 'flask',
        brief: '判断实验设计是否充分',
        prompt: a.prompt,
        hint: '单点单指标不能代表整网性能：看采样位置、指标组合与环境因素。',
        tags: a.relatedKnowledge,
        source: a.source,
        scenario: a.scenario,
        items: [
          {
            id: a.id,
            prompt: a.prompt,
            options: a.options.map((o) => o.label),
            answer: a.options.findIndex((o) => o.id === a.correctAnswer),
            explain: a.explanation,
            tags: a.relatedKnowledge,
          },
        ],
      }
    }),
  }
}

export function buildAll(raw) {
  const sectionKnowledge = buildSectionKnowledge(raw.paper, raw.knowledge)
  const paper = normalizePaper(raw.paper, sectionKnowledge)
  const nodes = normalizeNodes(raw.knowledge)
  const graph = buildGraph(raw.knowledge, raw.relations, raw.paper, sectionKnowledge)
  const mapBank = buildMapBank(raw.questions)
  graph.nodes.forEach((n) => {
    n.hasQuiz = mapBank.questions.some((q) => (q.linked ?? [q.node]).includes(n.id))
  })
  return {
    paper,
    nodes,
    graph,
    glossary: raw.glossary.terms,
    sectionKnowledge,
    mapBank,
    quizBank: buildQuizBank(raw.questions, raw.paper, sectionKnowledge),
    lab: buildExercises(raw.methodLab),
    raw,
  }
}