import { useState } from 'react'
import Icon from '../components/ui/Icon.jsx'
import { navigate } from '../hooks/useHashRoute.js'
import { analysisSteps, paperAnalysisPrompt, PAPER_PACKAGE_VERSION, PROMPT_FILE_STEM } from '../data/paperAnalysisPrompt.js'

export default function PaperAnalysisGuide() {
  const [feedback, setFeedback] = useState(null)
  const [copying, setCopying] = useState(false)

  const copyPrompt = async () => {
    setCopying(true)
    setFeedback(null)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(paperAnalysisPrompt)
      setFeedback({ kind: 'success', text: '完整提示词已复制，可以与论文 PDF 一起交给其他 AI Agent。' })
    } catch {
      setFeedback({ kind: 'error', text: '复制失败：请在 HTTPS 或 localhost 下允许剪贴板权限；也可选中完整提示词手动复制，或下载文件。' })
    } finally {
      setCopying(false)
    }
  }

  const downloadPrompt = (extension) => {
    let url
    let link
    setFeedback(null)
    try {
      const type = extension === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8'
      url = URL.createObjectURL(new Blob([paperAnalysisPrompt], { type }))
      link = document.createElement('a')
      link.href = url
      link.download = `${PROMPT_FILE_STEM}.${extension}`
      document.body.appendChild(link)
      link.click()
      setFeedback({ kind: 'success', text: `已发起 ${extension === 'txt' ? 'TXT' : 'Markdown'} 下载，请在浏览器下载列表确认；文件内容与页面提示词完全一致。` })
    } catch {
      setFeedback({ kind: 'error', text: '下载失败：浏览器未能创建或发起文件下载，请重试或使用复制完整提示词。' })
    } finally {
      link?.remove()
      // 延后释放，避免浏览器尚未读取 Blob 就取消下载。
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
  }

  return (
    <div className="page guide-page">
      <section className="card card-pad guide-hero">
        <div className="hero-eyebrow"><Icon name="spark" size={14} /> PAPERPILOT · AI READING GUIDE</div>
        <h1 className="map-title">AI 论文拆解指南</h1>
        <p className="card-sub map-desc">使用 PaperPilot 标准提示词，将科研论文转化为可学习、可测试、可探索的互动课程。</p>
        <div className="guide-badges">
          <span className="badge badge-blue">官方模板 · v{PAPER_PACKAGE_VERSION}</span>
          <span className="badge badge-cyan">无需 API Key</span>
          <span className="badge badge-navy">复制与下载均在本地完成</span>
        </div>
        <p className="guide-boundary">
          <Icon name="book" size={18} />
          <span>本网站不直接调用 AI，也不会上传你的论文。请借助 ChatGPT、Qoder 或其他 AI Agent 完成拆解，分享 PDF 前确认版权、隐私及对方的数据政策。</span>
        </p>
      </section>

      <section className="guide-workflow" aria-labelledby="guide-steps-title">
        <div className="card-head">
          <h2 id="guide-steps-title" className="card-title"><span className="title-icon"><Icon name="plane" size={18} /></span>A · 五步完成论文准备</h2>
          <span className="card-sub">从 PDF 到可复核的数据包</span>
        </div>
        <ol className="guide-steps">
          {analysisSteps.map((step, index) => (
            <li className="card guide-step" key={step.title}>
              <div className="guide-step-top"><span className="guide-step-number">0{index + 1}</span><Icon name={step.icon} size={20} /></div>
              <h3>{step.title}</h3>
              <p className="card-sub">{step.text}</p>
              {index === 4 && <span className="badge badge-green">先预览，再确认</span>}
            </li>
          ))}
        </ol>
      </section>

      <div className="guide-layout">
        <section className="card guide-template" aria-labelledby="guide-template-title">
          <div className="card-pad guide-template-header">
            <div className="card-head">
              <h2 id="guide-template-title" className="card-title"><span className="title-icon"><Icon name="reader" size={18} /></span>B · 官方提示词模板</h2>
              <span className="badge badge-blue">全文 · {paperAnalysisPrompt.length.toLocaleString()} 字符</span>
            </div>
            <p className="card-sub">包含完整字段规范、结构示意和自检清单。请复制全部内容，不要只截取摘要；下方可滚动阅读、选择文字。</p>
          </div>
          <pre className="guide-prompt" tabIndex={0} aria-label="完整官方提示词">{paperAnalysisPrompt}</pre>
        </section>

        <aside className="card card-pad guide-actions" aria-labelledby="guide-actions-title">
          <h2 id="guide-actions-title" className="card-title"><span className="title-icon"><Icon name="download" size={18} /></span>C · 获取完整提示词</h2>
          <p className="card-sub">两种下载格式和复制内容完全相同，按你的 AI 工具使用习惯选择。</p>
          <div className="guide-action-buttons">
            <button className="btn btn-primary" data-guide-action="copy" onClick={copyPrompt} disabled={copying}>
              <Icon name="copy" size={16} />{copying ? '正在复制…' : '复制完整提示词'}
            </button>
            <button className="btn btn-ghost" data-guide-action="txt" onClick={() => downloadPrompt('txt')}><Icon name="download" size={16} />下载 TXT 格式提示词</button>
            <button className="btn btn-ghost" data-guide-action="md" onClick={() => downloadPrompt('md')}><Icon name="download" size={16} />下载 Markdown 格式提示词</button>
          </div>
          <div className="guide-feedback" role="status" aria-live="polite" aria-atomic="true">
            {feedback && <p className={feedback.kind === 'error' ? 'guide-error' : 'guide-success'}>{feedback.text}</p>}
          </div>
          <div className="guide-import-note">
            <span className="badge badge-green">本地论文包导入</span>
            <p className="card-sub">仅支持 schemaVersion: "1.0" 的单个 JSON，最大 5MB；选择文件后先验证和预览，确认后才写入本地。学习档案备份不是论文包。</p>
            <button className="btn btn-ghost" data-guide-action="import" onClick={() => navigate('paper-import')}><Icon name="upload" size={16} />前往论文导入页面</button>
          </div>
          <p className="card-sub guide-contract-note">输出约定：<code>paper-package.json</code> · v{PAPER_PACKAGE_VERSION}。统一封装论文、知识点、关系、术语、测试题和方法练习；AI 生成后仍需人工复核。</p>
        </aside>
      </div>
    </div>
  )
}
