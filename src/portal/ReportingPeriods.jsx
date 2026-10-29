import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const terms = ['Term 1', 'Term 2', 'Term 3']

export default function ReportingPeriods({ profile }) {
  const [campuses, setCampuses] = useState([])
  const [periods, setPeriods] = useState([])
  const [publications, setPublications] = useState([])
  const [campusId, setCampusId] = useState(profile.campus_id || '')
  const [form, setForm] = useState({ academic_year: String(new Date().getFullYear()), academic_term: 'Term 1' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [campusResult, periodResult, publicationResult] = await Promise.all([
      supabase.from('campuses').select('id,name').order('name'),
      supabase.from('reporting_periods').select('id,campus_id,academic_year,academic_term,period_status,is_current,revision,campus:campuses(name)').order('academic_year', { ascending: false }),
      supabase.from('report_publications').select('campus_id,academic_year,academic_term,published_at'),
    ])
    const failed = [campusResult, periodResult, publicationResult].find(result => result.error)
    if (failed) setError(workflowError(failed.error))
    else {
      const availableCampuses = profile.campus_id
        ? (campusResult.data || []).filter(item => item.id === profile.campus_id)
        : campusResult.data || []
      setCampuses(availableCampuses)
      setPeriods(periodResult.data || [])
      setPublications(publicationResult.data || [])
      setCampusId(current => availableCampuses.some(item => item.id === current) ? current : availableCampuses[0]?.id || '')
      setError('')
    }
    setLoading(false)
  }, [profile.campus_id])

  useEffect(() => { load() }, [load])

  const publicationByPeriod = useMemo(() => new Map(
    publications.map(item => [`${item.campus_id}|${item.academic_year}|${item.academic_term}`, item]),
  ), [publications])

  async function register(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const { error: saveError } = await supabase.rpc('register_reporting_period', {
      p_campus_id: campusId,
      p_academic_year: Number(form.academic_year),
      p_academic_term: form.academic_term,
    })
    if (saveError) setError(workflowError(saveError))
    else {
      setNotice('Reporting period registered as open. Publication remains a separate status.')
      setLoading(true)
      await load()
    }
    setSaving(false)
  }

  return <section><header className="workflow-heading"><div><p className="eyebrow">Academic services</p><h1>Reporting periods</h1><p className="progress-report-note">Register campus, year and term periods. Open/closed status is tracked separately from report publication. No term dates are assumed.</p></div></header>{error && <p className="workflow-error" role="alert">{error}</p>}{notice && <p className="workflow-notice" role="status">{notice}</p>}<form className="workflow-panel workflow-form" onSubmit={register}><label>Campus<select required value={campusId} onChange={event => setCampusId(event.target.value)}>{campuses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Academic year<input type="number" min="2000" max="2100" required value={form.academic_year} onChange={event => setForm({ ...form, academic_year: event.target.value })} /></label><label>Term<select required value={form.academic_term} onChange={event => setForm({ ...form, academic_term: event.target.value })}>{terms.map(item => <option key={item}>{item}</option>)}</select></label><div className="workflow-actions workflow-wide"><button className="primary-action" disabled={saving || !campusId}>{saving ? 'Registering…' : 'Register period'}</button></div></form><section className="workflow-panel"><h2>Registered periods</h2>{loading ? <p role="status">Loading reporting periods…</p> : periods.length ? <div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>Campus</th><th>Academic year</th><th>Term</th><th>Period state</th><th>Current</th><th>Revision</th><th>Report release</th></tr></thead><tbody>{periods.map(item => { const publication = publicationByPeriod.get(`${item.campus_id}|${item.academic_year}|${item.academic_term}`); return <tr key={item.id}><td>{item.campus?.name || 'Campus'}</td><td>{item.academic_year}</td><td>{item.academic_term}</td><td>{item.period_status === 'closed' ? 'Closed' : 'Open'}</td><td>{item.is_current ? 'Current' : 'Not set'}</td><td>{item.revision}</td><td>{publication?.published_at ? 'Published' : publication ? 'Draft' : 'Not started'}</td></tr> })}</tbody></table></div> : <p className="portal-empty-copy">No reporting periods are registered yet.</p>}</section></section>
}
