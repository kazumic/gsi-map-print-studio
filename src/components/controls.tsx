import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MinusIcon, PlusIcon } from './Icons'

export function Section({
  number,
  eyebrow,
  title,
  children,
}: {
  number: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <span className="section-number">{number}</span>
        <div>
          <div className="section-eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  inline,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  inline?: boolean
}) {
  return (
    <div className={`field ${inline ? 'field-inline' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field-control">{children}</div>
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  )
}

export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  precision = 0,
  suffix,
  prefix,
  ariaLabel,
  id,
  className,
  disabled,
}: {
  value: number
  onCommit: (value: number) => void
  min: number
  max: number
  step?: number
  precision?: number
  suffix?: string
  prefix?: string
  ariaLabel: string
  id?: string
  className?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(() => value.toFixed(precision))

  useEffect(() => {
    if (!focused) setText(value.toFixed(precision))
  }, [value, precision, focused])

  const commit = () => {
    const normalized = text.replace(/,/g, '').trim()
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) {
      setText(value.toFixed(precision))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setText(clamped.toFixed(precision))
    if (Math.abs(clamped - value) > 1e-9) onCommit(clamped)
  }

  return (
    <div className={`number-field ${disabled ? 'is-disabled' : ''} ${className ?? ''}`}>
      {prefix ? <span className="number-affix">{prefix}</span> : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        onFocus={(event) => {
          setFocused(true)
          event.currentTarget.select()
        }}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            setText(value.toFixed(precision))
            event.currentTarget.blur()
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            const direction = event.key === 'ArrowUp' ? 1 : -1
            const next = Math.min(max, Math.max(min, value + direction * step))
            setText(next.toFixed(precision))
            onCommit(next)
          }
        }}
      />
      {suffix ? <span className="number-affix number-suffix">{suffix}</span> : null}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  label: string
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${label}を減らす`}
      >
        <MinusIcon size={16} />
      </button>
      <span className="stepper-value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="stepper-button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${label}を増やす`}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  )
}

export interface Choice<T extends string> {
  value: T
  label: string
  hint?: string
}

export function Segmented<T extends string>({
  value,
  choices,
  onChange,
  ariaLabel,
  compact,
}: {
  value: T
  choices: Choice<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  compact?: boolean
}) {
  return (
    <div className={`segmented ${compact ? 'segmented-compact' : ''}`} role="group" aria-label={ariaLabel}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          aria-pressed={value === choice.value}
          className={value === choice.value ? 'active' : ''}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
          {choice.hint ? <span className="segmented-hint">{choice.hint}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="toggle-copy">
        <label htmlFor={id}>{label}</label>
        {description ? <span>{description}</span> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}

export function ChipButton({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" className={`chip ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  )
}
