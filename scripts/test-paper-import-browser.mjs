import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const example = JSON.parse(await readFile(new URL('../src/data/paperPackageExample.json', import.meta.url), 'utf8'))

export async function testPaperImportBrowser({ p, page, send, evaluate, wait, click, route, check, capture, socket, browserContextId, output }) {
  const records = (target = p) => evaluate(target, `new Promise((resolve,reject)=>{ const r=indexedDB.open('paperpilot-papers',1); r.onerror=()=>reject(r.error); r.onsuccess=()=>{const db=r.result; const tx=db.transaction('papers','readonly'); const q=tx.objectStore('papers').getAll(); tx.oncomplete=()=>{db.close(); resolve(q.result.map(r=>({id:r.id, source:r.source, createdAt:r.createdAt, updatedAt:r.updatedAt, title:r.package.paper.title, contentLength:r.package.sections[0].detailedContent.length}))) }; tx.onabort=()=>reject(tx.error) } })`)
  const stableLearning = () => evaluate(p, `(() => { const s=JSON.parse(localStorage.getItem('paperpilot:learning')); return JSON.stringify({notes:s.notes,favorites:s.favorites,quizSessions:s.quizSessions,labResults:s.labResults,understood:s.understood,readingProgress:s.readingProgress}) })()`)
  const beforeLearning = await stableLearning()
  const beforeProfile = await evaluate(p, `localStorage.getItem('paperpilot:userProfile')`)
  let fileNumber = 0
  const upload = async (target, content, extension = 'json') => {
    await wait(target, 'document.querySelector(".import-file-input")?.disabled===false')
    const file = join(output, `import-${++fileNumber}.${extension}`)
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content))
    const { root } = await send('DOM.getDocument', {}, target.sessionId)
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '.import-file-input' }, target.sessionId)
    await send('DOM.setFileInputFiles', { nodeId, files: [file] }, target.sessionId)
  }
  const preview = (target = p) => wait(target, 'document.querySelector(".import-preview")')
  const rejectFile = async (name, content, expected, extension) => {
    await upload(p, content, extension)
    await wait(p, `document.querySelector('.import-errors')?.textContent.includes(${JSON.stringify(expected)})`)
    check(name, await evaluate(p, '!document.querySelector(".import-preview") && !document.querySelector(".import-success")'))
  }
  const clone = (id) => { const data = structuredClone(example); if (id) data.paper.id = id; return data }

  await route(p, 'library', '.lib-grid')
  await click(p, '.library-import-btn')
  await wait(p, 'document.querySelector(".paper-import-page")')
  check('论文库入口打开真实单文件 JSON 导入页', await evaluate(p, `location.hash==='#/paper-import' && document.querySelector('.import-file-input').accept.includes('.json') && !document.querySelector('.import-file-input').multiple`))
  check('首次打开导入页不创建论文记录', (await records()).length === 0)

  await rejectFile('语法错误显示明确 JSON 提示', '{bad json', 'JSON 格式错误')
  const missing = clone(); delete missing.paper.title
  await rejectFile('缺少标题显示精确字段路径', missing, '缺少 paper.title')
  const emptyId = clone(); emptyId.paper.id = ''
  await rejectFile('空论文 ID 被拒绝', emptyId, 'paper.id')
  const old = clone(); old.schemaVersion = 1
  await rejectFile('旧数字版本被拒绝并指向当前规范', old, 'schemaVersion 不受支持')
  const duplicateKnowledge = clone(); duplicateKnowledge.knowledgePoints[1].id = duplicateKnowledge.knowledgePoints[0].id
  await rejectFile('重复知识点 ID 被识别', duplicateKnowledge, 'knowledgePoints[1] 存在重复 ID')
  const badRelation = clone(); badRelation.knowledgeRelations[0].target = 'missing'
  await rejectFile('无效知识关系被识别', badRelation, 'knowledgeRelations[0] 引用了不存在的知识点')
  const badQuestion = clone(); badQuestion.questions[0].relatedKnowledge = ['missing']
  await rejectFile('无效题目知识关联被识别', badQuestion, 'questions[0].relatedKnowledge')
  const badTerm = clone(); badTerm.glossary[0].relatedKnowledge = ['missing']
  await rejectFile('无效术语知识关联被识别', badTerm, 'glossary[0].relatedKnowledge')
  const builtIn = clone('p1')
  await rejectFile('内置论文 ID 不能覆盖', builtIn, 'paper.id 重复')
  await rejectFile('PDF 扩展名即使含 JSON 也被拒绝', example, '仅支持 .json', 'pdf')
  await rejectFile('超过 5MiB 的文件在读取前被拒绝', ' '.repeat(5 * 1024 * 1024 + 1), '超过 5MB')
  check('所有失败上传均未写入本地论文库', (await records()).length === 0)

  await upload(p, example); await preview()
  check('合法上传仅展示预览，包含元信息及六类数量', await evaluate(p, `document.querySelector('.import-preview').textContent.includes('本地导入功能测试') && document.querySelectorAll('.import-counts > div').length===6 && document.querySelector('.import-preview').textContent.includes('导入测试') && document.querySelector('.import-preview').textContent.includes('尚未保存')`))
  check('预览状态没有持久化副作用', (await records()).length === 0)
  await capture(p, 'paper-import-preview-desktop')
  await click(p, '.import-preview .btn-ghost')
  await wait(p, '!document.querySelector(".import-preview")')
  check('取消预览清空选择且完全不写入数据', (await records()).length === 0 && await evaluate(p, `document.querySelector('.import-file-input').value===''`))
  await evaluate(p, `window.__fileText=File.prototype.text; File.prototype.text=function(){return new Promise(resolve=>window.__resolveFile=resolve)}`)
  await upload(p, example)
  await wait(p, 'document.querySelector(".import-cancel")')
  await click(p, '.import-cancel')
  await evaluate(p, `File.prototype.text=window.__fileText; window.__resolveFile(${JSON.stringify(JSON.stringify(example))})`)
  check('读取过程中取消后迟到结果不会恢复预览', await evaluate(p, '!document.querySelector(".import-preview")') && (await records()).length === 0)

  await upload(p, example); await preview()
  await evaluate(p, `window.__originalAdd=IDBObjectStore.prototype.add; IDBObjectStore.prototype.add=function(){throw new DOMException('测试空间不足','QuotaExceededError')}`)
  await click(p, '.import-confirm'); await wait(p, 'document.querySelector(".import-errors").textContent.includes("空间不足")')
  check('模拟空间不足时明确报错且没有不完整论文记录', (await records()).length === 0)
  await evaluate(p, `IDBObjectStore.prototype.add=function(value){const request=window.__originalAdd.call(this,value); this.transaction.abort(); return request}`)
  await click(p, '.import-confirm'); await wait(p, 'document.querySelector(".import-errors").textContent.includes("保存失败")')
  check('真正中止 IndexedDB 写入事务不会留下半份数据', (await records()).length === 0)
  await evaluate(p, 'IDBObjectStore.prototype.add=window.__originalAdd')
  await evaluate(p, `document.querySelector('.import-confirm').click(); document.querySelector('.import-confirm').click()`)
  await wait(p, 'document.querySelector(".import-success")')
  const first = await records()
  check('确认导入原子保存完整记录，重复点击只写入一次', first.length === 1 && first[0].id === example.paper.id && first[0].source === 'imported' && first[0].createdAt === first[0].updatedAt && Number.isFinite(Date.parse(first[0].createdAt)))
  check('导出数据访问接口还原原始规范内容', await evaluate(p, `import('/src/lib/paperRepository.js').then(m=>m.exportPaperPackage(${JSON.stringify(example.paper.id)})).then(data=>JSON.stringify(data)===${JSON.stringify(JSON.stringify(example))})`))
  await click(p, '.import-success .btn-primary'); await wait(p, 'document.querySelector(".lib-card.imported")')
  check('导入后 Library 立即增加并标记用户导入和成功提示', await evaluate(p, `document.querySelectorAll('.lib-card').length===5 && document.querySelector('.lib-card.imported').textContent.includes('用户导入') && document.querySelector('.lib-page .import-success').textContent.includes('导入成功') && document.querySelector('.nav-item[title="论文案例库"] .nav-badge').textContent==='5 篇'`))
  check('导入字段进入动态筛选，未知年份不冒充真实开放论文', await evaluate(p, `document.querySelector('[aria-label="按研究领域筛选"]').textContent.includes('导入测试') && document.querySelector('.lib-card.imported').textContent.includes('年份未提供') && !document.querySelector('.lib-card.imported').textContent.includes('真实开放获取')`))
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".lib-card.imported")')
  check('刷新后仍有原有四篇和独立保存的导入论文', await evaluate(p, `document.querySelectorAll('.lib-card').length===5 && document.querySelectorAll('.lib-card.demo').length===3`))
  await capture(p, 'paper-library-imported-desktop')
  await click(p, '.lib-card.imported .lib-foot .btn-primary')
  await wait(p, 'document.querySelector(".imported-paper-page .imported-section")')
  check('开始学习进入本篇真实导入内容，不借用预置训练数据', await evaluate(p, `document.querySelector('main h1').textContent===${JSON.stringify(example.paper.title)} && document.querySelector('.imported-content').textContent===${JSON.stringify(example.sections[0].detailedContent)} && document.querySelector('main').textContent.includes('深度接入将在下一阶段完成')`))
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".imported-section")')
  check('导入论文学习链接支持直接访问与刷新', await evaluate(p, 'document.querySelectorAll(".imported-section").length===1'))

  await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: output, browserContextId, eventsEnabled: true })
  let listener
  let timer
  const downloaded = new Promise((resolve, reject) => {
    let guid
    timer = setTimeout(() => reject(new Error('Paper export timeout')), 15000)
    listener = ({ data }) => {
      const event = JSON.parse(data)
      if (event.method === 'Browser.downloadWillBegin' && event.params.suggestedFilename === 'paper-package.json') guid = event.params.guid
      if (event.method === 'Browser.downloadProgress' && event.params.guid === guid) {
        if (event.params.state === 'completed') resolve(event.params.filePath ?? join(output, guid))
        if (event.params.state === 'canceled') reject(new Error('Paper export canceled'))
      }
    }
    socket.addEventListener('message', listener)
  })
  try {
    const [file] = await Promise.all([downloaded, click(p, '.package-download-btn')])
    check('实际下载的论文 JSON 与导入内容完全一致且可再次验证', JSON.stringify(JSON.parse(await readFile(file, 'utf8'))) === JSON.stringify(example))
  } finally { clearTimeout(timer); socket.removeEventListener('message', listener) }

  await route(p, 'paper-import', '.paper-import-page')
  await rejectFile('重复用户论文在预览前被拒绝', example, 'paper.id 重复')
  check('重复导入不会修改已有论文和时间戳', JSON.stringify(await records()) === JSON.stringify(first))
  await click(p, '.import-cancel')

  const race = clone('paper_browser_race')
  await upload(p, race); await preview()
  const q = await page('/#/paper-import')
  await upload(q, race); await preview(q)
  await Promise.all([evaluate(p, `document.querySelector('.import-confirm').click()`), evaluate(q, `document.querySelector('.import-confirm').click()`)])
  await wait(p, 'document.querySelector(".import-success") || document.querySelector(".import-errors")')
  await wait(q, 'document.querySelector(".import-success") || document.querySelector(".import-errors")')
  const wins = Number(await evaluate(p, '!!document.querySelector(".import-success")')) + Number(await evaluate(q, '!!document.querySelector(".import-success")'))
  check('两个标签同时确认相同 ID 只有一个事务成功', wins === 1 && (await records()).filter((r) => r.id === race.paper.id).length === 1)
  await route(p, 'library', '.lib-grid')
  await route(q, 'paper-import', '.paper-import-page')
  if (await evaluate(q, '!!document.querySelector(".import-cancel")')) await click(q, '.import-cancel')
  const synced = clone('paper_browser_sync'); synced.paper.title = '跨标签同步测试（虚构教学）'
  await upload(q, synced); await preview(q); await click(q, '.import-confirm')
  await wait(q, 'document.querySelector(".import-success")')
  await wait(p, 'document.querySelectorAll(".lib-card.imported").length===3')
  check('另一个标签导入后论文库通过通知立即更新', await evaluate(p, `document.querySelector('.lib-grid').textContent.includes('跨标签同步测试')`))
  await send('Target.closeTarget', { targetId: q.targetId }); await send('Page.bringToFront', {}, p.sessionId)

  await evaluate(p, `window.__dbTransaction=IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction=function(){throw new DOMException('测试读取不可用','UnknownError')}`)
  await evaluate(p, `window.dispatchEvent(new Event('focus'))`)
  await wait(p, 'document.querySelector(".lib-page .import-errors")')
  check('数据库读取失败时保留当前目录并明确提示，不伪造空库', await evaluate(p, `document.querySelectorAll('.lib-card').length===7 && document.querySelector('.import-errors').textContent.includes('读取失败')`))
  await evaluate(p, 'IDBDatabase.prototype.transaction=window.__dbTransaction')
  await click(p, '.lib-page .import-errors button'); await wait(p, '!document.querySelector(".lib-page .import-errors")')

  const large = clone('paper_browser_large'); large.paper.title = '大内容持久化测试（虚构教学）'; large.sections[0].detailedContent = '教学测试内容。'.repeat(160000)
  await route(p, 'paper-import', '.paper-import-page'); await upload(p, large); await preview()
  await click(p, '.import-confirm'); await wait(p, 'document.querySelector(".import-success")')
  check('超过 3MB 的合法完整正文使用 IndexedDB 保存而非 localStorage', Buffer.byteLength(JSON.stringify(large)) > 3 * 1024 * 1024 && (await records()).find((r) => r.id === large.paper.id).contentLength === large.sections[0].detailedContent.length && await evaluate(p, `!Object.keys(localStorage).some(k=>k.includes('paper_browser_large'))`))
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".import-file-input")?.disabled===false')
  check('大论文刷新后仍完整存在', (await records()).find((r) => r.id === large.paper.id).contentLength === large.sections[0].detailedContent.length)

  const escaped = clone('paper_browser_escaped'); escaped.paper.title = '<img src=x onerror=alert(1)>（虚构安全测试）'
  await upload(p, escaped); await preview()
  check('导入标题以纯文本预览，不执行 HTML', await evaluate(p, `document.querySelector('.import-paper-title').textContent.includes('<img') && !document.querySelector('.import-preview img')`))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, p.sessionId)
  await wait(p, 'document.querySelector(".sidebar").getBoundingClientRect().right<=0.1')
  await evaluate(p, `document.querySelector('.import-preview').scrollIntoView({block:'start'})`)
  check('移动端导入预览、错误区域和确认操作无横向溢出', await evaluate(p, 'document.documentElement.scrollWidth<=innerWidth'))
  await capture(p, 'paper-import-preview-mobile')
  await click(p, '.import-confirm'); await wait(p, 'document.querySelector(".import-success")')
  await click(p, '.import-start'); await wait(p, 'document.querySelector(".imported-section")')
  check('移动端开始学习保持本篇内容且恶意标签不执行', await evaluate(p, `document.documentElement.scrollWidth<=innerWidth && !document.querySelector('main h1 img') && document.querySelector('.imported-content').textContent===${JSON.stringify(escaped.sections[0].detailedContent)}`))
  await capture(p, 'paper-imported-learning-mobile')
  check('所有导入操作保留旧笔记、进度、成绩、收藏和个人资料', beforeLearning === await stableLearning() && beforeProfile === await evaluate(p, `localStorage.getItem('paperpilot:userProfile')`))
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, p.sessionId)
  await route(p, 'library', '.lib-grid')
  check('内置真实论文和三个演示案例始终未被覆盖', await evaluate(p, `document.querySelectorAll('.lib-card:not(.imported)').length===4 && document.querySelectorAll('.lib-card.demo').length===3 && document.querySelector('.lib-card:not(.imported)').textContent.includes('Systematic Literature Review')`))
}
