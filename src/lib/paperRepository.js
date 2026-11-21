import { useEffect, useSyncExternalStore } from 'react'
import { catalog } from '../data/papers.js'
import { MAX_PAPER_FILE_BYTES } from '../data/paperPackageSchema.js'
import { validatePaperPackage } from './paperPackageValidator.js'

export const PAPER_DATABASE = 'paperpilot-papers'
export const PAPER_STORE = 'papers'
let databasePromise
let snapshot = { status: 'loading', records: [], error: '', warning: '' }
let initialized = false
let revision = 0
let channel
let syncing = false
const listeners = new Set()

function publish(next) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function openDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此浏览器不支持 IndexedDB，无法保存论文。请使用支持本地数据库的浏览器。')); return }
    const request = indexedDB.open(PAPER_DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(PAPER_STORE, { keyPath: 'id' })
    request.onblocked = () => { blocked = true; reject(new Error('本地数据库被其他页面占用，请关闭其他 PaperPilot 标签后重试。')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      if (blocked) { database.close(); return }
      database.onversionchange = () => { database.close(); databasePromise = null }
      resolve(database)
    }
  }).catch((error) => { databasePromise = null; throw error })
  return databasePromise
}

async function readRecords() {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PAPER_STORE, 'readonly')
    const request = transaction.objectStore(PAPER_STORE).getAll()
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('读取事务中止'))
    transaction.onerror = () => reject(transaction.error ?? request.error)
  })
}

export async function refreshImportedPapers() {
  const currentRevision = ++revision
  try {
    const saved = await readRecords()
    const records = saved.filter((record) => record.source === 'imported' && record.id === record.package?.paper?.id && Number.isFinite(Date.parse(record.createdAt)) && Number.isFinite(Date.parse(record.updatedAt)) && validatePaperPackage(record.package, catalog.map((paper) => paper.id)).ok)
    if (currentRevision === revision) publish({ status: 'ready', records: records.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), error: '', warning: records.length === saved.length ? '' : '部分本地论文记录格式异常，已保留原记录但未展示；不会用不完整数据替代论文。' })
  } catch (error) {
    if (currentRevision === revision) publish({ ...snapshot, status: 'error', error: `本地论文库读取失败：${error?.message ?? '存储不可用'}。内置论文仍可使用，可重试读取。` })
  }
}

function startSync() {
  if (syncing) return
  syncing = true
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('paperpilot-papers-changed')
    channel.onmessage = () => { void refreshImportedPapers() }
  }
  window.addEventListener('focus', () => { void refreshImportedPapers() })
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePaperRepository() {
  useEffect(() => {
    startSync()
    if (!initialized) { initialized = true; void refreshImportedPapers() }
  }, [])
  return useSyncExternalStore(subscribe, () => snapshot)
}

export async function importPaperPackage(data) {
  const validation = validatePaperPackage(data, catalog.map((paper) => paper.id))
  if (!validation.ok) return { ok: false, error: validation.errors.join('；') }
  if (new Blob([JSON.stringify(data)]).size > MAX_PAPER_FILE_BYTES) return { ok: false, error: '论文包超过 5MB 限制，未保存任何数据。' }
  const now = new Date().toISOString()
  const record = { id: data.paper.id, source: 'imported', createdAt: now, updatedAt: now, package: structuredClone(data) }
  try {
    const database = await openDatabase()
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(PAPER_STORE, 'readwrite')
      const request = transaction.objectStore(PAPER_STORE).add(record)
      transaction.oncomplete = resolve
      transaction.onabort = () => reject(request.error ?? transaction.error ?? new Error('写入事务中止'))
      transaction.onerror = () => reject(request.error ?? transaction.error)
    })
  } catch (error) {
    if (error?.name === 'ConstraintError') return { ok: false, error: `paper.id 重复：${data.paper.id} 已存在，不会覆盖已有论文。` }
    if (error?.name === 'QuotaExceededError') return { ok: false, error: '浏览器存储空间不足，论文未保存。请先备份数据、释放空间后重试。' }
    return { ok: false, error: `论文保存失败：${error?.message ?? '本地数据库不可用'}。事务未完成，不会留下部分数据。` }
  }
  revision++
  publish({ ...snapshot, status: 'ready', records: [...snapshot.records.filter((item) => item.id !== record.id), record], error: '' })
  try { channel?.postMessage('changed') } catch { /* 事务已提交，通知失败不能误报为保存失败。 */ }
  return { ok: true, record }
}

export async function exportPaperPackage(id) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PAPER_STORE, 'readonly')
    const request = transaction.objectStore(PAPER_STORE).get(id)
    transaction.oncomplete = () => request.result ? resolve(request.result.package) : reject(new Error('未找到该导入论文'))
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('导出读取中止'))
    transaction.onerror = () => reject(transaction.error ?? request.error)
  })
}

export function importedCatalogPaper(record) {
  const paper = record.package.paper
  return {
    ...paper, source: record.source, createdAt: record.createdAt, updatedAt: record.updatedAt,
    demo: false, researchField: paper.field, intro: paper.abstract,
    publication: paper.journal ? { journal: paper.journal } : null,
    sections: record.package.sections,
  }
}
