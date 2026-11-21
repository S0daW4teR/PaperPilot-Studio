import Icon from '../components/ui/Icon.jsx'
import PaperPackageDownload from '../components/PaperPackageDownload.jsx'
import { usePaperRepository, refreshImportedPapers } from '../lib/paperRepository.js'
import { navigate } from '../hooks/useHashRoute.js'

export default function ImportedPaper({ paperId }) {
  const repository = usePaperRepository()
  const record = repository.records.find((item) => item.id === paperId)
  if (!record) return <div className="page imported-paper-page"><section className="card card-pad lib-empty">
    <h1 className="map-title">{repository.status === 'loading' ? '正在读取本地论文…' : '未找到导入论文'}</h1>
    <p className="card-sub">{repository.error || '请确认此论文已导入当前浏览器。不会替换为其他论文。'}</p>
    {repository.error && <button className="btn btn-ghost" onClick={refreshImportedPapers}>重试读取</button>}
    <button className="btn btn-primary" onClick={() => navigate('library')}>返回论文库</button>
  </section></div>
  const { paper, sections, knowledgePoints, knowledgeRelations, glossary, questions, methodLab } = record.package
  return (
    <div className="page imported-paper-page">
      <section className="card card-pad">
        <div className="card-head"><button className="btn btn-ghost btn-sm" onClick={() => navigate('library')}>返回论文库</button><span className="badge badge-blue">用户导入 · 只读学习内容</span></div>
        <h1 className="map-title import-paper-title">{paper.title}</h1>
        <p className="card-sub">{paper.authors.join(' · ') || '作者未提供'} · {paper.year ?? '年份未提供'} · {paper.journal || '期刊未提供'}</p>
        <div className="guide-badges">{paper.field.map((field) => <span key={field} className="badge badge-blue">{field}</span>)}<span className="badge badge-cyan">{paper.paperType}</span><span className="badge badge-navy">{paper.difficulty}</span></div>
        <p className="import-abstract">{paper.abstract}</p>
        <p className="guide-boundary">本阶段可阅读导入的章节内容并导出完整数据包；知识地图、测验、实验及章节掌握状态的深度接入将在下一阶段完成，不会用内置论文内容冒充本篇课程。</p>
        <p className="card-sub">已保存：{sections.length} 章 · {knowledgePoints.length} 个知识点 · {knowledgeRelations.length} 条关系 · {glossary.length} 个术语 · {questions.length} 道题 · {methodLab.length} 项练习</p>
        <div className="import-tools"><PaperPackageDownload paperId={record.id} /><span className="card-sub">导入于 {new Date(record.createdAt).toLocaleString()}</span></div>
      </section>
      {[...sections].sort((a, b) => a.order - b.order).map((section) => (
        <section className="card card-pad imported-section" key={section.id}>
          <h2 className="card-title"><Icon name="book" size={17} />{section.order}. {section.title}</h2>
          <p className="import-abstract">{section.summary}</p>
          <p className="imported-content">{section.detailedContent || '本节未提供详细正文。'}</p>
          <p className="card-sub">来源：{section.sourcePages.length ? `PDF 第 ${section.sourcePages.join('、')} 页` : '未提供页码，请人工核实'}{section.source?.note ? ` · ${section.source.note}` : ''}</p>
        </section>
      ))}
    </div>
  )
}
