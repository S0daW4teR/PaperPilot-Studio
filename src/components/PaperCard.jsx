import Icon from './ui/Icon.jsx'
import PaperPackageDownload from './PaperPackageDownload.jsx'

const STATUS_META = {
  'not-started': { label: '未开始', cls: 'badge-navy' },
  learning: { label: '学习中', cls: 'badge-blue' },
  done: { label: '已完成', cls: 'badge-green' },
}

export default function PaperCard({ paper, status, masteredCount, fav, onOpen, onToggleFav }) {
  const meta = STATUS_META[status] ?? STATUS_META['not-started']
  const imported = paper.source === 'imported'
  return (
    <article className={`card lib-card${paper.demo ? ' demo' : ''}${imported ? ' imported' : ''}`}>
      <div className="lib-card-top">
        <span className={`badge ${paper.demo ? 'badge-amber' : 'badge-green'}`}>
          {imported ? '用户导入' : paper.demo ? '演示案例' : '真实开放获取'}
        </span>
        <span className={`badge ${meta.cls}`}>{meta.label}</span>
        <button
          className={`fav-btn icon-only${fav ? ' on' : ''}`}
          onClick={onToggleFav}
          aria-pressed={fav}
          title={fav ? '取消收藏' : '收藏本篇'}
        >
          <Icon name="star" size={15} />
        </button>
      </div>
      <h3 className="lib-title"><a href={`#/${imported ? 'imported-paper' : 'reader'}?paperId=${encodeURIComponent(paper.id)}`}>{paper.title}</a></h3>
      <p className="lib-authors">
        {paper.authors?.length ? paper.authors.join(' · ') : imported ? '作者未提供 / 待核实' : '演示案例 · 未提供真实作者 / 期刊 / DOI'}
        {paper.publication ? ` · ${[paper.publication.journal, paper.publication.volume, paper.publication.articleNumber].filter((value) => value != null).join(' · ')}` : ''}
      </p>
      <div className="paper-meta lib-meta">
        <span className="badge badge-navy">{paper.demo ? '未发表 · 演示案例' : paper.year === null ? '年份未提供' : `${paper.year} 年`}</span>
        {paper.researchField.slice(0, 3).map((f) => (
          <span className="badge badge-blue" key={f}>{f}</span>
        ))}
        <span className="badge badge-cyan">{paper.paperType}</span>
        <span className={`badge ${paper.difficulty === '入门' ? 'badge-green' : 'badge-amber'}`}>{paper.difficulty}</span>
      </div>
      <p className="lib-intro">{paper.intro}</p>
      <div className="lib-foot">
        <span className="lib-mastered" title="已理解章节挂载的知识节点数">
          <Icon name="nodes" size={14} />
          {imported ? '本阶段提供只读学习' : `已掌握 ${masteredCount} 个知识点`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={onOpen}>
          {imported ? '开始学习' : status === 'not-started' ? '开始阅读' : status === 'done' ? '回顾' : '继续阅读'}
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
      {imported && <PaperPackageDownload paperId={paper.id} />}
    </article>
  )
}