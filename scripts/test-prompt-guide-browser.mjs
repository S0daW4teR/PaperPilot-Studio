import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paperAnalysisPrompt, PROMPT_FILE_STEM } from '../src/data/paperAnalysisPrompt.js'

export async function testPromptGuideBrowser({ p, send, evaluate, wait, click, route, check, capture, socket, browserContextId, base, output }) {
  const origin = new URL(base).origin
  const remoteRequests = []
  const networkListener = ({ data }) => {
    const event = JSON.parse(data)
    if (event.method !== 'Network.requestWillBeSent' || event.sessionId !== p.sessionId) return
    const url = event.params.request.url
    if (/^https?:/.test(url) && new URL(url).origin !== origin) remoteRequests.push(url)
  }
  socket.addEventListener('message', networkListener)
  await send('Network.enable', {}, p.sessionId)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, p.sessionId)
  await wait(p, 'document.querySelector(".sidebar").getBoundingClientRect().left>=0')
  await click(p, '.nav-item[title="AI 论文拆解指南"]')
  await wait(p, 'document.querySelector(".guide-page")')
  check('指南可从侧栏进入，标题和活动路由正确', await evaluate(p, `location.hash==='#/ai-guide' && document.querySelector('main h1').textContent==='AI 论文拆解指南' && document.querySelector('.nav-item[aria-current=page]').title==='AI 论文拆解指南'`))
  check('完整提示词逐字展示，不是摘要或省略版本', await evaluate(p, `document.querySelector('.guide-prompt').textContent`) === paperAnalysisPrompt)
  check('五个步骤和四个操作按钮完整可见', await evaluate(p, `document.querySelectorAll('.guide-steps li').length===5 && document.querySelectorAll('[data-guide-action]').length===4`))
  check('明确说明本地导入、验证预览确认流程及学习备份的区别', await evaluate(p, `document.querySelector('.guide-boundary').textContent.includes('不直接调用 AI') && document.querySelector('.guide-import-note').textContent.includes('本地论文包导入') && document.querySelector('.guide-import-note').textContent.includes('仅支持 schemaVersion: "1.0" 的单个 JSON，最大 5MB；选择文件后先验证和预览，确认后才写入本地。学习档案备份不是论文包。') && document.querySelector('.guide-steps li:last-child').textContent.includes('先预览，再确认')`))
  await capture(p, 'ai-guide-desktop')
  await send('Page.reload', {}, p.sessionId)
  await wait(p, 'document.querySelector(".guide-prompt")')
  check('独立指南路由刷新后正常恢复全文', await evaluate(p, `location.hash==='#/ai-guide' && document.querySelector('.guide-prompt').textContent`) === paperAnalysisPrompt)

  await send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], browserContextId })
  await click(p, '[data-guide-action="copy"]')
  await wait(p, 'document.querySelector(".guide-feedback").textContent.includes("已复制")')
  const clipboard = await evaluate(p, 'navigator.clipboard.readText()')
  // Windows 剪贴板会将 LF 转换为 CRLF，仅归一化该平台换行差异。
  check('真实剪贴板内容完整一致（归一化 Windows 换行）', clipboard.replace(/\r\n/g, '\n') === paperAnalysisPrompt)
  check('复制成功后按钮恢复可用且反馈可被读屏读取', await evaluate(p, `!document.querySelector('[data-guide-action=copy]').disabled && document.querySelector('.guide-feedback').getAttribute('role')==='status'`))

  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output, browserContextId, eventsEnabled: true })
  const download = async (extension) => {
    const filename = `${PROMPT_FILE_STEM}.${extension}`
    let listener
    let timer
    const complete = new Promise((resolve, reject) => {
      let guid
      timer = setTimeout(() => reject(new Error(`Download timeout: ${filename}`)), 15000)
      listener = ({ data }) => {
        const event = JSON.parse(data)
        if (event.method === 'Browser.downloadWillBegin' && event.params.suggestedFilename === filename) guid = event.params.guid
        if (event.method !== 'Browser.downloadProgress' || event.params.guid !== guid) return
        if (event.params.state === 'completed') resolve()
        if (event.params.state === 'canceled') reject(new Error(`Download canceled: ${filename}`))
      }
      socket.addEventListener('message', listener)
    })
    try {
      await Promise.all([complete, click(p, `[data-guide-action="${extension}"]`)])
      return await readFile(join(output, filename), 'utf8')
    } finally {
      clearTimeout(timer)
      socket.removeEventListener('message', listener)
    }
  }
  const txt = await download('txt')
  check('TXT 文件实际完成下载且内容与模板逐字一致', txt === paperAnalysisPrompt)
  check('TXT 下载反馈不冒称磁盘保存已确认', await evaluate(p, `document.querySelector('.guide-feedback').textContent.includes('已发起 TXT 下载')`))
  const md = await download('md')
  check('Markdown 文件实际完成下载且与 TXT 和页面完全一致', md === txt && md === await evaluate(p, `document.querySelector('.guide-prompt').textContent`))
  check('下载未留下临时链接或修改提示词', await evaluate(p, `document.querySelectorAll('a[download]').length===0 && document.querySelector('.guide-feedback').textContent.includes('Markdown')`))

  await evaluate(p, `window.__guideWriteText=navigator.clipboard.writeText; navigator.clipboard.writeText=()=>new Promise((resolve,reject)=>{window.__rejectGuideCopy=reject})`)
  await click(p, '[data-guide-action="copy"]')
  check('复制等待期间禁用重复提交', await evaluate(p, `document.querySelector('[data-guide-action=copy]').disabled`))
  await evaluate(p, `window.__rejectGuideCopy(new DOMException('test permission denied','NotAllowedError'))`)
  await wait(p, 'document.querySelector(".guide-error")')
  check('剪贴板权限拒绝显示失败而非虚假成功', await evaluate(p, `document.querySelector('.guide-error').textContent.includes('复制失败') && !document.querySelector('[data-guide-action=copy]').disabled`))
  await evaluate(p, `navigator.clipboard.writeText=window.__guideWriteText; Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined})`)
  await click(p, '[data-guide-action="copy"]')
  await wait(p, 'document.querySelector(".guide-error")')
  check('不支持剪贴板时提供手动复制和下载说明', await evaluate(p, `document.querySelector('.guide-error').textContent.includes('手动复制') && document.querySelector('.guide-error').textContent.includes('下载')`))
  await evaluate(p, `delete navigator.clipboard; window.__guideCreateObjectURL=URL.createObjectURL; URL.createObjectURL=()=>{throw new Error('test download creation failure')}`)
  await click(p, '[data-guide-action="txt"]')
  await wait(p, 'document.querySelector(".guide-error").textContent.includes("下载失败")')
  check('无法创建下载文件时明确反馈错误', await evaluate(p, `!document.querySelector('.guide-success') && !document.querySelector('a[download]')`))
  await evaluate(p, `URL.createObjectURL=window.__guideCreateObjectURL; window.__guideAnchorClick=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){throw new Error('test download launch failure')}`)
  await click(p, '[data-guide-action="md"]')
  await wait(p, 'document.querySelector(".guide-error").textContent.includes("下载失败")')
  check('下载启动异常时移除临时链接并保留全文', await evaluate(p, `!document.querySelector('a[download]') && document.querySelector('.guide-prompt').textContent`) === paperAnalysisPrompt)
  await evaluate(p, `HTMLAnchorElement.prototype.click=window.__guideAnchorClick`)
  await click(p, '[data-guide-action="copy"]')
  await wait(p, 'document.querySelector(".guide-success")')
  check('权限恢复后可重试复制并清除旧错误', (await evaluate(p, 'navigator.clipboard.readText()')).replace(/\r\n/g, '\n') === paperAnalysisPrompt)

  await click(p, '[data-guide-action="import"]')
  await wait(p, 'document.querySelector(".paper-import-page")')
  check('论文导入按钮跳转到真实本地文件上传页', await evaluate(p, `location.hash==='#/paper-import' && !!document.querySelector('.paper-import-page input[type="file"][aria-label="选择论文 JSON 文件"]') && !!document.querySelector('.import-back-guide')`))
  await send('Page.reload', {}, p.sessionId)
  await wait(p, 'document.querySelector(".paper-import-page input[type=file]")')
  await click(p, '.import-back-guide')
  await wait(p, 'document.querySelector(".guide-page")')
  check('本地上传页可刷新并返回指南', await evaluate(p, `location.hash==='#/ai-guide'`))

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, p.sessionId)
  await wait(p, 'document.querySelector(".sidebar").getBoundingClientRect().right<=0.1')
  await evaluate(p, 'window.scrollTo(0,0)')
  await capture(p, 'ai-guide-mobile-steps')
  await evaluate(p, `document.querySelector('.guide-actions').scrollIntoView({block:'start'})`)
  check('移动端操作区和全文无水平溢出，按钮尺寸可触控', await evaluate(p, `document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('[data-guide-action]')].every(b=>b.getBoundingClientRect().width>=200 && b.getBoundingClientRect().height>=36) && document.querySelector('.guide-prompt').scrollWidth<=document.querySelector('.guide-prompt').clientWidth`))
  await capture(p, 'ai-guide-mobile-actions')
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }, p.sessionId)
  check('320px 窄屏长标题不与姓名重叠', await evaluate(p, `document.documentElement.scrollWidth<=innerWidth && document.querySelector('.crumb-current').getBoundingClientRect().right<=document.querySelector('.topbar-profile').getBoundingClientRect().left`))
  await evaluate(p, `const prompt=document.querySelector('.guide-prompt'); prompt.scrollTop=prompt.scrollHeight; prompt.scrollIntoView({block:'center'})`)
  check('键盘可聚焦完整提示词并滚动至最后一行', await evaluate(p, `(() => {const el=document.querySelector('.guide-prompt'); el.focus(); return document.activeElement===el && el.scrollTop+el.clientHeight>=el.scrollHeight-1 && el.textContent.endsWith('也不得将本提示词或说明文字混入 JSON 外部。')})()`))
  await capture(p, 'ai-guide-mobile-prompt')
  check('指南操作未发送外部 AI 或其他远程请求', remoteRequests.length === 0)
  socket.removeEventListener('message', networkListener)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, p.sessionId)
  await route(p, 'library', '.lib-grid')
}
