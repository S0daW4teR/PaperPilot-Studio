/* 第一阶段预置学习数据（本地数据，论文与知识节点见 papers.json / knowledge.json） */

export const weeklyGoalMinutes = 300

export const labStats = { done: 5, total: 12 }

export const quizScores = [
  { name: '论文结构识别', score: 82, date: '今天 14:20', tag: '结构' },
  { name: '研究方法判断', score: 74, date: '周六 16:02', tag: '方法' },
  { name: '实验图表解读', score: 78, date: '上周四 20:15', tag: '图表' },
]

export const activities = [
  { text: '完成测验「论文结构识别」，得分 82', time: '今天 14:20', tone: 'green' },
  { text: '在知识地图点亮节点「LoRaWAN 网络基本架构」', time: '今天 13:05', tone: 'cyan' },
  { text: '拆解 LoRaWAN 综述的「研究方法」章节', time: '昨天 20:41', tone: '' },
  { text: '完成方法练习「研究流程排序」', time: '昨天 19:12', tone: 'green' },
  { text: '标记薄弱点：LoRaWAN 性能指标（RSSI / SNR / PDR）', time: '周六 16:30', tone: 'amber' },
]

export const onboardingSteps = [
  {
    id: 's1',
    title: '浏览论文案例',
    desc: '从预置的 LoRaWAN 系统性综述（真实开放获取论文）开始',
  },
  {
    id: 's2',
    title: '完成第一次结构拆解',
    desc: '按五段结构逐章理解论文在做什么',
  },
  {
    id: 's3',
    title: '点亮 5 个知识地图节点',
    desc: '把论文里的专业概念挂到知识地图上',
  },
  {
    id: 's4',
    title: '做一次科研能力小测',
    desc: '5 道题定位你当前的阅读能力短板',
  },
]

/* 各未完成模块的规划说明（占位页如实展示） */
export const modulePlans = {}