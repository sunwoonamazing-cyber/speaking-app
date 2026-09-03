import { FLAGS, flagVar } from '../flags.js'

/**
 * 색깔 플래그 고르개.
 * 같은 색을 다시 누르면 표시가 지워진다 (따로 지우기 버튼을 두지 않아도 된다).
 */
export default function FlagPicker({ value, onChange, showLabels = false, disabled = false }) {
  return (
    <div className={`flag-picker ${showLabels ? 'flag-picker--labeled' : ''}`}>
      {FLAGS.map((f) => {
        const on = value === f.key
        return (
          <button
            key={f.key}
            type="button"
            className={`flag-dot ${on ? 'is-on' : ''}`}
            style={{ '--dot': flagVar(f.key) }}
            onClick={() => onChange(on ? null : f.key)}
            aria-pressed={on}
            aria-label={on ? `${f.label} 표시 지우기` : `${f.label}으로 표시`}
            title={f.label}
            disabled={disabled}
          >
            <span className="flag-dot__fill" />
            {showLabels && <span className="flag-dot__label">{f.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
