import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testPromptGuideBrowser } from './test-prompt-guide-browser.mjs'
import { testPaperImportBrowser } from './test-paper-import-browser.mjs'

const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173'
const executable = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const output = await mkdtemp(join(tmpdir(), 'paperpilot-browser-'))
const child = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(output, 'profile')}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket
let sequence = 0
const pending = new Map()
const errors = []
let passed = 0
const check = (name, value) => { assert.ok(value, name); console.log(`PASS ${name}`); passed++ }

try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = ''
    const timeout = setTimeout(() => reject(new Error('Browser launch timed out')), 15000)
    child.once('error', reject)
    child.stderr.on('data', (data) => {
      stderr += data
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const item = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) item?.reject(new Error(JSON.stringify(message.error)))
      else item?.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args)
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const evaluate = async (page, expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, page.sessionId)
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const wait = (page, expression) => evaluate(page, `new Promise((resolve,reject) => { const started = performance.now(); const timer = setInterval(() => { if (${expression}) { clearInterval(timer); resolve(true) } else if (performance.now() - started > 10000) { clearInterval(timer); reject(new Error('Condition timeout: ' + ${JSON.stringify(expression)})) } }, 25) })`)
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true })
  const clockScript = `(() => {
    const dateNow = Date.now.bind(Date), monoNow = performance.now.bind(performance), interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    let offset = 0; const ticks = new Map();
    Date.now = () => dateNow() + offset; Object.defineProperty(performance, 'now', { configurable: true, value: () => monoNow() + offset });
    window.setInterval = (fn, ms, ...args) => { const id = interval(fn, ms, ...args); if (ms === 15000) ticks.set(id, fn); return id };
    window.clearInterval = (id) => { ticks.delete(id); clear(id) };
    window.__advanceStudyClock = (ms) => { offset += ms; for (const tick of ticks.values()) tick() };
  })()`
  const page = async (path = '') => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const p = { targetId, sessionId }
    await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: clockScript }, sessionId)
    await send('Page.navigate', { url: base + path }, sessionId)
    await wait(p, 'document.querySelector("main h1")')
    return p
  }
  const click = async (p, selector) => {
    const point = await evaluate(p, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing selector'); element.scrollIntoView({block:'center'}); const r = element.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, p.sessionId)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }, p.sessionId)
  }
  const fill = async (p, selector, text) => {
    await click(p, selector)
    await evaluate(p, `document.querySelector(${JSON.stringify(selector)}).select()`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, p.sessionId)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, p.sessionId)
    if (text) await send('Input.insertText', { text }, p.sessionId)
  }
  const profileReady = (p) => wait(p, 'document.querySelector(".user-profile-dialog[open]") && document.querySelector(".user-profile-dialog").getAnimations().every(a=>a.playState==="finished")')
  const chooseGrade = (p, grade) => evaluate(p, `(() => { const el=document.querySelector('#profile-grade'); el.value=${JSON.stringify(grade)}; el.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  const route = async (p, path, selector) => {
    await evaluate(p, `location.hash=${JSON.stringify('/' + path)}`)
    await wait(p, `document.querySelector(${JSON.stringify(selector)})`)
  }
  const total = (p) => evaluate(p, `JSON.parse(localStorage.getItem('paperpilot:learning') || '{}').studySessions?.reduce((sum,r)=>sum+r.durationSeconds,0) ?? 0`)
  const capture = async (p, name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, p.sessionId)
    const path = join(output, name + '.png'); await writeFile(path, Buffer.from(shot.data, 'base64')); console.log(`SCREENSHOT ${path}`)
  }
  const p = await page()
  check('独立浏览器可见且新用户时长为 0 分钟', await evaluate(p, `document.visibilityState==='visible' && document.querySelector('.week-total').textContent==='0 分钟'`))
  check('新用户没有示例成绩或上周对比', await evaluate(p, `document.body.textContent.includes('暂无真实测试成绩') && document.body.textContent.includes('上周无学习记录')`))
  await profileReady(p)
  check('首次进入显示空白欢迎表单，不自动写入个人身份', await evaluate(p, `document.querySelector('#user-profile-title').textContent.includes('欢迎使用') && ['name','major','grade'].every(k=>document.querySelector('#profile-'+k).value==='') && localStorage.getItem('paperpilot:userProfile')===null`))
  check('年级包含六个要求选项，专业为自由文本输入', await evaluate(p, `JSON.stringify([...document.querySelector('#profile-grade').options].slice(1).map(o=>o.value))===JSON.stringify(['大一','大二','大三','大四','研究生','其他']) && document.querySelector('#profile-major').tagName==='INPUT'`))
  await capture(p, 'profile-welcome-desktop')
  await click(p, '.user-profile-form [type=submit]')
  check('原生表单验证阻止空姓名提交', await evaluate(p, `document.querySelector('#profile-name').validity.valueMissing && localStorage.getItem('paperpilot:userProfile')===null`))
  await fill(p, '#profile-name', '   '); await click(p, '.user-profile-form [type=submit]')
  await wait(p, 'document.querySelector("#user-profile-error")')
  check('纯空格姓名被拒绝并有明确提示', await evaluate(p, `document.querySelector('#user-profile-error').textContent.includes('空格') && localStorage.getItem('paperpilot:userProfile')===null`))
  await click(p, '.user-profile-form [type=button]'); await wait(p, '!document.querySelector("dialog[open]")')
  check('允许跳过且首页不显示编造的姓名专业年级', await evaluate(p, `localStorage.getItem('paperpilot:profileSetupSkipped')==='true' && localStorage.getItem('paperpilot:userProfile')===null && document.querySelector('.hero-desc').textContent.includes('尚未设置') && !document.body.textContent.includes('李同学')`))
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".hero-title")')
  check('跳过状态刷新后保留，不反复弹出欢迎', await evaluate(p, '!document.querySelector("dialog[open]")'))
  await click(p, '.topbar-profile'); await profileReady(p)
  await fill(p, '#profile-name', '  林悦  '); await fill(p, '#profile-major', '海洋机器人交叉工程'); await chooseGrade(p, '研究生')
  await click(p, '.user-profile-form [type=submit]'); await wait(p, '!document.querySelector("dialog[open]")')
  check('中文姓名和任意专业成功保存并显示明确反馈', await evaluate(p, `(() => { const u=JSON.parse(localStorage.getItem('paperpilot:userProfile')); return u.name==='林悦' && u.major==='海洋机器人交叉工程' && u.grade==='研究生' && new Date(u.updatedAt).toISOString()===u.updatedAt && document.querySelector('.profile-notice').textContent==='个人资料已保存。' })()`))
  check('Dashboard 和顶栏立即显示自定义信息及首字头像', await evaluate(p, `document.querySelector('.hero-title').textContent.includes('林悦') && document.querySelector('.hero-desc').textContent.includes('海洋机器人交叉工程 · 研究生') && document.querySelector('.topbar-profile-name').textContent==='林悦' && document.querySelector('.topbar-profile .topbar-avatar').textContent==='林'`))
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".hero-title")?.textContent.includes("林悦")')
  check('刷新后保留用户资料且不再次显示欢迎', await evaluate(p, `!document.querySelector('dialog[open]') && document.querySelector('.hero-desc').textContent.includes('研究生')`))
  await click(p, '.hero-actions button:nth-child(3)'); await profileReady(p)
  check('首页编辑入口预填已保存资料', await evaluate(p, `document.querySelector('#profile-name').value==='林悦' && document.querySelector('#profile-major').value==='海洋机器人交叉工程' && document.querySelector('#profile-grade').value==='研究生'`))
  await fill(p, '#profile-name', 'Alex Chen'); await fill(p, '#profile-major', '计算机科学与技术'); await chooseGrade(p, '大四')
  await click(p, '.user-profile-form [type=submit]'); await wait(p, '!document.querySelector("dialog[open]")')
  check('编辑英文姓名实时更新 Dashboard 和顶栏', await evaluate(p, `document.querySelector('.hero-title').textContent.includes('Alex Chen') && document.querySelector('.topbar-profile-name').textContent==='Alex Chen' && document.querySelector('.topbar-avatar').textContent==='A' && document.querySelector('.hero-desc').textContent.includes('计算机科学与技术 · 大四')`))
  await route(p, 'profile', '.user-profile-summary')
  check('学习档案展示同一份用户资料', await evaluate(p, `document.querySelector('.user-profile-summary').textContent.includes('Alex Chen') && document.querySelector('.user-profile-summary').textContent.includes('计算机科学与技术 · 大四')`))
  await click(p, '.user-profile-summary button'); await profileReady(p)
  await fill(p, '#profile-name', 'Cancelled Name'); await click(p, '.user-profile-form [type=button]')
  await wait(p, '!document.querySelector("dialog[open]")')
  check('取消编辑不改变已保存的信息', await evaluate(p, `JSON.parse(localStorage.getItem('paperpilot:userProfile')).name==='Alex Chen' && document.querySelector('.user-profile-summary').textContent.includes('Alex Chen')`))
  await click(p, '.topbar-profile'); await profileReady(p)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, p.sessionId)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, p.sessionId)
  await wait(p, '!document.querySelector("dialog[open]")')
  check('Escape 取消并将焦点还给编辑入口', await evaluate(p, `document.activeElement.classList.contains('topbar-profile') && document.body.style.overflow!== 'hidden'`))
  await click(p, '.topbar-profile'); await profileReady(p)
  await fill(p, '#profile-name', 'Unsaved Name')
  await evaluate(p, `window.__profileSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==='paperpilot:userProfile') throw new DOMException('测试存储配额','QuotaExceededError'); return window.__profileSetItem.call(this,key,value)}`)
  await click(p, '.user-profile-form [type=submit]'); await wait(p, 'document.querySelector("#user-profile-error")')
  check('保存失败保留草稿和旧资料，不显示虚假成功', await evaluate(p, `document.querySelector('#user-profile-error').textContent.includes('保存失败') && document.querySelector('#profile-name').value==='Unsaved Name' && JSON.parse(localStorage.getItem('paperpilot:userProfile')).name==='Alex Chen' && document.querySelector('.topbar-profile-name').textContent==='Alex Chen'`))
  await evaluate(p, 'Storage.prototype.setItem=window.__profileSetItem')
  await click(p, '.user-profile-form [type=button]'); await wait(p, '!document.querySelector("dialog[open]")')
  check('含个人资料的备份可通过现有导入校验', await evaluate(p, `import('/src/lib/learningStore.js').then(m=>{ const archive=m.exportArchive(); return archive.storage.userProfile.name==='Alex Chen' && m.validateArchive(archive).ok })`))
  await route(p, 'dashboard', '.hero-title')
  await capture(p, 'profile-dashboard-desktop')
  await click(p, '.hero-actions button:nth-child(2)'); await wait(p, 'document.querySelectorAll(".lib-card").length===4')
  check('论文库读取四篇独立数据，演示数据无伪造发表年份', await evaluate(p, `document.querySelectorAll('.lib-card').length===4 && [...document.querySelectorAll('.lib-card.demo')].every(c=>c.textContent.includes('未发表'))`))
  await capture(p, 'library-desktop')
  await click(p, '[aria-label="搜索论文"]'); await send('Input.insertText', { text: 'PMSM' }, p.sessionId)
  await wait(p, 'document.querySelectorAll(".lib-card").length===1')
  await evaluate(p, `(() => { for (const [label,value] of [['按研究领域筛选','电气工程'],['按论文类型筛选','教学演示案例'],['按难度筛选','进阶'],['按学习状态筛选','not-started']]) { const el=document.querySelector('[aria-label="'+label+'"]'); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})) } })()`)
  check('搜索与领域类型难度状态四筛选组合生效', await evaluate(p, `document.querySelectorAll('.lib-card').length===1 && document.querySelector('.lib-title').textContent.includes('永磁同步电机')`))
  await evaluate(p, `(() => { const el=document.querySelector('[aria-label="按难度筛选"]'); el.value='入门'; el.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await wait(p, 'document.querySelector(".lib-empty")')
  check('不匹配条件显示空状态而非虚构结果', await evaluate(p, `document.querySelectorAll('.lib-card').length===0`))
  await click(p, '.lib-empty button'); await wait(p, 'document.querySelectorAll(".lib-card").length===4')
  await click(p, '.lib-card:nth-child(2) .lib-title a'); await wait(p, 'document.querySelector(".reader-title")?.textContent.includes("农田")')
  check('标题进入正确论文 ID，实际打开阅读即学习中', await evaluate(p, `location.hash.includes('paperId=p1') && !!JSON.parse(localStorage.getItem('paperpilot:learning')).readingProgress.p1.startedAt`))
  await click(p, '.btn-understood'); await wait(p, 'document.querySelector(".btn-understood-done")')
  await click(p, '.toc-item:nth-of-type(2)'); await wait(p, 'document.querySelector(".section-title")?.textContent==="研究问题"')
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".section-title")?.textContent==="研究问题"')
  check('刷新保留对应论文、阅读位置和已理解章节', await evaluate(p, `JSON.parse(localStorage.getItem('paperpilot:learning')).understood.p1.includes('background') && location.hash.includes('paperId=p1')`))
  await route(p, 'reader?paperId=paper_lorawan_2023_8440', '.reader-title')
  await wait(p, 'document.querySelector(".reader-title")?.textContent.includes("Systematic")')
  check('同路由更换 ID 正确切换真实论文、元信息和知识点', await evaluate(p, `document.body.textContent.includes('Vicky Bonilla') && document.querySelectorAll('.reader-side .mastered-chip').length>0`))
  await route(p, 'reader?paperId=missing-paper', '.lib-empty')
  check('无效 ID 显示未找到，不替换论文', await evaluate(p, `document.querySelector('h1').textContent==='未找到这篇论文'`))
  await route(p, 'dashboard', '.week-total')
  await evaluate(p, `new Promise(resolve=>setTimeout(resolve,1300))`)
  await route(p, 'library', '.lib-grid')
  const realSeconds = await total(p)
  check('真实经过时间和路由切换产生正学习时长', realSeconds > 1)
  await route(p, 'dashboard', '.week-total')
  const before = await total(p)
  await evaluate(p, '__advanceStudyClock(61000)')
  await wait(p, 'document.querySelector(".week-total").textContent!=="0 分钟"')
  check('检查点累计实际时间差并更新周图表', (await total(p)) - before >= 60)
  await evaluate(p, `document.querySelector('.week-summary').closest('section').scrollIntoView({block:'center'})`)
  await wait(p, '[...document.querySelectorAll(".week-bar")].some(b=>b.style.height==="100%" && Math.abs(b.getBoundingClientRect().height-b.parentElement.clientHeight)<1)')
  await capture(p, 'dashboard-desktop')
  const beforeIdle = await total(p)
  await evaluate(p, '__advanceStudyClock(300000)')
  const afterIdle = await total(p)
  await evaluate(p, '__advanceStudyClock(60000)')
  check('五分钟空闲截止且不追加空闲时长（受控时钟）', afterIdle - beforeIdle <= 300.1 && Math.abs((await total(p)) - afterIdle) < 0.01)
  await click(p, '.hero-actions button:nth-child(2)'); await wait(p, 'document.querySelector(".lib-grid")')
  await evaluate(p, 'new Promise(resolve=>setTimeout(resolve,100))')
  await evaluate(p, '__advanceStudyClock(16000)')
  check('恢复真实输入后重新计时（受控时钟）', (await total(p)) > afterIdle + 15)
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".lib-grid")')
  check('刷新后持久化区间未丢失', (await total(p)) >= afterIdle)

  const q = await page('/#/dashboard')
  await send('Page.bringToFront', {}, q.sessionId)
  console.log('VISIBILITY', await evaluate(p, 'document.visibilityState'), await evaluate(q, 'document.visibilityState'))
  const locks = await evaluate(q, `navigator.locks.query().then(s=>s.held.filter(l=>l.name==='paperpilot:study-tracker').length)`)
  check('同一浏览器多个标签仅持有一个学习计时锁', locks===1)
  const hiddenBefore = await total(p)
  await evaluate(p, '__advanceStudyClock(16000)')
  check('切换至另一浏览器标签后原标签暂停计时', Math.abs((await total(p)) - hiddenBefore)<0.01)
  await click(q, '.topbar-profile'); await profileReady(q)
  await fill(q, '#profile-name', 'Alex Morgan')
  await click(q, '.user-profile-form [type=submit]'); await wait(q, '!document.querySelector("dialog[open]")')
  await wait(p, 'document.querySelector(".topbar-profile-name").textContent==="Alex Morgan"')
  check('另一标签修改资料后原标签自动同步', await evaluate(p, `document.querySelector('.topbar-profile-name').textContent==='Alex Morgan'`))
  await send('Target.closeTarget', { targetId: q.targetId })
  await send('Page.bringToFront', {}, p.sessionId)
  await wait(p, 'document.visibilityState==="visible"')

  for (const [path, selector] of [['dashboard','.week-total'],['library','.lib-grid'],['reader?paperId=p1','.reader-title'],['map','.map-page'],['lab','.lab-page'],['quiz','.quiz-page'],['profile','.profile-page']]) {
    await route(p, path, selector)
    check(`全站页面回归 ${path}`, await evaluate(p, '!!document.querySelector("main h1")'))
  }
  await route(p, 'reader?paperId=p1', '.reader-title')
  await click(p, '[aria-label="本节笔记输入"]')
  await send('Input.insertText', { text: '隔离浏览器测试笔记，不写入用户档案。' }, p.sessionId)
  await click(p, '.note-actions button')
  await wait(p, 'document.querySelector(".note-item")')
  check('章节笔记正常保存且不被计时覆盖', await evaluate(p, `JSON.parse(localStorage.getItem('paperpilot:learning')).notes.some(n=>n.text.includes('隔离浏览器'))`))
  const sections = await evaluate(p, 'document.querySelectorAll(".toc-item").length')
  for (let i = 1; i <= sections; i++) {
    await click(p, `.toc-item:nth-of-type(${i})`)
    if (await evaluate(p, '!document.querySelector(".btn-understood-done")')) await click(p, '.btn-understood')
  }
  await route(p, 'library', '.lib-grid')
  check('完成全部章节后论文库同步已完成与知识点数量', await evaluate(p, `document.querySelectorAll('.lib-card')[1].textContent.includes('已完成') && !document.querySelectorAll('.lib-card')[1].textContent.includes('已掌握 0 个')`))
  await route(p, 'lab', '.lab-page')
  const needs = await evaluate(p, 'document.querySelectorAll(".match-need").length')
  for (let i = 1; i <= needs; i++) await click(p, `.match-need:nth-child(${i}) .tech-chip`)
  await click(p, '.lab-actions .btn-primary'); await wait(p, 'document.querySelector(".lab-result")')
  check('方法实验室提交真实选择并保存成绩', await evaluate(p, `Object.keys(JSON.parse(localStorage.getItem('paperpilot:learning')).labResults).length===1`))
  await route(p, 'quiz', '.quiz-page'); await click(p, '.quiz-start-btn')
  for (let i = 0; i < 5; i++) {
    await wait(p, 'document.querySelector(".quiz-run-card .quiz-option:not(:disabled)")')
    await click(p, '.quiz-run-card .quiz-option'); await wait(p, 'document.querySelector(".quiz-feedback button")')
    await click(p, '.quiz-feedback button')
  }
  await wait(p, 'document.querySelector(".quiz-result")')
  check('能力测试完整五题评分与持久化正常', await evaluate(p, `JSON.parse(localStorage.getItem('paperpilot:learning')).quizSessions[0].picks.length===5`))
  await route(p, 'dashboard', '.week-total')
  check('Dashboard 只显示本次实际测试及练习记录', await evaluate(p, `document.querySelectorAll('.quiz-row').length===1 && document.querySelector('.timeline').textContent.includes('完成能力测试')`))
  await route(p, 'profile', '.profile-page')
  check('学习档案保留论文进度、笔记和测验成绩', await evaluate(p, `JSON.parse(localStorage.getItem('paperpilot:learning')).understood.p1.length===5 && document.body.textContent.includes('隔离浏览器测试笔记')`))
  await route(p, 'library', '.lib-grid')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, p.sessionId)
  await wait(p, 'document.querySelector(".sidebar").getBoundingClientRect().right<=0.1')
  check('移动端论文库无横向溢出', await evaluate(p, 'document.documentElement.scrollWidth<=innerWidth'))
  await capture(p, 'library-mobile')
  await click(p, '.topbar-profile'); await profileReady(p)
  await fill(p, '#profile-name', 'A'.repeat(80)); await fill(p, '#profile-major', '交叉学科'.repeat(30)); await chooseGrade(p, '其他')
  await capture(p, 'profile-edit-mobile')
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }, p.sessionId)
  check('窄屏编辑表单和保存按钮可滚动访问，无横向溢出', await evaluate(p, `(() => { const d=document.querySelector('dialog'); const r=d.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && d.scrollWidth<=d.clientWidth })()`))
  await click(p, '.user-profile-form [type=submit]'); await wait(p, '!document.querySelector("dialog[open]")')
  await route(p, 'dashboard', '.hero-title')
  check('最长姓名和专业在窄屏首页不会撑出横向滚动', await evaluate(p, 'document.documentElement.scrollWidth<=innerWidth'))
  check('窄屏顶栏姓名与页面标题不重叠', await evaluate(p, `document.querySelector('.crumb-current').getBoundingClientRect().right<=document.querySelector('.topbar-profile').getBoundingClientRect().left`))
  await capture(p, 'profile-dashboard-mobile')
  await click(p, '.topbar-profile'); await profileReady(p)
  await fill(p, '#profile-name', '<img src=x onerror=alert(1)>'); await fill(p, '#profile-major', ''); await chooseGrade(p, '')
  await click(p, '.user-profile-form [type=submit]'); await wait(p, '!document.querySelector("dialog[open]")')
  check('个人资料按文本渲染且空选填字段不自动补造', await evaluate(p, `document.querySelector('.hero-title').textContent.includes('<img src=x onerror=alert(1)>') && !document.querySelector('.hero-title img') && document.querySelector('.hero-desc').textContent.includes('专业未填写 · 年级未填写')`))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, p.sessionId)
  await route(p, 'library', '.lib-grid')
  await evaluate(p, `window.__originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new DOMException('测试存储配额','QuotaExceededError')}`)
  await click(p, '.lib-card .fav-btn'); await wait(p, 'document.querySelector("[role=alert]")')
  check('存储不可写时明确提示而非声称已保存', await evaluate(p, `document.querySelector('[role=alert]').textContent.includes('暂存内存')`))
  await evaluate(p, 'Storage.prototype.setItem=window.__originalSetItem')
  await click(p, '.lib-card .fav-btn'); await wait(p, '!document.querySelector("[role=alert]")')
  await evaluate(p, `localStorage.setItem('paperpilot:userProfile','{broken'); localStorage.removeItem('paperpilot:profileSetupSkipped')`)
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".lib-grid")'); await profileReady(p)
  check('损坏资料不会导致页面崩溃，重新显示空白欢迎表单', await evaluate(p, `document.querySelector('#profile-name').value==='' && document.querySelector('#user-profile-title').textContent.includes('欢迎使用')`))
  await fill(p, '#profile-name', '林悦'); await fill(p, '#profile-major', '物联网工程'); await chooseGrade(p, '大一')
  await click(p, '.user-profile-form [type=submit]'); await wait(p, '!document.querySelector("dialog[open]")')
  check('首次欢迎直接保存可关闭表单并保留当前路由和学习数据', await evaluate(p, `document.querySelector('.topbar-profile-name').textContent==='林悦' && location.hash==='#/library' && JSON.parse(localStorage.getItem('paperpilot:learning')).quizSessions.length===1`))
  await send('Page.reload', {}, p.sessionId); await wait(p, 'document.querySelector(".lib-grid")')
  check('未跳过而直接设置的用户刷新也不会重复欢迎', await evaluate(p, `!document.querySelector('dialog[open]') && document.querySelector('.topbar-profile-name').textContent==='林悦'`))
  await testPromptGuideBrowser({ p, send, evaluate, wait, click, route, check, capture, socket, browserContextId, base, output })
  await testPaperImportBrowser({ p, page, send, evaluate, wait, click, route, check, capture, socket, browserContextId, output })
  check('所有交互无浏览器异常或 console.error', errors.length===0)
  console.log(`Browser regression: ${passed} PASS; artifacts ${output}`)
  await send('Target.disposeBrowserContext', { browserContextId })
  await send('Browser.close')
} catch (error) {
  console.error('BROWSER TEST FAILED', error, JSON.stringify(errors))
  process.exitCode = 1
} finally {
  socket?.close()
  child.kill()
}
