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
  const [destinations, setDestinations] = useState([])
  const [destinationLoading, setDestinationLoading] = useState(true)
  const [destinationError, setDestinationError] = useState('')
  const [destinationClassId, setDestinationClassId] = useState('')
  const [destinationStreamId, setDestinationStreamId] = useState('')
  const [proposedCount, setProposedCount] = useState('0')
  const [decisionYears, setDecisionYears] = useState({ source: '', destination: '' })
  const [decisions, setDecisions] = useState({})
  const [decisionDrafts, setDecisionDrafts] = useState({})
  const [placementDrafts, setPlacementDrafts] = useState({})
  const [savingDecision, setSavingDecision] = useState('')
  const [savingPlacement, setSavingPlacement] = useState('')
  const [decisionError, setDecisionError] = useState('')
  const [decisionNotice, setDecisionNotice] = useState('')
  const [batchPreview, setBatchPreview] = useState(null)
  const [batchPage, setBatchPage] = useState(1)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [batchRevision, setBatchRevision] = useState(0)
  const [appliedRun, setAppliedRun] = useState(null)
  const [applyConfirmation, setApplyConfirmation] = useState('')
  const [acceptUnknownCapacity, setAcceptUnknownCapacity] = useState(false)
  const [applyingBatch, setApplyingBatch] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [reversalPreview, setReversalPreview] = useState(null)
  const [reversalReason, setReversalReason] = useState('')
  const [reversalConfirmation, setReversalConfirmation] = useState('')
  const [reversingBatch, setReversingBatch] = useState(false)
  const [reversalError, setReversalError] = useState('')
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

  const loadDestinations = useCallback(async () => {
    setDestinationLoading(true)
    setDestinationError('')
    const { data, error: queryError } = await supabase.rpc('preview_year_rollover_destinations', {
      p_campus_id: filters.campusId || null,
    })
    if (queryError) setDestinationError(workflowError(queryError))
    else setDestinations(Array.isArray(data) ? data : [])
    setDestinationLoading(false)
  }, [filters.campusId])

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
  useEffect(() => { loadDestinations() }, [loadDestinations])
  useEffect(() => {
    const sourceYear = Number(decisionYears.source)
    const destinationYear = Number(decisionYears.destination)
    if (!Number.isInteger(sourceYear) || sourceYear < 2000 || !Number.isInteger(destinationYear) || destinationYear <= sourceYear) {
      setBatchPreview(null)
      setAppliedRun(null)
      setReversalPreview(null)
      setReversalReason('')
      setReversalConfirmation('')
      return
    }
    let mounted = true
    setBatchLoading(true)
    const batchRequest = supabase.rpc('preview_year_rollover_batch', {
      p_source_academic_year: sourceYear,
      p_destination_academic_year: destinationYear,
      p_campus_id: filters.campusId || null,
      p_page: batchPage,
      p_page_size: PAGE_SIZE,
    })
    const runRequest = filters.campusId
      ? supabase.rpc('year_rollover_batch_run_status', {
          p_source_academic_year: sourceYear,
          p_destination_academic_year: destinationYear,
          p_campus_id: filters.campusId,
        })
      : Promise.resolve({ data: null, error: null })
    const reversalRequest = filters.campusId
      ? supabase.rpc('preview_year_rollover_batch_reversal', {
          p_source_academic_year: sourceYear,
          p_destination_academic_year: destinationYear,
          p_campus_id: filters.campusId,
        })
      : Promise.resolve({ data: null, error: null })
    Promise.all([batchRequest, runRequest, reversalRequest]).then(([{ data, error: queryError }, { data: runData, error: runError }, { data: reversalData, error: reversalQueryError }]) => {
      if (!mounted) return
      if (queryError || runError || reversalQueryError) setBatchError(workflowError(queryError || runError || reversalQueryError))
      else { setBatchError(''); setBatchPreview(data); setAppliedRun(runData); setReversalPreview(reversalData) }
      setBatchLoading(false)
    })
    return () => { mounted = false }
  }, [decisionYears, filters.campusId, batchPage, batchRevision])
  useEffect(() => {
    const sourceYear = Number(decisionYears.source)
    const destinationYear = Number(decisionYears.destination)
    const learnerIds = (preview?.rows || []).map(row => row.id)
    if (!Number.isInteger(sourceYear) || sourceYear < 2000 || !Number.isInteger(destinationYear) || destinationYear <= sourceYear || !learnerIds.length) {
      setDecisions({})
      return
    }
    let mounted = true
    supabase.rpc('preview_year_rollover_decisions', {
      p_learner_ids: learnerIds,
      p_source_academic_year: sourceYear,
      p_destination_academic_year: destinationYear,
    }).then(({ data, error: queryError }) => {
      if (!mounted) return
      if (queryError) setDecisionError(workflowError(queryError))
      else {
        setDecisionError('')
        setDecisions(Object.fromEntries((Array.isArray(data) ? data : []).map(item => [item.learner_id, item])))
      }
    })
    return () => { mounted = false }
  }, [preview?.rows, decisionYears])

  function applyFilters(event) {
    event.preventDefault()
    setPage(1)
    setBatchPage(1)
    if (draft.campusId !== filters.campusId) {
      setApplyConfirmation('')
      setAcceptUnknownCapacity(false)
      setAppliedRun(null)
      setReversalPreview(null)
    }
    setFilters({ ...draft, search: draft.search.trim() })
  }

  async function saveDecision(row) {
    const draft = decisionDrafts[row.id] || {}
    const sourceYear = Number(decisionYears.source)
    const destinationYear = Number(decisionYears.destination)
    if (!Number.isInteger(sourceYear) || sourceYear < 2000 || !Number.isInteger(destinationYear) || destinationYear <= sourceYear) {
      setDecisionError('Enter a valid source year and a later destination year first.')
      return
    }
    setSavingDecision(row.id)
    setDecisionError('')
    setDecisionNotice('')
    const { error: saveError } = await supabase.rpc('save_year_rollover_decision', {
      p_learner_id: row.id,
      p_source_academic_year: sourceYear,
      p_destination_academic_year: destinationYear,
      p_decision: draft.decision || decisions[row.id]?.decision || '',
      p_reason: draft.reason ?? decisions[row.id]?.reason ?? '',
      p_expected_campus_id: row.campus_id,
      p_expected_class_level: row.class_level,
      p_expected_class_stream: row.class_stream,
      p_expected_enrollment_status: row.enrollment_status,
    })
    setSavingDecision('')
    if (saveError) {
      setDecisionError(workflowError(saveError))
      return
    }
    setDecisionNotice(`Decision recorded for ${row.full_name || 'learner'}. No learner profile or placement was changed.`)
    const { data } = await supabase.rpc('preview_year_rollover_decisions', {
      p_learner_ids: [row.id], p_source_academic_year: sourceYear, p_destination_academic_year: destinationYear,
    })
    if (Array.isArray(data) && data[0]) setDecisions(value => ({ ...value, [row.id]: data[0] }))
    setDecisionDrafts(value => ({ ...value, [row.id]: undefined }))
    setPlacementDrafts(value => ({ ...value, [row.id]: undefined }))
    setBatchRevision(value => value + 1)
  }

  async function savePlacement(row) {
    const decision = decisions[row.id]
    const draft = placementDrafts[row.id] || {}
    const targetClassId = draft.classId ?? decision?.destination_class_id ?? ''
    const targetStreamId = draft.streamId ?? decision?.destination_stream_id ?? ''
    setSavingPlacement(row.id)
    setDecisionError('')
    setDecisionNotice('')
    const { error: saveError } = await supabase.rpc('save_year_rollover_placement', {
      p_learner_id: row.id,
      p_source_academic_year: Number(decisionYears.source),
      p_destination_academic_year: Number(decisionYears.destination),
      p_destination_class_id: targetClassId || null,
      p_destination_stream_id: targetStreamId || null,
    })
    setSavingPlacement('')
    if (saveError) {
      setDecisionError(workflowError(saveError))
      return
    }
    setDecisionNotice(`Proposed placement saved for ${row.full_name || 'learner'}. The learner was not moved.`)
    const { data } = await supabase.rpc('preview_year_rollover_decisions', {
      p_learner_ids: [row.id],
      p_source_academic_year: Number(decisionYears.source),
      p_destination_academic_year: Number(decisionYears.destination),
    })
    if (Array.isArray(data) && data[0]) setDecisions(value => ({ ...value, [row.id]: data[0] }))
    setPlacementDrafts(value => ({ ...value, [row.id]: undefined }))
    setBatchRevision(value => value + 1)
  }

  async function applyYearRollover() {
    if (!batchPreview || !filters.campusId) return
    setApplyingBatch(true)
    setApplyError('')
    const { data, error: applyFailure } = await supabase.rpc('apply_year_rollover_batch', {
      p_source_academic_year: Number(decisionYears.source),
      p_destination_academic_year: Number(decisionYears.destination),
      p_campus_id: filters.campusId,
      p_expected_learner_count: batchPreview.summary?.active_learners || 0,
      p_confirmation: applyConfirmation.trim(),
      p_accept_unknown_capacity: acceptUnknownCapacity,
    })
    if (applyFailure) {
      setApplyError(workflowError(applyFailure))
      setApplyingBatch(false)
      return
    }
    const { data: runData, error: statusFailure } = await supabase.rpc('year_rollover_batch_run_status', {
      p_source_academic_year: Number(decisionYears.source),
      p_destination_academic_year: Number(decisionYears.destination),
      p_campus_id: filters.campusId,
    })
    setAppliedRun(statusFailure || !runData ? { ...data, status: 'applied' } : runData)
    if (statusFailure) setApplyError(`The batch applied, but its status could not be refreshed: ${workflowError(statusFailure)}. Do not submit it again; refresh the page to verify.`)
    setApplyConfirmation('')
    setBatchRevision(value => value + 1)
    setApplyingBatch(false)
  }

  async function reverseYearRollover() {
    if (!batchPreview || !filters.campusId || !reversalPreview?.can_reverse) return
    setReversingBatch(true)
    setReversalError('')
    const { error: reversalFailure } = await supabase.rpc('reverse_year_rollover_batch', {
      p_source_academic_year: Number(decisionYears.source),
      p_destination_academic_year: Number(decisionYears.destination),
      p_campus_id: filters.campusId,
      p_expected_learner_count: reversalPreview.learner_count,
      p_reason: reversalReason.trim(),
      p_confirmation: reversalConfirmation.trim(),
    })
    if (reversalFailure) {
      setReversalError(workflowError(reversalFailure))
      setReversingBatch(false)
      return
    }
    setReversalReason('')
    setReversalConfirmation('')
    setReversingBatch(false)
    setBatchRevision(value => value + 1)
  }

  const summary = preview?.summary || { ready_for_decision: 0, needs_review: 0, not_currently_active: 0 }
  const rows = preview?.rows || []
  const expectedApplyConfirmation = `APPLY YEAR ROLLOVER ${decisionYears.source} TO ${decisionYears.destination}`
  const applySummary = batchPreview?.summary || {}
  const completeBatchReview = applySummary.active_learners > 0
    && applySummary.ready_for_review === applySummary.active_learners
    && applySummary.capacity_exceeded === 0
  const destinationClass = destinations.find(item => item.id === destinationClassId)
  const destinationStreams = destinationClass?.streams || []
  const destinationStream = destinationStreams.find(item => item.id === destinationStreamId)
  const hasStreams = destinationStreams.length > 0
  const proposed = /^\d+$/.test(proposedCount) ? Number(proposedCount) : null
  const currentDestinationCount = hasStreams ? destinationStream?.current_count : destinationClass?.current_count
  const configuredCapacity = hasStreams ? destinationStream?.capacity : destinationClass?.capacity
  const projectedCount = proposed === null || currentDestinationCount == null ? null : currentDestinationCount + proposed
  const capacityStatus = !destinationClass
    ? 'Select an existing destination class.'
    : hasStreams && !destinationStream
      ? 'Select an existing stream. Stream allocations are not inferred.'
      : configuredCapacity == null
        ? 'Capacity is not set; fit cannot be determined.'
        : projectedCount > configuredCapacity
          ? 'Proposed total exceeds the recorded capacity.'
          : 'Proposed total is within the recorded capacity.'

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
      <section className="workflow-panel rollover-cycle-panel">
        <div className="workflow-form rollover-cycle-form">
          <label>Decision source academic year
            <input type="number" min="2000" step="1" value={decisionYears.source} onChange={event => { setDecisionYears(value => ({ ...value, source: event.target.value })); setDecisionDrafts({}); setDecisionNotice(''); setBatchPage(1); setApplyConfirmation(''); setAcceptUnknownCapacity(false); setAppliedRun(null); setReversalPreview(null); setReversalReason(''); setReversalConfirmation('') }} placeholder="Enter confirmed year" />
          </label>
          <label>Decision destination academic year
            <input type="number" min="2000" step="1" value={decisionYears.destination} onChange={event => { setDecisionYears(value => ({ ...value, destination: event.target.value })); setDecisionDrafts({}); setDecisionNotice(''); setBatchPage(1); setApplyConfirmation(''); setAcceptUnknownCapacity(false); setAppliedRun(null); setReversalPreview(null); setReversalReason(''); setReversalConfirmation('') }} placeholder="Enter confirmed year" />
          </label>
          <p className="progress-report-note">Enter the school-confirmed years. Decisions are review records only; they do not promote learners, change enrolment, or assign classes or streams.</p>
        </div>
        {decisionError && <p className="workflow-error" role="alert">{decisionError}</p>}
        {decisionNotice && <p className="workflow-success" role="status">{decisionNotice}</p>}
      </section>
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
            <thead><tr><th>Learner</th><th>Current campus</th><th>Current class</th><th>Stream</th><th>Enrolment</th><th>Review status and reason</th><th>Reviewed decision</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td><strong>{row.full_name || 'Name not recorded'}</strong><small>{row.admission_number || 'Admission number not recorded'}</small></td>
              <td>{row.campus_name || 'Campus not recorded'}</td>
              <td>{row.class_level || 'Class not recorded'}</td>
              <td>{row.class_stream || 'Not set'}</td>
              <td>{row.enrollment_status || 'Not recorded'}</td>
              <td><span className={`rollover-status is-${row.readiness}`}>{readinessLabel(row.readiness)}</span><small>{row.review_reasons?.length ? row.review_reasons.join(' ') : 'Current roster details are present. Destination and promotion decisions are not part of this preview.'}</small></td>
              <td><div className="rollover-decision-form">
                <label>Decision for {row.full_name || 'learner'}
                  <select
                    aria-label={`Decision for ${row.full_name || 'learner'}`}
                    value={decisionDrafts[row.id]?.decision ?? decisions[row.id]?.decision ?? ''}
                    disabled={Boolean(appliedRun) || !decisionYears.source || !decisionYears.destination || row.readiness !== 'ready_for_decision' || row.enrollment_status !== 'active'}
                    onChange={event => setDecisionDrafts(value => ({ ...value, [row.id]: { ...value[row.id], decision: event.target.value } }))}
                  >
                    <option value="">Choose decision</option>
                    <option value="promote">Promote</option>
                    <option value="retain">Retain</option>
                    <option value="transfer">Transfer</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>
                <label>Reason
                  <textarea
                    aria-label={`Decision reason for ${row.full_name || 'learner'}`}
                    minLength={10}
                    maxLength={500}
                    value={decisionDrafts[row.id]?.reason ?? decisions[row.id]?.reason ?? ''}
                    disabled={Boolean(appliedRun) || !decisionYears.source || !decisionYears.destination || row.readiness !== 'ready_for_decision' || row.enrollment_status !== 'active'}
                    onChange={event => setDecisionDrafts(value => ({ ...value, [row.id]: { ...value[row.id], reason: event.target.value } }))}
                    placeholder="At least 10 characters"
                  />
                </label>
                {decisions[row.id] && <small>Saved {decisions[row.id].decision} · {decisions[row.id].reviewer_name} · {new Date(decisions[row.id].reviewed_at).toLocaleDateString()}</small>}
                <button type="button" className="secondary-action" disabled={Boolean(appliedRun) || savingDecision === row.id || !decisionYears.source || !decisionYears.destination || row.readiness !== 'ready_for_decision' || row.enrollment_status !== 'active' || !(decisionDrafts[row.id]?.decision ?? decisions[row.id]?.decision) || (decisionDrafts[row.id]?.reason ?? decisions[row.id]?.reason ?? '').trim().length < 10} onClick={() => saveDecision(row)}>{savingDecision === row.id ? 'Saving…' : decisions[row.id] ? 'Update decision' : 'Save decision'}</button>
                {((decisionDrafts[row.id]?.decision ?? decisions[row.id]?.decision) === 'promote' || (decisionDrafts[row.id]?.decision ?? decisions[row.id]?.decision) === 'retain') && <>
                  <label>Proposed destination class
                    <select aria-label={`Proposed destination class for ${row.full_name || 'learner'}`} disabled={Boolean(appliedRun)} value={placementDrafts[row.id]?.classId ?? decisions[row.id]?.destination_class_id ?? ''} onChange={event => setPlacementDrafts(value => ({ ...value, [row.id]: { ...value[row.id], classId: event.target.value, streamId: '' } }))}>
                      <option value="">Choose configured class</option>
                      {destinations.map(item => <option key={item.id} value={item.id}>{item.campus_name} · {item.class_level}</option>)}
                    </select>
                  </label>
                  {(() => {
                    const classId = placementDrafts[row.id]?.classId ?? decisions[row.id]?.destination_class_id
                    const targetClass = destinations.find(item => item.id === classId)
                    if (!targetClass?.streams?.length) return null
                    return <label>Proposed destination stream
                      <select aria-label={`Proposed destination stream for ${row.full_name || 'learner'}`} disabled={Boolean(appliedRun)} value={placementDrafts[row.id]?.streamId ?? decisions[row.id]?.destination_stream_id ?? ''} onChange={event => setPlacementDrafts(value => ({ ...value, [row.id]: { ...value[row.id], streamId: event.target.value } }))}>
                        <option value="">Choose configured stream</option>
                        {targetClass.streams.map(stream => <option key={stream.id} value={stream.id}>{stream.stream_name}</option>)}
                      </select>
                    </label>
                  })()}
                  <button type="button" className="secondary-action" disabled={Boolean(appliedRun) || savingPlacement === row.id || !decisionYears.source || !decisionYears.destination || !decisions[row.id] || !(placementDrafts[row.id]?.classId ?? decisions[row.id]?.destination_class_id) || (() => { const target = destinations.find(item => item.id === (placementDrafts[row.id]?.classId ?? decisions[row.id]?.destination_class_id)); return Boolean(target?.streams?.length && !(placementDrafts[row.id]?.streamId ?? decisions[row.id]?.destination_stream_id)) })()} onClick={() => savePlacement(row)}>{savingPlacement === row.id ? 'Saving…' : 'Save proposed placement'}</button>
                </>}
                {(decisionDrafts[row.id]?.decision ?? decisions[row.id]?.decision) === 'transfer' || (decisionDrafts[row.id]?.decision ?? decisions[row.id]?.decision) === 'complete' ? <small>No internal destination is required for this reviewed decision.</small> : null}
              </div></td>
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
      {batchPreview && <section className="workflow-panel rollover-readiness-panel rollover-batch-panel">
        <header className="rollover-panel-heading">
          <div><h2>Year rollover batch preview</h2><p>Cycle {decisionYears.source} → {decisionYears.destination}. Review each active learner’s recorded decision and configured destination before execution. Applying changes the reviewed learner placements in one audited transaction.</p></div>
          {batchLoading && <span role="status">Refreshing batch preview…</span>}
        </header>
        {batchError && <p className="workflow-error" role="alert">{batchError}</p>}
        {appliedRun ? <>
          <div className="workflow-success" role="status">
            <h3>{appliedRun.status === 'reversed' ? 'Year rollover reversed' : 'Year rollover applied'}</h3>
            <p>{appliedRun.learner_count} learner(s) processed for {decisionYears.source} → {decisionYears.destination} at the selected campus.</p>
            <p>Applied {appliedRun.applied_at ? new Date(appliedRun.applied_at).toLocaleString() : 'successfully'}{appliedRun.applied_by_name ? ` by ${appliedRun.applied_by_name}` : ''}. The original application record is retained.</p>
            {appliedRun.status === 'reversed' && <p>Reversed {appliedRun.reversed_at ? new Date(appliedRun.reversed_at).toLocaleString() : ''}{appliedRun.reversed_by_name ? ` by ${appliedRun.reversed_by_name}` : ''}. Reason: {appliedRun.reversal_reason}</p>}
            {appliedRun.status === 'reversed' && <p>This campus and year pair remains closed to duplicate runs so its apply/reversal audit history stays intact.</p>}
          </div>
          {appliedRun.status !== 'reversed' && <section className="workflow-panel rollover-cycle-panel" aria-labelledby="rollover-reversal-heading">
            <h3 id="rollover-reversal-heading">Audit and reverse this rollover</h3>
            {reversalPreview && <>
              <p>{reversalPreview.eligible_count} of {reversalPreview.learner_count} learner(s) still match the exact placement and enrolment state recorded at application.</p>
              {!reversalPreview.can_reverse && <p className="workflow-error" role="alert">This batch cannot be reversed safely. {reversalPreview.blocked_count} learner record(s) changed after rollover, or the applied audit set is incomplete. Later work will be preserved.</p>}
              {reversalPreview.blocked_count > 0 && <ul>{reversalPreview.rows.filter(row => !row.unchanged).map(row => <li key={row.learner_id}>{row.full_name || 'Learner'} ({row.admission_number || 'no admission number'}) has a different placement or enrolment status.</li>)}</ul>}
              {reversalPreview.can_reverse && <>
                <p>Reversal restores the saved campus, class, stream, and enrolment status for this batch. It does not remove marks, fees, guardian links, or report history. A reason and exact confirmation are recorded in the audit log.</p>
                <label>Reason for reversing this rollover
                  <textarea minLength={10} maxLength={500} value={reversalReason} onChange={event => setReversalReason(event.target.value)} placeholder="At least 10 characters" />
                </label>
                <label>Type <strong>REVERSE YEAR ROLLOVER {decisionYears.source} TO {decisionYears.destination}</strong> to confirm
                  <input value={reversalConfirmation} onChange={event => setReversalConfirmation(event.target.value)} autoComplete="off" />
                </label>
                <button type="button" className="secondary-action" disabled={reversingBatch || batchLoading || reversalReason.trim().length < 10 || reversalConfirmation.trim() !== `REVERSE YEAR ROLLOVER ${decisionYears.source} TO ${decisionYears.destination}`} onClick={reverseYearRollover}>{reversingBatch ? 'Reversing rollover…' : 'Reverse reviewed rollover'}</button>
              </>}
            </>}
            {reversalError && <p className="workflow-error" role="alert">{reversalError}</p>}
          </section>}
        </> : <>
        <div className="rollover-batch-summary">
          <article><span>Active learners</span><strong>{batchPreview.summary?.active_learners ?? 0}</strong></article>
          <article><span>Decisions recorded</span><strong>{batchPreview.summary?.decisions_recorded ?? 0}</strong></article>
          <article><span>Needs decision</span><strong>{batchPreview.summary?.needs_decision ?? 0}</strong></article>
          <article><span>Missing placement</span><strong>{batchPreview.summary?.placements_missing ?? 0}</strong></article>
          <article><span>Capacity exceeded</span><strong>{batchPreview.summary?.capacity_exceeded ?? 0}</strong></article>
          <article><span>Capacity unknown</span><strong>{batchPreview.summary?.capacity_unknown ?? 0}</strong></article>
          <article><span>Ready for review</span><strong>{batchPreview.summary?.ready_for_review ?? 0}</strong></article>
        </div>
        <p className="workflow-notice" role="note">“Ready for review” means the learner has a current roster, a saved decision, and any required configured destination. Capacity overruns block application; capacity not set remains unknown and requires an explicit acknowledgement.</p>
        <div className="workflow-table-wrap"><table className="workflow-table rollover-batch-table">
          <thead><tr><th>Learner</th><th>Current placement</th><th>Decision and reason</th><th>Proposed destination</th><th>Review status</th></tr></thead>
          <tbody>{(batchPreview.rows || []).map(row => <tr key={row.id}>
            <td><strong>{row.full_name || 'Name not recorded'}</strong><small>{row.admission_number || 'Admission number not recorded'}</small></td>
            <td>{row.campus_name || 'Campus not recorded'} · {row.class_level || 'Class not recorded'} · {row.class_stream || 'Stream not set'}</td>
            <td>{row.decision || 'Decision not recorded'}<small>{row.reason || 'Reason not recorded'}</small></td>
            <td>{row.destination_class_level ? `${row.destination_campus_name} · ${row.destination_class_level}${row.destination_stream_name ? ` · ${row.destination_stream_name}` : ''}` : row.decision === 'transfer' || row.decision === 'complete' ? 'No internal destination' : 'Not assigned'}{row.capacity_unknown && <small>Capacity is not set.</small>}</td>
            <td><span className={`rollover-status is-${row.review_status}`}>{row.review_status?.replaceAll('_', ' ')}</span>{row.capacity_status === 'over_capacity' && <small>Proposed roster exceeds configured capacity.</small>}{row.capacity_status === 'unknown' && <small>Capacity is not set; fit is unknown.</small>}{row.capacity_status === 'within_capacity' && <small>Within configured capacity.</small>}{row.reviewer_name && <small>Reviewed by {row.reviewer_name}</small>}</td>
          </tr>)}</tbody>
        </table></div>
        {!batchPreview.rows?.length && <p className="portal-empty-copy">No active learners are in this batch scope.</p>}
        <footer className="rollover-pagination"><span>Page {batchPreview.page} of {batchPreview.total_pages}; {batchPreview.total_count} active learners in scope</span><div className="workflow-actions"><button type="button" className="secondary-action" disabled={batchLoading || batchPage <= 1} onClick={() => setBatchPage(value => Math.max(value - 1, 1))}>Previous batch page</button><button type="button" className="secondary-action" disabled={batchLoading || batchPage >= (batchPreview.total_pages || 1)} onClick={() => setBatchPage(value => value + 1)}>Next batch page</button></div></footer>
        <section className="workflow-panel rollover-cycle-panel" aria-labelledby="rollover-apply-heading">
          <h3 id="rollover-apply-heading">Apply reviewed rollover</h3>
          {!filters.campusId && <p className="workflow-notice" role="note">Select one campus in the roster filter and preview it before applying. Batches run one campus at a time.</p>}
          {completeBatchReview && filters.campusId && <>
            <p>Ready to process {applySummary.active_learners} active learner(s) as one atomic, audited transaction. The transaction updates current placement and enrolment status only; learner IDs, admission numbers, fees, marks, guardian links, and published report history stay linked and unchanged.</p>
            {applySummary.capacity_unknown > 0 && <label className="workflow-checkbox"><input type="checkbox" checked={acceptUnknownCapacity} onChange={event => setAcceptUnknownCapacity(event.target.checked)} /> I acknowledge that capacity is not configured for {applySummary.capacity_unknown} proposed placement(s).</label>}
            <label>Type <strong>{expectedApplyConfirmation}</strong> to confirm
              <input value={applyConfirmation} onChange={event => setApplyConfirmation(event.target.value)} autoComplete="off" />
            </label>
            <button type="button" className="primary-action" disabled={applyingBatch || batchLoading || applyConfirmation.trim() !== expectedApplyConfirmation || (applySummary.capacity_unknown > 0 && !acceptUnknownCapacity)} onClick={applyYearRollover}>{applyingBatch ? 'Applying rollover…' : 'Apply reviewed rollover'}</button>
          </>}
          {!completeBatchReview && <p className="workflow-notice" role="note">Application is unavailable until every active learner has a current reviewed decision and required destination, and no destination is over capacity.</p>}
          {applyError && <p className="workflow-error" role="alert">{applyError}</p>}
        </section>
        </>}
      </section>}
      <section className="workflow-panel rollover-readiness-panel rollover-destination-panel">
        <header className="rollover-panel-heading">
          <div><h2>Destination capacity preview</h2><p>Compare a proposed additional learner count with recorded active roster counts and configured capacity. This is a what-if check only; it does not assign learners.</p></div>
          {destinationLoading && <span role="status">Refreshing destinations…</span>}
        </header>
        {destinationError && <p className="workflow-error" role="alert">{destinationError}</p>}
        {!destinationLoading && !destinationError && destinations.length === 0 && <p className="portal-empty-copy">No active destination classes are configured for this campus filter. Add only school-approved class and stream names in Classes after allocations are confirmed.</p>}
        {destinations.length > 0 && <div className="rollover-destination-content">
          <div className="workflow-form rollover-destination-form">
            <label>Destination class
              <select aria-label="Destination class" value={destinationClassId} onChange={event => { setDestinationClassId(event.target.value); setDestinationStreamId('') }}>
                <option value="">Choose configured class</option>
                {destinations.map(item => <option key={item.id} value={item.id}>{item.campus_name} · {item.class_level}</option>)}
              </select>
            </label>
            {hasStreams && <label>Destination stream
              <select aria-label="Destination stream" value={destinationStreamId} onChange={event => setDestinationStreamId(event.target.value)}>
                <option value="">Choose configured stream</option>
                {destinationStreams.map(item => <option key={item.id} value={item.id}>{item.stream_name}</option>)}
              </select>
            </label>}
            <label>Additional learners proposed
              <input type="number" min="0" step="1" inputMode="numeric" value={proposedCount} onChange={event => setProposedCount(event.target.value)} />
            </label>
          </div>
          {destinationClass && <div className="rollover-destination-details" aria-live="polite">
            <p><strong>Destination:</strong> {destinationClass.campus_name} · {destinationClass.class_level}{hasStreams && destinationStream ? ` · ${destinationStream.stream_name}` : ''}</p>
            <p><strong>Current active count:</strong> {currentDestinationCount == null ? (hasStreams && !destinationStream ? 'Choose a stream' : 'Unavailable') : currentDestinationCount}</p>
            <p><strong>Recorded capacity:</strong> {configuredCapacity == null ? 'Not set' : configuredCapacity}</p>
            <p><strong>Projected total:</strong> {projectedCount == null ? 'Enter a whole number and select a destination' : projectedCount}</p>
            <p className="workflow-notice" role="status">{proposed === null ? 'Enter a whole number of zero or more.' : capacityStatus}</p>
            {hasStreams && destinationClass.unmatched_stream_count > 0 && <p className="workflow-notice" role="note">{destinationClass.unmatched_stream_count} current active learner(s) have an unset or unmatched stream in this class; their destination is unresolved and they are excluded from each stream count.</p>}
            <p className="progress-report-note">A missing capacity stays unknown and is never treated as zero. Proposed counts are not saved.</p>
          </div>}
        </div>}
      </section>
    </section>
  )
}
