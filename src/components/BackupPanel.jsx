import { useRef, useState } from 'react'
import {
  applyBackup,
  backupFileName,
  downloadBackup,
  exportData,
  inspectBackup,
} from '../backup.js'

export default function BackupPanel({ onImported }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { ok, text }
  const [pending, setPending] = useState(null) // 훑어본 파일 내용
  const fileRef = useRef(null)

  async function handleExport() {
    setBusy(true)
    setMessage(null)
    try {
      const data = await exportData()
      downloadBackup(data)
      setMessage({
        ok: true,
        text: `폴더 ${data.folders.length}개와 카드 ${data.cards.length}장을 파일로 내보냈습니다.`,
      })
    } catch (err) {
      setMessage({ ok: false, text: err.message || '내보내지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  async function handlePick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일을 다시 골라도 반응하도록
    if (!file) return

    setMessage(null)
    setPending(null)
    try {
      const inspected = inspectBackup(await file.text())
      setPending({ ...inspected, fileName: file.name })
    } catch (err) {
      setMessage({ ok: false, text: err.message || '파일을 읽지 못했습니다.' })
    }
  }

  async function handleApply(mode) {
    if (!pending) return
    setBusy(true)
    setMessage(null)
    try {
      const report = await applyBackup(pending, mode)
      setPending(null)
      setMessage({
        ok: true,
        text:
          mode === 'replace'
            ? `전부 바꿨습니다. 폴더 ${report.foldersAdded}개, 카드 ${report.cardsAdded}장.`
            : `폴더 ${report.foldersAdded}개, 카드 ${report.cardsAdded}장을 더했습니다.` +
              (report.skipped > 0 ? ` 이미 있던 ${report.skipped}개는 건너뛰었습니다.` : ''),
      })
      onImported?.()
    } catch (err) {
      setMessage({ ok: false, text: err.message || '가져오지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card stack">
      <h2 className="section-title">데이터 옮기기</h2>
      <p className="muted">
        폴더와 카드를 파일 하나로 내보내고 다시 가져올 수 있습니다. 백업용으로도, 안드로이드폰과
        아이패드 사이에 옮길 때도 씁니다. 기기마다 저장소가 따로라 자동으로 맞춰지지는 않습니다.
      </p>

      <button className="btn btn--full" onClick={handleExport} disabled={busy}>
        파일로 내보내기
      </button>
      <p className="muted">
        Azure 키는 파일에 담기지 않습니다. 파일이 남의 손에 들어가도 키는 새지 않습니다. 새 기기에서는
        설정 화면에서 키를 다시 넣어 주세요.
      </p>

      <hr className="rule-line" />

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={handlePick}
        hidden
      />
      <button className="btn btn--full" onClick={() => fileRef.current?.click()} disabled={busy}>
        파일에서 가져오기
      </button>

      {pending && (
        <>
          <p className="notice notice--ok">
            {pending.fileName} — 폴더 {pending.summary.folders}개, 카드 {pending.summary.cards}장
            {pending.summary.orphans > 0 &&
              ` (폴더가 없는 카드 ${pending.summary.orphans}장은 빠집니다)`}
          </p>
          <p className="muted">어떻게 가져올까요?</p>
          <div className="btn-row">
            <button className="btn" onClick={() => handleApply('merge')} disabled={busy}>
              합치기
            </button>
            <button className="btn btn--danger" onClick={() => handleApply('replace')} disabled={busy}>
              전부 바꾸기
            </button>
          </div>
          <p className="muted">
            합치기는 지금 없는 것만 더합니다. 전부 바꾸기는 지금 폴더와 카드를 모두 지우고 파일 내용으로
            바꿉니다.
          </p>
          <button className="link-btn" onClick={() => setPending(null)} disabled={busy}>
            그만두기
          </button>
        </>
      )}

      {message && (
        <p className={message.ok ? 'notice notice--ok' : 'notice notice--bad'}>{message.text}</p>
      )}
    </section>
  )
}

export { backupFileName }
