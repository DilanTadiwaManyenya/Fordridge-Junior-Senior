import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const PAGE_SIZE = 25
const statusOptions = [
  ['all', 'All review statuses'],
  ['ready_for_decision', 'Ready for review'],
  ['needs_review', 'Needs review'],
  ['not_currently_active', 'Not in active roster'],
]

function readinessLabel(readiness) {
  if (readiness === 'ready_for_decision') return 'Ready for review'
  if (readiness === 'not_currently_active') return 'Not in active roster'
  return 'Needs review'
}

export default function YearRolloverReadiness() {
  const [campuses, setCampuses] = useState([])
  const [filters, setFilters] = useState({ campusId: '', search: '', readiness: 'all' })
  const [draft, setDraft] = useState(filters)
  const [preview, setPreview] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase.rpc('preview_year_rollover', {
      p_campus_id: filters.campusId || null,
      p_search: filters.search || null,
      p_readiness: filters.readiness === 'all' ? null : filters.readiness,
      p_page: page,
      p_page_size: PAGE_SIZE,
    })
    if (queryError) setError(workflowError(queryError))
    else setPreview(data)
    setLoading(false)
  }, [filters, page])

  useEffect(() => {
    let mounted = true
    async function loadCampuses() {
      const { data, error: campusError } = await supabase.from('campuses').select('id,name').order('name')
      if (!mounted) return
      if (campusError) setError(workflowError(campusError))
      else setCampuses(data || [])
    }
    loadCampuses()
    return () => { mounted = false }
  }, [])

  useEffect(() => { loadPreview() }, [loadPreview])

  function applyFilters(event) {
    event.preventDefault()
    setPage(1)
    setFilters({ ...draft, search: draft.search.trim() })
  }

  const summary = preview?.summary || { ready_for_decision: 0, needs_review: 0, not_currently_active: 0 }
  const rows = preview?.rows || []

  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Academic services</p>
          <h1>Year rollover readiness</h1>
          <p className="progress-report-note">Review the recorded learner roster before planning year-end decisions. This preview does not change learner profiles, promote learners, or assign streams.</p>
        </div>
      </header>
      <p className="workflow-notice" role="note">“Ready for review” means a learner has an active enrolment, campus, and class recorded. It is not a promotion recommendation. An unset stream is shown as-is and does not block this preview.</p>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      <form className="workflow-panel workflow-form rollover-filter-form" onSubmit={applyFilters}>
        <label>Campus
          <select value={draft.campusId} onChange={event => setDraft(value => ({ ...value, campusId: event.target.value }))}>
            <option value="">All campuses</option>
            {campuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label>Search learners
          <input value={draft.search} onChange={event => setDraft(value => ({ ...value, search: event.target.value }))} placeholder="Name, admission, campus, class, or stream" />
        </label>
        <label>Review status
          <select value={draft.readiness} onChange={event => setDraft(value => ({ ...value, readiness: event.target.value }))}>
            {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="primary-action" disabled={loading}>Preview roster</button>
      </form>
      <div className="rollover-readiness-summary" aria-label="Roster review summary">
        <article><span>Learners ready for review</span><strong>{summary.ready_for_decision}</strong></article>
        <article><span>Needs review</span><strong>{summary.needs_review}</strong></article>
        <article><span>Not in active roster</span><strong>{summary.not_currently_active}</strong></article>
      </div>
      <section className="workflow-panel rollover-readiness-panel">
        <header className="rollover-panel-heading">
          <div><h2>Learner readiness preview</h2><p>{preview?.total_count ?? 0} learner{preview?.total_count === 1 ? '' : 's'} match the selected filters. No roster updates are made here.</p></div>
          {loading && <span role="status">Refreshing preview…</span>}
        </header>
        {rows.length ? <div className="workflow-table-wrap">
          <table className="workflow-table">
            <thead><tr><th>Learner</th><th>Current campus</th><th>Current class</th><th>Stream</th><th>Enrolment</th><th>Review status and reason</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td><strong>{row.full_name || 'Name not recorded'}</strong><small>{row.admission_number || 'Admission number not recorded'}</small></td>
              <td>{row.campus_name || 'Campus not recorded'}</td>
              <td>{row.class_level || 'Class not recorded'}</td>
              <td>{row.class_stream || 'Not set'}</td>
              <td>{row.enrollment_status || 'Not recorded'}</td>
              <td><span className={`rollover-status is-${row.readiness}`}>{readinessLabel(row.readiness)}</span><small>{row.review_reasons?.length ? row.review_reasons.join(' ') : 'Current roster details are present. Destination and promotion decisions are not part of this preview.'}</small></td>
            </tr>)}</tbody>
          </table>
        </div> : !loading && <p className="portal-empty-copy">No learners match these filters.</p>}
        <footer className="rollover-pagination">
          <span>Page {preview?.page || page} of {preview?.total_pages || 1}</span>
          <div className="workflow-actions">
            <button type="button" className="secondary-action" disabled={loading || page <= 1} onClick={() => setPage(value => Math.max(value - 1, 1))}>Previous</button>
            <button type="button" className="secondary-action" disabled={loading || page >= (preview?.total_pages || 1)} onClick={() => setPage(value => value + 1)}>Next</button>
          </div>
        </footer>
      </section>
    </section>
  )
}
