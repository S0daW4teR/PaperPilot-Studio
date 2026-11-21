export const PAPER_PACKAGE_VERSION = '1.0'
export const MAX_PAPER_FILE_BYTES = 5 * 1024 * 1024

const text = { type: 'string' }
const nonempty = { type: 'string', minLength: 1 }
const nullableText = { type: ['string', 'null'] }
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' }
const strings = { type: 'array', items: nonempty, uniqueItems: true }
const ids = { type: 'array', items: id, uniqueItems: true }
const difficulty = { type: 'integer', minimum: 1, maximum: 3 }
const pages = { type: 'array', items: { type: 'integer', minimum: 1 }, uniqueItems: true }
const object = (properties, optional = []) => ({ type: 'object', properties, required: Object.keys(properties).filter((key) => !optional.includes(key)), additionalProperties: false })
const array = (items, minItems = 0) => ({ type: 'array', items, minItems })

export const sourceSchema = object({
  pages,
  sections: strings,
  kind: { enum: ['paper_fact', 'teaching_extension', 'paper_fact_plus_teaching', 'unverified'] },
  verificationStatus: { enum: ['located', 'pending', 'not_applicable'] },
  note: text,
})

export const paperPackageSchema = object({
  schemaVersion: { const: PAPER_PACKAGE_VERSION },
  paper: object({
    id, title: nonempty, authors: strings,
    year: { type: ['integer', 'null'], minimum: 1000, maximum: 9999 },
    journal: nullableText, doi: nullableText, originalUrl: nullableText,
    field: { ...strings, minItems: 1 }, paperType: nonempty,
    difficulty: { enum: ['入门', '进阶', '高级'] },
    abstract: nonempty, license: nullableText, keywords: strings,
    source: sourceSchema, verificationNotes: strings,
  }, ['source', 'verificationNotes']),
  sections: array(object({
    id, title: nonempty, order: { type: 'integer', minimum: 1 }, summary: nonempty,
    detailedContent: text, sourcePages: pages, relatedKnowledge: ids, source: sourceSchema,
  }, ['source']), 1),
  knowledgePoints: array(object({
    id, name: nonempty, category: nonempty, difficulty, prerequisites: ids,
    explanation: nonempty, simpleExplanation: text, learningObjectives: strings,
    example: text, source: sourceSchema,
  }), 1),
  knowledgeRelations: array(object({
    source: id, target: id,
    relationship: { enum: ['prerequisite', 'component', 'application', 'related'] },
    explanation: nonempty, evidence: sourceSchema,
  }, ['evidence'])),
  glossary: array(object({ id, term: nonempty, abbreviation: text, definition: nonempty, simpleExplanation: text, relatedKnowledge: { ...ids, minItems: 1 }, source: sourceSchema }, ['source'])),
  questions: array(object({
    id, type: { enum: ['single_choice', 'true_false'] }, question: nonempty,
    options: array(object({ id, text: nonempty }), 2), answer: nonempty,
    explanation: nonempty, relatedKnowledge: { ...ids, minItems: 1 }, difficulty, source: sourceSchema,
  }, ['source'])),
  methodLab: array(object({
    id, title: nonempty, description: nonempty,
    type: { enum: ['matching', 'ordering', 'scenario_judgment'] }, question: nonempty,
    items: array(object({ id, label: nonempty }), 1),
    options: array(object({ id, label: nonempty }), 2),
    answer: { type: ['string', 'array', 'object'] }, explanation: nonempty,
    relatedKnowledge: { ...ids, minItems: 1 }, source: sourceSchema,
  }, ['items', 'source'])),
})
