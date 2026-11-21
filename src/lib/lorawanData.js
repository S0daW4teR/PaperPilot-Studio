import paper from '../data/lorawan/paper.json'
import knowledge from '../data/lorawan/knowledge.json'
import relations from '../data/lorawan/knowledgeRelations.json'
import glossary from '../data/lorawan/glossary.json'
import questions from '../data/lorawan/questions.json'
import methodLab from '../data/lorawan/methodLab.json'
import { buildAll } from './lorawanAdapter.js'

/* 用户预置 LoRaWAN 教学数据（src/data/lorawan/，与桌面原始文件逐字节一致） */
export const L = buildAll({ paper, knowledge, relations, glossary, questions, methodLab })