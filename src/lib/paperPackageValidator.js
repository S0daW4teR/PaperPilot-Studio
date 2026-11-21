import { paperPackageSchema, PAPER_PACKAGE_VERSION, MAX_PAPER_FILE_BYTES } from '../data/paperPackageSchema.js'

export function validatePaperPackage(data, existingIds = []) {
  const errors = []
  const warnings = []
  const fail = (message) => { if (errors.length < 80) errors.push(message) }
  const matches = (value, type) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type
  const visit = (value, schema, path) => {
    if (schema.const !== undefined && value !== schema.const) { fail(`${path} 不受支持：仅接受字符串 "${PAPER_PACKAGE_VERSION}"，请使用当前提示词重新生成扁平数据包。`); return }
    if (schema.enum && !schema.enum.includes(value)) { fail(`${path} 必须为：${schema.enum.join(' / ')}`); return }
    if (schema.type && ![schema.type].flat().some((type) => matches(value, type))) { fail(`${path || '根对象'} 类型错误，应为 ${[schema.type].flat().join(' 或 ')}`); return }
    if (value === null) return
    if (typeof value === 'string') {
      if (schema.minLength && value.trim().length < schema.minLength) fail(`${path} 不能为空`)
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`${path} 必须为 1–100 位字母、数字、下划线或短横线，首位为字母或数字`)
    }
    if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) fail(`${path} 数值超出允许范围`)
    if (Array.isArray(value)) {
      if (schema.minItems && value.length < schema.minItems) fail(`${path} 至少需要 ${schema.minItems} 项`)
      if (schema.uniqueItems && new Set(value).size !== value.length) fail(`${path} 存在重复值`)
      if (schema.items) value.forEach((item, index) => visit(item, schema.items, `${path}[${index}]`))
    }
    if (schema.properties) {
      for (const key of schema.required) if (!Object.hasOwn(value, key)) fail(`缺少 ${path ? `${path}.` : ''}${key}`)
      for (const key of Object.keys(value)) {
        const next = path ? `${path}.${key}` : key
        if (!Object.hasOwn(schema.properties, key)) fail(`${next} 是未定义字段，请使用统一 1.0 规范`)
        else visit(value[key], schema.properties[key], next)
      }
    }
  }
  visit(data, paperPackageSchema, '')
  if (errors.length) return { ok: false, errors, warnings }

  if (new Set(existingIds).has(data.paper.id)) fail(`paper.id 重复：${data.paper.id} 已存在，不会覆盖已有论文，请取消导入。`)
  const entities = new Map()
  const register = (item, path) => {
    if (['constructor', 'prototype', '__proto__'].includes(item.id)) fail(`${path}.id 使用了保留名称`)
    if (entities.has(item.id)) fail(`${path} 存在重复 ID：${item.id}（已在 ${entities.get(item.id)} 定义）`)
    else entities.set(item.id, path)
  }
  register(data.paper, 'paper')
  for (const key of ['sections', 'knowledgePoints', 'glossary', 'questions', 'methodLab']) {
    data[key].forEach((item, index) => {
      const path = `${key}[${index}]`
      register(item, path)
      item.options?.forEach((option, n) => register(option, `${path}.options[${n}]`))
      item.items?.forEach((entry, n) => register(entry, `${path}.items[${n}]`))
    })
  }
  const knowledgeIds = new Set(data.knowledgePoints.map((point) => point.id))
  const reference = (ids, path) => ids.forEach((id) => { if (!knowledgeIds.has(id)) fail(`${path} 引用了不存在的知识点：${id}`) })
  for (const key of ['sections', 'glossary', 'questions', 'methodLab']) data[key].forEach((item, index) => reference(item.relatedKnowledge, `${key}[${index}].relatedKnowledge`))
  data.knowledgePoints.forEach((point, index) => {
    reference(point.prerequisites, `knowledgePoints[${index}].prerequisites`)
    if (point.prerequisites.includes(point.id)) fail(`knowledgePoints[${index}] 不能依赖自身`)
  })
  const relations = new Set()
  const prerequisiteEdges = new Set()
  data.knowledgeRelations.forEach((edge, index) => {
    reference([edge.source, edge.target], `knowledgeRelations[${index}]`)
    if (edge.source === edge.target) fail(`knowledgeRelations[${index}] 不能关联自身`)
    const key = `${edge.source}|${edge.target}|${edge.relationship}`
    if (relations.has(key)) fail(`knowledgeRelations[${index}] 存在重复关系`)
    relations.add(key)
    if (edge.relationship === 'prerequisite') prerequisiteEdges.add(`${edge.source}|${edge.target}`)
  })
  const declared = new Set(data.knowledgePoints.flatMap((point) => point.prerequisites.map((id) => `${id}|${point.id}`)))
  if (declared.size !== prerequisiteEdges.size || [...declared].some((edge) => !prerequisiteEdges.has(edge))) fail('knowledgeRelations 的 prerequisite 关系必须与 knowledgePoints.prerequisites 完全一致')
  const incoming = new Map(data.knowledgePoints.map((point) => [point.id, point.prerequisites.length]))
  const outgoing = new Map(data.knowledgePoints.map((point) => [point.id, []]))
  data.knowledgePoints.forEach((point) => point.prerequisites.forEach((id) => outgoing.get(id)?.push(point.id)))
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  for (let i = 0; i < queue.length; i++) for (const id of outgoing.get(queue[i]) ?? []) {
    incoming.set(id, incoming.get(id) - 1)
    if (incoming.get(id) === 0) queue.push(id)
  }
  if (queue.length !== knowledgeIds.size) fail('knowledgePoints.prerequisites 存在依赖环或无效依赖，无法确定学习顺序')
  if (new Set(data.sections.map((section) => section.order)).size !== data.sections.length) fail('sections.order 存在重复顺序')

  data.questions.forEach((question, index) => {
    const path = `questions[${index}]`
    if (question.type === 'single_choice') {
      if (question.options.length !== 4 || !/^[A-D]$/.test(question.answer)) fail(`${path} 选择题必须有按 A–D 排列的四个选项，answer 为 A/B/C/D 字符串`)
    } else if (question.options.length !== 2 || question.options[0].text !== '正确' || question.options[1].text !== '错误' || !['true', 'false'].includes(question.answer)) fail(`${path} 判断题选项须依次为“正确”“错误”，answer 必须是字符串 true/false`)
  })
  data.methodLab.forEach((activity, index) => {
    const path = `methodLab[${index}]`
    const options = new Set(activity.options.map((option) => option.id))
    if (activity.type === 'matching') {
      if (!activity.items?.length) fail(`${path}.items 是匹配练习的必要字段`)
      if (!activity.answer || typeof activity.answer !== 'object' || Array.isArray(activity.answer)) fail(`${path}.answer 必须为匹配项 ID 到选项 ID 的对象`)
      else {
        const items = new Set(activity.items?.map((item) => item.id) ?? [])
        if (Object.keys(activity.answer).length !== items.size || Object.entries(activity.answer).some(([id, answer]) => !items.has(id) || !options.has(answer))) fail(`${path}.answer 包含无效匹配引用或未覆盖所有 items`)
      }
    } else {
      if (activity.items !== undefined) fail(`${path}.items 仅用于 matching，排序步骤直接写在 options 中`)
      if (activity.type === 'ordering') {
        if (!Array.isArray(activity.answer) || activity.answer.length !== options.size || new Set(activity.answer).size !== options.size || activity.answer.some((id) => !options.has(id))) fail(`${path}.answer 必须为全部 options ID 的无重复排列`)
      } else if (typeof activity.answer !== 'string' || !options.has(activity.answer)) fail(`${path}.answer 必须引用一个有效选项 ID`)
    }
  })
  if (data.paper.originalUrl !== null) {
    try { if (!['http:', 'https:'].includes(new URL(data.paper.originalUrl).protocol)) fail('paper.originalUrl 只允许 http/https 地址') }
    catch { fail('paper.originalUrl 不是有效网址') }
  }
  const sourceEntries = [['paper.source', data.paper.source]]
  for (const key of ['sections', 'knowledgePoints', 'glossary', 'questions', 'methodLab']) data[key].forEach((item, index) => sourceEntries.push([`${key}[${index}].source`, item.source]))
  data.knowledgeRelations.forEach((item, index) => sourceEntries.push([`knowledgeRelations[${index}].evidence`, item.evidence]))
  const sources = sourceEntries.map(([, source]) => source).filter(Boolean)
  sourceEntries.forEach(([path, source]) => {
    if (source?.verificationStatus === 'located' && !source.pages.length && !source.sections.length) fail(`${path} 标记为 located 时必须提供真实页码或章节定位`)
  })
  data.sections.forEach((section, index) => {
    if (section.source && JSON.stringify([...section.sourcePages].sort((a, b) => a - b)) !== JSON.stringify([...section.source.pages].sort((a, b) => a - b))) fail(`sections[${index}].sourcePages 与 source.pages 必须一致`)
  })
  if (sources.some((source) => source.kind === 'unverified' || source.verificationStatus === 'pending')) warnings.push('包含待人工核实的来源；通过结构验证不代表论文事实已经核实。')
  if (!data.paper.authors.length || data.paper.year === null || data.paper.journal === null) warnings.push('部分作者/年份/期刊信息未提供，将按未知显示，不会补造。')
  if (data.knowledgePoints.length < 8 || data.knowledgePoints.length > 12 || data.knowledgeRelations.length < 10 || data.knowledgeRelations.length > 15 || data.glossary.length < 12 || data.glossary.length > 15 || data.questions.length < 10 || data.methodLab.length < 3) warnings.push('这是小型或非标准规模课程包，未满足提示词建议的完整课程数量；仍可保存已有内容。')
  if (data.sections.some((section) => !section.sourcePages.length)) warnings.push('部分章节没有可核对的 PDF 页码，请自行复核来源。')
  return { ok: errors.length === 0, errors, warnings, ...(errors.length ? {} : { data }) }
}

export function parsePaperPackage(text, existingIds = []) {
  let data
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')) }
  catch { return { ok: false, errors: ['JSON 格式错误：请检查双引号、逗号和括号；文件中不能包含 Markdown 围栏或注释。'], warnings: [] } }
  return validatePaperPackage(data, existingIds)
}

export async function readPaperPackageFile(file, existingIds = []) {
  if (!file || !/\.json$/i.test(file.name)) return { ok: false, errors: ['仅支持 .json 文件；请上传 paper-package.json，不接受 PDF 或其他格式。'], warnings: [] }
  if (file.size > MAX_PAPER_FILE_BYTES) return { ok: false, errors: ['文件超过 5MB（5 × 1024 × 1024 字节）限制，请精简正文后重试。'], warnings: [] }
  try { return parsePaperPackage(await file.text(), existingIds) }
  catch { return { ok: false, errors: ['无法读取本地文件，请重新选择文件并检查访问权限。'], warnings: [] } }
}
