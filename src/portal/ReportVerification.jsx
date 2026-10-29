import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ReportVerification() {
  const [hash, setHash] = useState('')
  const [result, setResult] = useState(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function verify(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    setChecked(false)
    if (!/^[a-f0-9]{32}$/i.test(hash.trim())) {
      setError('Enter a valid 32-character report fingerprint.')
      setLoading(false)
      return
    }

    const { data, error: queryError } = await supabase.rpc('verify_report_snapshot_integrity', {
      p_integrity_hash: hash.trim(),
    })
    if (queryError) setError(workflowError(queryError))
    else {
      setResult(data?.[0] ?? null)
      setChecked(true)
    }
    setLoading(false)
  }

  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Formal reports</p>
          <h1>Report verification</h1>
          <p className="progress-report-note">Verify a released report integrity fingerprint without displaying learner assessment data.</p>
        </div>
      </header>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      <form className="workflow-panel workflow-form" onSubmit={verify}>
        <label className="workflow-wide">Integrity hash
          <input required value={hash} onChange={event => setHash(event.target.value)} placeholder="Paste the report fingerprint" />
        </label>
        <div className="workflow-actions workflow-wide">
          <button className="primary-action" disabled={loading}>{loading ? 'Verifying…' : 'Verify report'}</button>
        </div>
      </form>
      {result === null && checked && !loading && <p className="portal-empty-copy">No released report matches that fingerprint.</p>}
      {result && !result.integrity_valid && (
        <section className="workflow-panel report-verification-result is-mismatch" role="alert">
          <span>Integrity mismatch</span>
          <h2>Do not rely on this released report</h2>
          <p>The saved report contents no longer match the recorded fingerprint. This mismatch was recorded in Activity Log. Ask an administrator to investigate before using or sharing the report.</p>
        </section>
      )}
      {result?.integrity_valid && (
        <section className="workflow-panel report-verification-result">
          <span>Verified release</span>
          <h2>{result.campus_name || 'Fordridge Schools'} · {result.academic_year} · {result.academic_term}</h2>
          <p>Released {new Date(result.released_at).toLocaleString()}</p>
        </section>
      )}
    </section>
  )
}
