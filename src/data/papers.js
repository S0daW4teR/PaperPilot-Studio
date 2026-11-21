/* 论文目录：真实开放获取论文 + 项目预置演示教学案例。
   演示案例沿用 papers.json（自带虚构声明），不提供真实作者/期刊/DOI。 */
import papersData from './papers.json'
import { L } from '../lib/lorawanData.js'

const DEMO_KEYWORDS = {
  p1: ['LoRa', '农田监测', '低功耗', '土壤湿度', '休眠调度', '环境监测'],
  p2: ['PMSM', '永磁同步电机', '无位置传感器', '反电动势', '滑模观测器', 'FOC'],
  p3: ['卡尔曼滤波', '室内定位', 'RSSI', '状态估计', '精度优化'],
}

const realPaper = {
  ...L.paper,
  demo: false,
  paperType: '系统性文献综述',
  difficulty: '入门',
  researchField: L.paper.researchField.map((f) => f.replace(/\s*[（(].*[）)]$/, '')),
  keywords: [...L.paper.researchField, 'LoRaWAN', 'LPWAN', 'sensors', 'applications', '综述', '物联网'],
  intro: `${L.paper.sections[0].professionalSummary.slice(0, 88)}…`,
}

const demoPapers = papersData.papers.map((p) => ({
  id: p.id,
  title: p.title,
  authors: null,
  year: null,
  field: p.field,
  researchField: [p.field],
  paperType: '教学演示案例',
  difficulty: p.level,
  demo: true,
  keywords: DEMO_KEYWORDS[p.id] ?? [p.field],
  intro: p.abstract,
  abstract: p.abstract,
  sections: p.sections,
  publication: null,
  doi: null,
  license: null,
}))

export const catalog = [realPaper, ...demoPapers].map((paper) => ({ ...paper, source: 'built-in', createdAt: null, updatedAt: null }))
export const demoDisclaimer = '以下为教学编写的演示案例，标题、内容和实验数字均为虚构，不对应真实发表文献；仅用于练习论文结构与科研方法。'

export const LIBRARY_STATUSES = [
  { id: 'not-started', label: '未开始' },
  { id: 'learning', label: '学习中' },
  { id: 'done', label: '已完成' },
]