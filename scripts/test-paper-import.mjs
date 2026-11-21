import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  validatePaperPackage,
  parsePaperPackage,
  readPaperPackageFile,
} from '../src/lib/paperPackageValidator.js'
import {
  PAPER_PACKAGE_VERSION,
  MAX_PAPER_FILE_BYTES,
  paperPackageSchema,
  sourceSchema,
} from '../src/data/paperPackageSchema.js'

const exampleText = await readFile(new URL('../src/data/paperPackageExample.json', import.meta.url), 'utf8')
const example = JSON.parse(exampleText)
const fresh = () => structuredClone(example)
const at = (data, path) => path ? path.split('.').reduce((value, key) => value[key], data) : data
const displayPath = (path) => path.split('.').reduce((label, key) => /^\d+$/.test(key) ? `${label}[${key}]` : `${label}${label ? '.' : ''}${key}`, '')
const setAt = (data, path, value) => {
  const keys = path.split('.')
  const key = keys.pop()
  at(data, keys.join('.'))[key] = value
}
const freezeDeep = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep)
    Object.freeze(value)
  }
  return value
}

function assertResult(result) {
  assert.equal(typeof result, 'object')
  assert.notEqual(result, null)
  assert.equal(typeof result.ok, 'boolean')
  for (const key of ['errors', 'warnings']) {
    assert.ok(Array.isArray(result[key]), `${key} must be an array`)
    assert.ok(result[key].every((message) => typeof message === 'string' && message.trim()), `${key} must contain clear, nonempty strings`)
  }
}

function assertValid(result, expected) {
  assertResult(result)
  assert.equal(result.ok, true, `Unexpected validation errors: ${JSON.stringify(result.errors)}`)
  assert.deepEqual(result.errors, [])
  assert.ok(Object.hasOwn(result, 'data'))
  if (expected !== undefined) assert.deepEqual(result.data, expected)
  return result
}

function assertInvalid(result, path, detail) {
  assertResult(result)
  assert.equal(result.ok, false, 'Malformed package was accepted')
  assert.ok(result.errors.length > 0, 'Rejection must explain the error')
  assert.equal(Object.hasOwn(result, 'data'), false, 'Rejected input must not be returned as validated data')
  if (path) assert.ok(result.errors.some((error) => error.includes(path)), `Expected explicit error path ${path}; received ${JSON.stringify(result.errors)}`)
  if (detail) assert.match(result.errors.join('\n'), detail)
  return result
}

function validateWithoutThrow(data, existingIds) {
  let result
  assert.doesNotThrow(() => { result = validatePaperPackage(data, existingIds) }, 'Malformed input must return errors, not throw')
  return result
}

function rejectMutation(name, path, mutate, detail) {
  test(name, () => {
    const data = fresh()
    mutate(data)
    const snapshot = structuredClone(data)
    assertInvalid(validateWithoutThrow(data), path, detail)
    assert.deepEqual(data, snapshot, 'Rejected input must remain unchanged')
  })
}

function rejectValue(name, path, value, detail) {
  rejectMutation(name, displayPath(path), (data) => setAt(data, path, value), detail)
}

function acceptMutation(name, mutate) {
  test(name, () => {
    const data = fresh()
    mutate(data)
    assertValid(validateWithoutThrow(data), data)
  })
}

const locatedSource = (pages = [], sections = []) => ({
  pages, sections, kind: 'paper_fact', verificationStatus: 'located', note: 'Test provenance, not a factual verification.',
})

test('schema exports the flat 1.0 contract and exact 5 MiB cap', () => {
  assert.equal(PAPER_PACKAGE_VERSION, '1.0')
  assert.equal(MAX_PAPER_FILE_BYTES, 5 * 1024 * 1024)
  assert.equal(paperPackageSchema.properties.schemaVersion.const, '1.0')
  assert.deepEqual(paperPackageSchema.required, [
    'schemaVersion', 'paper', 'sections', 'knowledgePoints', 'knowledgeRelations', 'glossary', 'questions', 'methodLab',
  ])
  assert.equal(paperPackageSchema.properties.knowledgePoints.items.properties.source, sourceSchema)
  const inspect = (schema) => {
    if (schema.properties) {
      assert.equal(schema.additionalProperties, false)
      assert.ok(schema.required.every((key) => Object.hasOwn(schema.properties, key)))
      Object.values(schema.properties).forEach(inspect)
    }
    if (schema.items) inspect(schema.items)
  }
  inspect(paperPackageSchema)
})

test('real example validates without mutation, including frozen input and existing IDs', () => {
  const data = freezeDeep(fresh())
  const existingIds = Object.freeze(['unrelated_paper'])
  assertValid(validateWithoutThrow(data, existingIds), example)
  assert.deepEqual(data, example)
  assert.deepEqual(existingIds, ['unrelated_paper'])
})

test('real example parses as a single flat JSON document', () => {
  assertValid(parsePaperPackage(exampleText), example)
})

test('parser accepts one leading UTF-8 BOM', () => {
  assertValid(parsePaperPackage(`\uFEFF${exampleText}`), example)
})

test('parser accepts surrounding JSON whitespace', () => {
  assertValid(parsePaperPackage(` \r\n\t${exampleText}\n `), example)
})

// Exercise every required field represented by the fixture, including nested
// source, option, and matching-item objects, without maintaining a second schema.
function requiredFieldTests(value, schema, path = '') {
  if (schema.properties) {
    for (const key of schema.required) {
      const field = path ? `${path}.${key}` : key
      rejectMutation(`missing required ${displayPath(field)}`, displayPath(field), (data) => { delete at(data, path)[key] })
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) requiredFieldTests(value[key], child, path ? `${path}.${key}` : key)
    }
  } else if (schema.items && Array.isArray(value) && value.length) {
    requiredFieldTests(value[0], schema.items, `${path}.0`)
  }
}
requiredFieldTests(example, paperPackageSchema)

for (const [path, value] of [
  ['paper', null], ['paper', []], ['paper.id', 1], ['paper.title', 42], ['paper.title', '   '],
  ['paper.authors', 'Unknown'], ['paper.authors', [null]], ['paper.authors', ['same', 'same']],
  ['paper.year', '2026'], ['paper.year', 2026.5], ['paper.year', 999], ['paper.year', 10000],
  ['paper.journal', {}], ['paper.doi', []], ['paper.license', false], ['paper.field', []],
  ['paper.paperType', ''], ['paper.difficulty', 'expert'], ['paper.abstract', '\t'],
  ['sections', null], ['sections', {}], ['sections', []], ['sections.0', null],
  ['sections.0.order', '1'], ['sections.0.order', 0], ['sections.0.order', 1.5],
  ['sections.0.detailedContent', {}], ['sections.0.sourcePages', [0]],
  ['sections.0.sourcePages', [1.2]], ['sections.0.sourcePages', ['1']], ['sections.0.sourcePages', [1, 1]],
  ['knowledgePoints', []], ['knowledgePoints.0.difficulty', 0], ['knowledgePoints.0.difficulty', 4],
  ['knowledgePoints.0.source', null], ['knowledgePoints.0.source.pages', null],
  ['knowledgePoints.0.source.sections', 'Introduction'], ['knowledgePoints.0.source.kind', 'invented'],
  ['knowledgePoints.0.source.verificationStatus', 'verified'], ['knowledgeRelations', {}],
  ['knowledgeRelations.0', null], ['glossary', 'terms'], ['glossary.0.relatedKnowledge', []],
  ['questions', {}], ['questions.0', null], ['questions.0.options', null], ['questions.0.options', []],
  ['questions.0.options.0', null], ['questions.0.options.0.text', ''], ['questions.0.difficulty', true],
  ['questions.0.type', 'essay'], ['methodLab', null], ['methodLab.0', null],
  ['methodLab.0.options', {}], ['methodLab.0.items', null], ['methodLab.0.answer', null],
  ['methodLab.0.type', 'freeform'],
]) {
  rejectValue(`malformed ${displayPath(path)} = ${JSON.stringify(value)}`, path, value)
}

test('null root returns an explicit root-path error rather than throwing', () => {
  const result = assertInvalid(validateWithoutThrow(null))
  assert.match(result.errors.join('\n'), /\$|\broot\b|根/i, 'Root type errors must identify the root ($), not an empty path')
})

for (const value of [undefined, [], false, 1, 'not a package']) {
  test(`non-object root ${JSON.stringify(value)} is rejected without throwing`, () => {
    assertInvalid(validateWithoutThrow(value), undefined, /类型|object/i)
  })
}

for (const version of ['0.1', '2.0', 1, null]) {
  rejectValue(`reject unsupported schemaVersion ${JSON.stringify(version)}`, 'schemaVersion', version, /1\.0/)
}

test('legacy nested package is not silently migrated or accepted', () => {
  const { paper, ...course } = fresh()
  const result = validateWithoutThrow({ schemaVersion: '1.0', paper, course })
  assertInvalid(result, 'sections')
  assertInvalid(result, 'course')
})

for (const text of ['', '{', '{"schemaVersion":"1.0",}', 'null trailing', `\`\`\`json\n${exampleText}\n\`\`\``, `// comment\n${exampleText}`, `${exampleText}${exampleText}`]) {
  test(`invalid JSON is rejected: ${JSON.stringify(text.slice(0, 45))}`, () => {
    let result
    assert.doesNotThrow(() => { result = parsePaperPackage(text) })
    assertInvalid(result, undefined, /JSON/)
  })
}

test('parsed JSON null is rejected without throwing', () => {
  assertInvalid(parsePaperPackage('null'), undefined, /类型|object/i)
})

for (const path of ['', 'paper', 'sections.0', 'knowledgePoints.0', 'knowledgePoints.0.source', 'knowledgeRelations.0', 'glossary.0', 'questions.0', 'questions.0.options.0', 'methodLab.0', 'methodLab.0.items.0', 'methodLab.0.options.0']) {
  const field = path ? `${path}.unknownMetadata` : 'unknownMetadata'
  rejectMutation(`reject unknown metadata at ${displayPath(field)}`, displayPath(field), (data) => {
    at(data, path).unknownMetadata = { arbitrary: 'not in the import contract' }
  })
}

acceptMutation('unknown bibliographic values remain null/empty rather than being fabricated', (data) => {
  data.paper.authors = []
  for (const key of ['year', 'journal', 'doi', 'originalUrl', 'license']) data.paper[key] = null
})

test('unknown bibliographic values and small example produce informative warnings, not errors', () => {
  const result = assertValid(validatePaperPackage(fresh()))
  assert.ok(result.warnings.some((message) => /作者|年份|期刊/.test(message)))
  assert.ok(result.warnings.some((message) => /数量|规模/.test(message)))
  assert.ok(result.warnings.some((message) => /页码/.test(message)))
})

test('paper ID cannot overwrite an existing imported ID', () => {
  const existingIds = Object.freeze([example.paper.id])
  assertInvalid(validateWithoutThrow(fresh(), existingIds), 'paper.id', /重复/)
  assert.deepEqual(existingIds, [example.paper.id])
})

test('paper ID cannot overwrite built-in p1 supplied through existingIds', () => {
  const data = fresh()
  data.paper.id = 'p1'
  assertInvalid(validateWithoutThrow(data, ['p1', 'p2']), 'paper.id', /重复/)
})

test('parse propagates existingIds including built-in p1', () => {
  const data = fresh()
  data.paper.id = 'p1'
  assertInvalid(parsePaperPackage(JSON.stringify(data), ['p1']), 'paper.id', /重复/)
})

for (const id of ['', 'with space', '_leading', '-leading', 'a.b', 'a/b', 'a:b', '中文', 'a'.repeat(101)]) {
  rejectValue(`reject invalid ID syntax ${JSON.stringify(id)}`, 'paper.id', id)
}
for (const id of ['a', '1', '9_import-valid', 'a'.repeat(100)]) {
  acceptMutation(`accept valid ID boundary ${JSON.stringify(id)}`, (data) => { data.paper.id = id })
}
for (const id of ['constructor', 'prototype', '__proto__']) {
  rejectValue(`reject reserved entity ID ${id}`, 'paper.id', id)
}
for (const path of ['sections.0.id', 'knowledgePoints.0.id', 'glossary.0.id', 'questions.0.id', 'questions.0.options.0.id', 'methodLab.0.id', 'methodLab.0.items.0.id', 'methodLab.0.options.0.id']) {
  rejectValue(`enforce ID syntax at ${displayPath(path)}`, path, 'bad id')
}

rejectMutation('duplicate knowledge point IDs are rejected', 'knowledgePoints[1]', (data) => {
  data.knowledgePoints[1].id = data.knowledgePoints[0].id
}, /重复/)
rejectMutation('IDs are globally unique across paper and sections', 'sections[0]', (data) => {
  data.sections[0].id = data.paper.id
}, /重复/)
rejectMutation('IDs are globally unique across sections and knowledge points', 'knowledgePoints[0]', (data) => {
  data.knowledgePoints[0].id = data.sections[0].id
}, /重复/)
rejectMutation('IDs are globally unique across question and lab options', 'methodLab[0].options[0]', (data) => {
  data.methodLab[0].options[0].id = data.questions[0].options[0].id
}, /重复/)
rejectMutation('IDs are globally unique across matching items and options', 'methodLab[0].items[0]', (data) => {
  data.methodLab[0].items[0].id = data.methodLab[0].options[0].id
}, /重复/)
rejectMutation('question option IDs cannot repeat', 'questions[0].options[1]', (data) => {
  data.questions[0].options[1].id = data.questions[0].options[0].id
}, /重复/)
rejectMutation('section order must be unique', 'sections.order', (data) => {
  data.sections.push({ ...structuredClone(data.sections[0]), id: 'another_section' })
}, /重复/)
acceptMutation('distinct positive section orders need not be contiguous', (data) => {
  data.sections.push({ ...structuredClone(data.sections[0]), id: 'another_section', order: 3 })
})

for (const path of ['sections.0.relatedKnowledge', 'glossary.0.relatedKnowledge', 'questions.0.relatedKnowledge', 'methodLab.0.relatedKnowledge', 'knowledgePoints.0.prerequisites']) {
  rejectValue(`reject missing knowledge reference at ${displayPath(path)}`, path, ['missing_knowledge'])
  rejectValue(`reject wrong reference type at ${displayPath(path)}`, path, 'example_kn_json')
  rejectValue(`reject duplicate references at ${displayPath(path)}`, path, ['example_kn_json', 'example_kn_json'])
}
rejectMutation('references cannot resolve to an ID belonging to a section', 'questions[0].relatedKnowledge', (data) => {
  data.questions[0].relatedKnowledge = [data.sections[0].id]
})
rejectMutation('knowledge point cannot depend on itself', 'knowledgePoints[0]', (data) => {
  data.knowledgePoints[0].prerequisites = [data.knowledgePoints[0].id]
}, /自身/)
for (const field of ['source', 'target']) {
  rejectMutation(`relation ${field} must resolve to a knowledge point`, 'knowledgeRelations[0]', (data) => {
    data.knowledgeRelations[0][field] = 'missing_knowledge'
  })
}
rejectMutation('relation cannot be a self-edge', 'knowledgeRelations[1]', (data) => {
  data.knowledgeRelations.push({ ...data.knowledgeRelations[0], target: data.knowledgeRelations[0].source, relationship: 'related' })
}, /自身/)
rejectValue('unknown relationship type is rejected', 'knowledgeRelations.0.relationship', 'causes')
rejectMutation('repeated typed edges are rejected', 'knowledgeRelations[1]', (data) => {
  data.knowledgeRelations.push(structuredClone(data.knowledgeRelations[0]))
}, /重复/)
for (const relationship of ['component', 'application', 'related']) {
  acceptMutation(`same endpoints can have a distinct ${relationship} relationship`, (data) => {
    data.knowledgeRelations.push({ ...data.knowledgeRelations[0], relationship })
  })
}
rejectMutation('declared prerequisite must have a matching relation', 'knowledgeRelations', (data) => {
  data.knowledgeRelations = []
}, /prerequisite/)
rejectMutation('prerequisite relation must have a matching declaration', 'knowledgeRelations', (data) => {
  data.knowledgePoints[1].prerequisites = []
}, /prerequisite/)
rejectMutation('prerequisite relation direction must agree with declarations', 'knowledgeRelations', (data) => {
  const edge = data.knowledgeRelations[0]
  ;[edge.source, edge.target] = [edge.target, edge.source]
}, /prerequisite/)
rejectMutation('consistent but cyclic prerequisite graph is rejected', 'knowledgePoints.prerequisites', (data) => {
  data.knowledgePoints[0].prerequisites = [data.knowledgePoints[1].id]
  data.knowledgeRelations.push({ ...data.knowledgeRelations[0], source: data.knowledgePoints[1].id, target: data.knowledgePoints[0].id })
}, /环/)
acceptMutation('non-prerequisite relations may form cycles', (data) => {
  data.knowledgeRelations.push({ ...data.knowledgeRelations[0], source: data.knowledgePoints[1].id, target: data.knowledgePoints[0].id, relationship: 'related' })
})

for (const answer of ['A', 'B', 'C', 'D']) {
  acceptMutation(`single-choice answer ${answer} is accepted`, (data) => { data.questions[0].answer = answer })
}
for (const answer of ['E', 'a', 'AB', 'true', 'example_q_01_A', '', 0, true, ['A']]) {
  rejectMutation(`single-choice answer ${JSON.stringify(answer)} is rejected`, 'questions[0]', (data) => { data.questions[0].answer = answer })
}
for (const count of [2, 3, 5]) {
  rejectMutation(`single-choice requires four options, not ${count}`, 'questions[0]', (data) => {
    if (count < 4) data.questions[0].options.length = count
    else data.questions[0].options.push({ id: 'extra_choice', text: 'Extra' })
  })
}
for (const answer of ['true', 'false']) {
  acceptMutation(`true-false string answer ${answer} is accepted`, (data) => { data.questions[1].answer = answer })
}
for (const answer of [true, false, 'True', 'FALSE', 'A', '正确', '']) {
  rejectMutation(`true-false answer ${JSON.stringify(answer)} is rejected`, 'questions[1]', (data) => { data.questions[1].answer = answer })
}
rejectMutation('true-false option text and order are required', 'questions[1]', (data) => { data.questions[1].options.reverse() })
rejectMutation('true-false must have exactly two options', 'questions[1]', (data) => {
  data.questions[1].options.push({ id: 'extra_boolean_choice', text: 'Other' })
})

rejectMutation('matching requires items', 'methodLab[0].items', (data) => { delete data.methodLab[0].items })
rejectValue('matching requires nonempty items', 'methodLab.0.items', [])
for (const answer of ['example_match_parse', ['example_match_parse'], true, 1, null, {}, { missing_item: 'example_match_parse' }, { example_match_syntax: 'missing_option', example_match_refs: 'example_match_exists' }, { example_match_syntax: 'example_match_parse' }, { example_match_syntax: 'example_match_parse', example_match_refs: 'example_match_exists', extra_item: 'example_match_parse' }, { example_match_syntax: ['example_match_parse'], example_match_refs: 'example_match_exists' }]) {
  rejectValue(`reject malformed matching answer ${JSON.stringify(answer)}`, 'methodLab.0.answer', answer)
}
rejectMutation('matching answer cannot reference another activity option', 'methodLab[0].answer', (data) => {
  data.methodLab[0].answer.example_match_syntax = data.methodLab[1].options[0].id
})
acceptMutation('ordering accepts another complete permutation of its option IDs', (data) => { data.methodLab[1].answer.reverse() })
for (const answer of ['example_step_check', { first: 'example_step_check' }, true, 1, null, [], ['example_step_check'], ['example_step_check', 'example_step_check'], ['example_step_check', 'missing_option'], ['example_step_check', 'example_step_save', 'extra_option'], [1, 2], [{ id: 'example_step_check' }, 'example_step_save']]) {
  rejectValue(`reject malformed ordering answer ${JSON.stringify(answer)}`, 'methodLab.1.answer', answer)
}
rejectMutation('ordering cannot use a foreign activity option ID', 'methodLab[1].answer', (data) => {
  data.methodLab[1].answer[0] = data.methodLab[0].options[0].id
})
for (const index of [1, 2]) {
  rejectMutation(`non-matching activity ${index} cannot define items`, `methodLab[${index}].items`, (data) => {
    data.methodLab[index].items = [{ id: `forbidden_item_${index}`, label: 'Not a matching activity' }]
  })
}
acceptMutation('scenario judgment accepts its other valid option ID', (data) => { data.methodLab[2].answer = data.methodLab[2].options[1].id })
for (const answer of ['missing_option', 'A', ['example_design_keep'], { choice: 'example_design_keep' }, true, 1, null]) {
  rejectValue(`reject malformed scenario answer ${JSON.stringify(answer)}`, 'methodLab.2.answer', answer)
}
rejectMutation('scenario judgment cannot use a foreign option ID', 'methodLab[2].answer', (data) => {
  data.methodLab[2].answer = data.methodLab[0].options[0].id
})

for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/paper.pdf', 'ftp://example.org/paper', 'vbscript:msgbox(1)', 'blob:https://example.org/123', '//example.org/paper', '/paper.pdf', 'not a URL', '']) {
  rejectValue(`reject unsafe or invalid originalUrl ${JSON.stringify(url)}`, 'paper.originalUrl', url)
}
for (const url of [null, 'https://example.org/paper.pdf', 'http://example.org/paper', 'HTTPS://EXAMPLE.ORG/paper']) {
  acceptMutation(`accept originalUrl ${JSON.stringify(url)}`, (data) => { data.paper.originalUrl = url })
}

for (const path of ['paper.source', 'sections.0.source', 'knowledgePoints.0.source', 'knowledgeRelations.0.evidence', 'glossary.0.source', 'questions.0.source', 'methodLab.0.source']) {
  rejectValue(`located provenance without location identifies ${displayPath(path)}`, path, locatedSource())
  acceptMutation(`located provenance can use a section instead of pages at ${displayPath(path)}`, (data) => {
    setAt(data, path, locatedSource([], ['Introduction']))
  })
}
acceptMutation('located provenance accepts a positive page number', (data) => { data.paper.source = locatedSource([1]) })
acceptMutation('section sourcePages equality is independent of page order', (data) => {
  data.sections[0].sourcePages = [3, 1, 2]
  data.sections[0].source = locatedSource([2, 3, 1])
})
for (const [sourcePages, pages] of [[[1], [2]], [[], [1]], [[1], []], [[1, 2], [1]]]) {
  rejectMutation(`section sourcePages ${JSON.stringify(sourcePages)} must equal provenance pages ${JSON.stringify(pages)}`, 'sections[0].sourcePages', (data) => {
    data.sections[0].sourcePages = sourcePages
    data.sections[0].source = locatedSource(pages, ['Introduction'])
  })
}
for (const [kind, verificationStatus] of [['unverified', 'not_applicable'], ['paper_fact', 'pending']]) {
  test(`source ${kind}/${verificationStatus} is accepted with an unverified warning`, () => {
    const data = fresh()
    data.knowledgePoints[0].source = { pages: [], sections: [], kind, verificationStatus, note: '' }
    const result = assertValid(validatePaperPackage(data), data)
    assert.ok(result.warnings.some((message) => /核实/.test(message)))
  })
}

test('a complete standard-size, located package can validate without warnings', () => {
  const data = fresh()
  data.paper.authors = ['Test Author']
  data.paper.year = 2026
  data.paper.journal = 'Test Journal'
  data.sections[0].sourcePages = [1]
  data.sections[0].source = locatedSource([1])
  for (let index = data.knowledgePoints.length; index < 8; index++) {
    data.knowledgePoints.push({ ...structuredClone(data.knowledgePoints[0]), id: `extra_knowledge_${index}`, prerequisites: [] })
  }
  for (let index = 0; data.knowledgeRelations.length < 10; index++) {
    data.knowledgeRelations.push({ source: data.knowledgePoints[index % 8].id, target: data.knowledgePoints[(index + 1) % 8].id, relationship: index < 8 ? 'related' : 'component', explanation: 'Synthetic test relationship.' })
  }
  for (let index = data.glossary.length; index < 12; index++) {
    data.glossary.push({ ...structuredClone(data.glossary[0]), id: `extra_glossary_${index}` })
  }
  for (let index = data.questions.length; index < 10; index++) {
    const question = structuredClone(data.questions[0])
    question.id = `extra_question_${index}`
    question.options.forEach((option, optionIndex) => { option.id = `extra_question_${index}_option_${optionIndex}` })
    data.questions.push(question)
  }
  assert.deepEqual(assertValid(validatePaperPackage(data), data).warnings, [])
})

for (const name of ['paper-package.json', 'PAPER-PACKAGE.JSON']) {
  test(`Node File imports ${name}`, async () => {
    const file = new File([exampleText], name, { type: 'application/json' })
    assertValid(await readPaperPackageFile(file), example)
  })
}

test('valid .json does not require a browser-supplied MIME type', async () => {
  assertValid(await readPaperPackageFile(new File([exampleText], 'package.json')), example)
})

test('file exactly 5 MiB in UTF-8 bytes is accepted', async () => {
  const padding = MAX_PAPER_FILE_BYTES - Buffer.byteLength(exampleText, 'utf8')
  assert.ok(Buffer.byteLength(exampleText, 'utf8') > exampleText.length, 'Fixture must exercise multibyte byte counting')
  const file = new File([exampleText, ' '.repeat(padding)], 'exact-limit.json', { type: 'application/json' })
  assert.equal(file.size, 5 * 1024 * 1024)
  assertValid(await readPaperPackageFile(file), example)
})

test('file one byte over 5 MiB is rejected before reading', async () => {
  let reads = 0
  class MustNotReadFile extends File {
    async text() { reads++; throw new Error('Oversized file should not be read') }
  }
  const padding = MAX_PAPER_FILE_BYTES + 1 - Buffer.byteLength(exampleText, 'utf8')
  const file = new MustNotReadFile([exampleText, ' '.repeat(padding)], 'over-limit.json')
  assert.equal(file.size, 5 * 1024 * 1024 + 1)
  assertInvalid(await readPaperPackageFile(file), undefined, /5.*1024/)
  assert.equal(reads, 0)
})

for (const name of ['paper.PDF', 'paper.txt', 'paper.json.PDF', 'paper', 'paper.json.exe']) {
  test(`reject non-JSON extension ${name} before reading`, async () => {
    let reads = 0
    class MustNotReadFile extends File {
      async text() { reads++; throw new Error('Non-JSON file should not be read') }
    }
    const file = new MustNotReadFile([exampleText], name, { type: 'application/json' })
    assertInvalid(await readPaperPackageFile(file), undefined, /\.json/)
    assert.equal(reads, 0)
  })
}

test('PDF bytes renamed to .json fail JSON parsing', async () => {
  const file = new File(['%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj'], 'renamed.json', { type: 'application/pdf' })
  assertInvalid(await readPaperPackageFile(file), undefined, /JSON/)
})

test('invalid JSON file reports a parse error, not a file-read error', async () => {
  assertInvalid(await readPaperPackageFile(new File(['{"paper":'], 'broken.json')), undefined, /JSON/)
})

test('empty JSON file reports a parse error', async () => {
  assertInvalid(await readPaperPackageFile(new File([], 'empty.json')), undefined, /JSON/)
})

test('BOM-prefixed Node File imports successfully', async () => {
  assertValid(await readPaperPackageFile(new File(['\uFEFF', exampleText], 'bom.json')), example)
})

test('file read failure returns a clear error without rejecting the promise', async () => {
  class UnreadableFile extends File {
    async text() { throw new Error('Simulated EACCES') }
  }
  let result
  await assert.doesNotReject(async () => { result = await readPaperPackageFile(new UnreadableFile([exampleText], 'unreadable.json')) })
  assertInvalid(result, undefined, /读取|权限/)
})

for (const file of [null, undefined]) {
  test(`missing File ${file} returns a clear error`, async () => {
    assertInvalid(await readPaperPackageFile(file), undefined, /\.json/)
  })
}

test('file import propagates existingIds and rejects built-in p1', async () => {
  const data = fresh()
  data.paper.id = 'p1'
  const file = new File([JSON.stringify(data)], 'duplicate.json')
  assertInvalid(await readPaperPackageFile(file, ['p1']), 'paper.id', /重复/)
})

// Use actual JSON own-properties: assigning obj.__proto__ would test the test
// setup rather than hostile JSON input. No DOM/browser execution is asserted.
for (const path of ['', 'paper', 'knowledgePoints.0.source', 'questions.0.options.0']) {
  for (const key of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
    test(`hostile unknown JSON field ${displayPath(path ? `${path}.${key}` : key)} fails without prototype pollution`, () => {
      const before = Object.getOwnPropertyDescriptors(Object.prototype)
      const data = fresh()
      const payload = key === 'constructor' ? { prototype: { paperImportPolluted: true } } : { paperImportPolluted: true }
      Object.defineProperty(at(data, path), key, { value: payload, enumerable: true })
      const text = JSON.stringify(data)
      assert.ok(text.includes(`"${key}":`), 'Payload must include an own JSON field')
      let result
      assert.doesNotThrow(() => { result = parsePaperPackage(text) })
      assertInvalid(result, displayPath(path ? `${path}.${key}` : key))
      assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before)
      assert.equal(({}).paperImportPolluted, undefined)
    })
  }
}

test('hostile matching-answer keys fail reference validation without prototype pollution', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype)
  const data = fresh()
  data.methodLab[0].answer = JSON.parse('{"__proto__":"example_match_parse","constructor":"example_match_exists"}')
  assertInvalid(parsePaperPackage(JSON.stringify(data)), 'methodLab[0].answer')
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before)
  assert.equal(({}).paperImportPolluted, undefined)
})

test('JSON-escaped HTML and script remain unchanged plain strings during import', () => {
  const data = fresh()
  const marker = '__paperImportScriptProbe'
  assert.equal(Object.hasOwn(globalThis, marker), false)
  const text = '<script>globalThis.__paperImportScriptProbe = true</script><img src=x onerror="globalThis.__paperImportScriptProbe = true">'
  data.paper.abstract = text
  data.sections[0].detailedContent = text
  data.questions[0].options[0].text = text
  const escaped = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')
  assert.ok(escaped.includes('\\u003cscript\\u003e'))
  const result = assertValid(parsePaperPackage(escaped), data)
  assert.equal(result.data.paper.abstract, text)
  assert.equal(typeof result.data.sections[0].detailedContent, 'string')
  assert.equal(Object.hasOwn(globalThis, marker), false)
})

test('JavaScript expressions are rejected as JSON rather than evaluated', () => {
  const marker = '__paperImportExpressionProbe'
  assert.equal(Object.hasOwn(globalThis, marker), false)
  const expression = '(() => { globalThis.__paperImportExpressionProbe = true; return {}; })()'
  assertInvalid(parsePaperPackage(expression), undefined, /JSON/)
  assert.equal(Object.hasOwn(globalThis, marker), false)
})
