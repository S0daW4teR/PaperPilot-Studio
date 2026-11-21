import { useLayoutEffect, useRef, useState } from 'react'
import Icon from './ui/Icon.jsx'
import { PROFILE_GRADES, saveUserProfile } from '../lib/userProfileStore.js'

export default function UserProfileDialog({ profile, welcome, onSaved, onDismiss }) {
  const dialogRef = useRef(null)
  const nameRef = useRef(null)
  const [name, setName] = useState(profile?.name ?? '')
  const [major, setMajor] = useState(profile?.major ?? '')
  const [grade, setGrade] = useState(profile?.grade ?? '')
  const [error, setError] = useState('')

  // 在节点移除前关闭弹窗，浏览器才能恢复入口焦点。
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
    }
  }, [])

  const submit = (event) => {
    event.preventDefault()
    const result = saveUserProfile({ name, major, grade })
    if (!result.ok) {
      setError(result.error)
      if (!name.trim()) nameRef.current.focus()
      return
    }
    onSaved()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-card user-profile-dialog"
      aria-labelledby="user-profile-title"
      aria-describedby="user-profile-description"
      onCancel={(event) => { event.preventDefault(); onDismiss() }}
    >
      <div className="modal-icon primary"><Icon name="user" size={22} /></div>
      <h2 id="user-profile-title" className="modal-title">{welcome ? '欢迎使用 PaperPilot Studio' : '编辑个人资料'}</h2>
      <p id="user-profile-description" className="card-sub">
        {welcome ? '先认识一下你，让学习首页更贴近自己。也可以跳过，稍后再设置。' : '更新后，首页、顶栏和学习档案会同步显示。'}
        资料仅保存在本浏览器，不需要注册。
      </p>
      <form className="user-profile-form" onSubmit={submit}>
        <label htmlFor="profile-name">姓名 <span className="card-sub">必填</span></label>
        <input
          ref={nameRef}
          id="profile-name"
          name="name"
          className="note-input user-profile-input"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => { setName(event.target.value); setError('') }}
          placeholder="请输入你的姓名，支持中文和英文"
          aria-invalid={!!error && !name.trim()}
          aria-describedby={error ? 'user-profile-error' : undefined}
        />
        <label htmlFor="profile-major">专业 <span className="card-sub">选填</span></label>
        <input
          id="profile-major"
          name="major"
          className="note-input user-profile-input"
          list="profile-major-suggestions"
          maxLength={120}
          value={major}
          onChange={(event) => { setMajor(event.target.value); setError('') }}
          placeholder="输入或选择专业名称"
          aria-describedby="profile-major-hint"
        />
        <datalist id="profile-major-suggestions">
          <option value="物联网工程" />
          <option value="电气工程及其自动化" />
          <option value="计算机科学与技术" />
        </datalist>
        <p id="profile-major-hint" className="card-sub">支持自定义专业，不限于建议选项。</p>
        <label htmlFor="profile-grade">年级 <span className="card-sub">选填</span></label>
        <select
          id="profile-grade"
          name="grade"
          className="note-input user-profile-input"
          value={grade}
          onChange={(event) => { setGrade(event.target.value); setError('') }}
        >
          <option value="">暂不填写</option>
          {PROFILE_GRADES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {error && <p id="user-profile-error" className="user-profile-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onDismiss}>{welcome ? '暂时跳过' : '取消'}</button>
          <button type="submit" className="btn btn-primary"><Icon name="check" size={15} />保存个人资料</button>
        </div>
      </form>
    </dialog>
  )
}
