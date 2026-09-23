import { useState } from 'react'

const Eye = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></svg>
const EyeOff = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21M10.6 6.2A10.5 10.5 0 0 1 12 6c6.1 0 9.5 6 9.5 6a17.7 17.7 0 0 1-3.1 3.8M6.2 6.2A17.4 17.4 0 0 0 2.5 12S5.9 18 12 18c1.3 0 2.5-.3 3.5-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>

export default function PasswordInput({ id, value, onChange, autoComplete, minLength = 8, required = true }) {
  const [visible, setVisible] = useState(false)
  return <span className="password-input"><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} required={required} /><button type="button" className="password-visibility" onClick={() => setVisible(current => !current)} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff /> : <Eye />}</button></span>
}
