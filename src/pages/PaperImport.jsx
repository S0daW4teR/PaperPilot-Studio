import { useEffect, useRef, useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import PaperPackageDownload from '../components/PaperPackageDownload.jsx'
import example from '../data/paperPackageExample.json'
import { catalog } from '../data/papers.js'
import { PAPER_PACKAGE_VERSION } from '../data/paperPackageSchema.js'
import { readPaperPackageFile } from '../lib/paperPackageValidator.js'
import { usePaperRepository, refreshImportedPapers, importPaperPackage } from '../lib/paperRepository.js'
import { navigate } from '../hooks/useHashRoute.js'

export default function PaperImport() {
  const repository = usePaperRepository()
  const inputRef = useRef(null)
  const requestId = useRef(0)
  const committing = useRef(false)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filename, setFilename] = useState('')
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState(null)

  useEffect(() => () => { requestId.current++ }, [])

  const cancel = () => {
    requestId.current++
    setReading(false)
    setFilename('')
    setPreview(null)
    setErrors([])
    setSaved(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const token = ++requestId.current
    setReading(true)
    setPreview(null)
    setSaved(null)
    setErrors([])
    setFilename(file.name)
    const ids = [...catalog.map((paper) => paper.id), ...repository.records.map((record) => record.id)]
    const result = await readPaperPackageFile(file, ids)
    if (token !== requestId.current) return
    setReading(false)
    if (result.ok) setPreview(result)
    else setErrors(result.errors)
  }

  const confirm = async () => {
    if (!preview || committing.current) return
    committing.current = true
    setSaving(true)
    setErrors([])
    const token = requestId.current
    try {
      const result = await importPaperPackage(preview.data)
      if (token !== requestId.current) return
      if (result.ok) { setSaved(result.record); setPreview(null) }
      else setErrors([result.error])
    } finally {
      committing.current = false
      setSaving(false)
    }
  }

  return (
    <div className="page paper-import-page">
      <section className="card card-pad">
        <div className="hero-eyebrow"><Icon name="upload" size={14} /> PAPERPILOT · LOCAL PAPER IMPORT</div>
        <h1 className="map-title">导入一篇新论文</h1>
        <p className="card-sub map-desc">选择单个 paper-package.json，在本地完成验证和预览；只有点击「确认导入」后才保存到本浏览器。</p>
        <div className="guide-badges"><span className="badge badge-blue">schemaVersion: "{PAPER_PACKAGE_VERSION}"</span><span className="badge badge-cyan">最大 5MB · 仅 JSON</span><span className="badge badge-navy">不上传服务器</span></div>
        <p className="guide-boundary">当前支持论文库、备份导出与只读学习内容；PaperReader、知识地图、测验和实验的深度接入留到下一阶段。旧版嵌套数据包请使用新提示词重新生成，学习档案备份不是论文包。</p>
        <div className="import-tools">
          <button className="btn btn-ghost import-back-guide" onClick={() => navigate('ai-guide')}>获取 AI 论文拆解提示词</button>
          <PaperPackageDownload example={example} />
        </div>
      </section>

      <section className="card card-pad import-file-card" aria-labelledby="import-file-title">
        <h2 id="import-file-title" className="card-title"><Icon name="reader" size={18} />选择本地 JSON 文件</h2>
        <p className="card-sub">限制为 5 × 1024 × 1024 字节。文件扩展名必须为 .json；不能选择 PDF。本操作不会执行文件中的代码。</p>
        <input ref={inputRef} className="import-file-input" type="file" accept=".json,application/json" aria-label="选择论文 JSON 文件" onChange={chooseFile} disabled={saving || repository.status !== 'ready'} />
        <p className="card-sub" role="status">{reading ? `正在读取并验证 ${filename}…` : filename ? `已选择：${filename}` : repository.status === 'loading' ? '正在连接本地论文库…' : '尚未选择文件。'}</p>
        {repository.error && <div className="import-errors" role="alert"><p>{repository.error}</p><button className="btn btn-ghost btn-sm" onClick={refreshImportedPapers}>重试读取</button></div>}
        {repository.warning && <p className="import-warning">{repository.warning}</p>}
        {errors.length > 0 && <div className="import-errors" role="alert"><strong>无法导入，请检查以下问题</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
        {(filename || preview) && !saved && <button className="btn btn-ghost btn-sm import-cancel" onClick={cancel} disabled={saving}>取消导入</button>}
      </section>

      {preview && (
        <section className="card card-pad import-preview" aria-labelledby="import-preview-title">
          <div className="card-head"><h2 id="import-preview-title" className="card-title">导入预览</h2><span className="badge badge-green">结构验证通过 · 尚未保存</span></div>
          <h3 className="import-paper-title">{preview.data.paper.title}</h3>
          <dl className="import-metadata">
            <div><dt>论文 ID</dt><dd>{preview.data.paper.id}</dd></div>
            <div><dt>作者</dt><dd>{preview.data.paper.authors.join(' · ') || '未提供 / 待核实'}</dd></div>
            <div><dt>发表年份</dt><dd>{preview.data.paper.year ?? '未提供 / 待核实'}</dd></div>
            <div><dt>研究领域</dt><dd>{preview.data.paper.field.join(' · ')}</dd></div>
            <div><dt>论文类型</dt><dd>{preview.data.paper.paperType}</dd></div>
            <div><dt>难度</dt><dd>{preview.data.paper.difficulty}</dd></div>
          </dl>
          <div className="import-counts">
            {[['sections', '章节'], ['knowledgePoints', '知识点'], ['knowledgeRelations', '知识关系'], ['glossary', '专业术语'], ['questions', '测试题'], ['methodLab', '方法练习']].map(([key, label]) => <div key={key}><strong>{preview.data[key].length}</strong><span>{label}</span></div>)}
          </div>
          <p className="import-abstract">{preview.data.paper.abstract}</p>
          {preview.warnings.length > 0 && <div className="import-warning"><strong>导入前请注意</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <p className="card-sub">验证仅检查数据结构和关联，不证明作者、实验数据或结论真实。不会覆盖任何同 ID 论文，也不会改变个人资料或已有学习记录。</p>
          <div className="import-tools"><button className="btn btn-ghost" onClick={cancel} disabled={saving}>取消导入</button><button className="btn btn-primary import-confirm" onClick={confirm} disabled={saving}>{saving ? '正在保存…' : '确认导入'}</button></div>
        </section>
      )}

      {saved && <section className="card card-pad import-success" role="status">
        <h2 className="card-title"><Icon name="check" size={18} />导入成功</h2>
        <p>{saved.package.paper.title}</p><p className="card-sub">完整论文包已独立保存在本浏览器。请导出 JSON 作为备份，清除浏览器站点数据会删除本地论文。</p>
        <div className="import-tools"><button className="btn btn-primary" onClick={() => navigate('library', { imported: saved.id })}>查看论文库</button><button className="btn btn-ghost import-start" onClick={() => navigate('imported-paper', { paperId: saved.id })}>开始学习</button><button className="btn btn-ghost" onClick={cancel}>继续导入</button><PaperPackageDownload paperId={saved.id} /></div>
      </section>}
    </div>
  )
}
