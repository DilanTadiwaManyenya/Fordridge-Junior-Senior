import { useState } from 'react'
import { supabase } from '../lib/supabase'
import PasswordInput from './PasswordInput'

export default function AccountSettings() {
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    setMessage('')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      const r = await supabase.auth.updateUser({ password })
      if (r.error) throw r.error
      setPassword('')
      setConfirm('')
      setMessage('Your password has been changed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section>
      <h1>Account settings</h1>
      {error && (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="workflow-notice">
          {message}
        </p>
      )}
      <form className="workflow-panel workflow-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            New password
            <PasswordInput
              id="new-password"
              ariaLabel="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <PasswordInput
              id="confirm-password"
              ariaLabel="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <button className="primary-action">
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </fieldset>
      </form>
    </section>
  )
}
