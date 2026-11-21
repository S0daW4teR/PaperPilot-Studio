import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'

export default function ConfirmModal({ open, title, body, confirmLabel = '确认', tone = 'danger', onConfirm, onCancel }) {
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`modal-icon ${tone}`}>
          <Icon name={tone === 'danger' ? 'trash' : 'upload'} size={20} />
        </div>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" ref={cancelRef} onClick={onCancel}>
            取消
          </button>
          <button className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}