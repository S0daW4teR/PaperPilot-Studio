import { useState } from 'react'
import Icon from './ui/Icon.jsx'
import { exportPaperPackage } from '../lib/paperRepository.js'

export default function PaperPackageDownload({ paperId, example }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    setMessage('')
    let url
    let link
    try {
      const data = example ?? await exportPaperPackage(paperId)
      url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }))
      link = document.createElement('a')
      link.href = url
      link.download = example ? 'paper-package.example.json' : 'paper-package.json'
      document.body.appendChild(link)
      link.click()
      setMessage('已发起 JSON 下载，请在浏览器下载列表确认。')
    } catch (error) {
      setMessage(`导出失败：${error.message}`)
    } finally {
      link?.remove()
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000)
      setBusy(false)
    }
  }
  return (
    <div className="package-download">
      <button className="btn btn-ghost btn-sm package-download-btn" onClick={download} disabled={busy}>
        <Icon name="download" size={15} />{busy ? '正在导出…' : example ? '下载测试 JSON（虚构示例）' : '导出此论文 JSON'}
      </button>
      <span className="card-sub" role="status">{message}</span>
    </div>
  )
}
