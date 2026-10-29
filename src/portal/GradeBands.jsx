import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import {
  GRADE_BAND_GROUPS,
  gradeForPercent,
  referenceBandsFor,
  validateGradeScale,
} from './grade-band-rules'

export default function GradeBands({ profile }) {
  const [campuses, setCampuses] = useState([])
  const [bands, setBands] = useState([])
  const [scope, setScope] = useState(profile.campus_id || 'global')
  const [group, setGroup] = useState('primary')
  const [draft, setDraft] = useState([])
  const [reason, setReason] = useState('')
  const [score, setScore] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inherited, setInherited] = useState(false)
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [campusResult, bandResult] = await Promise.all([
      supabase.from('campuses').select('id,name').order('name'),
      supabase.from('report_grade_bands').select('id,campus_id,band_group,minimum_percent,maximum_percent,grade,points,descriptor,updated_at,campus:campuses(name)').order('minimum_percent', { ascending: false }),
    ])
    const failed = [campusResult, bandResult].find(result => result.error)
    if (failed) setError(workflowError(failed.error))
    else {
      const availableCampuses = profile.campus_id
        ? (campusResult.data || []).filter(item => item.id === profile.campus_id)
        : campusResult.data || []
      setCampuses(availableCampuses)
      setBands(bandResult.data || [])
      setScope(current => profile.campus_id || (current === 'global' || availableCampuses.some(item => item.id === current) ? current : 'global'))
      setError('')
    }
    setLoading(false)
  }, [profile.campus_id])

  useEffect(() => { load() }, [load])

  const scopeCampusId = scope === 'global' ? null : scope
  const activeGroup = useMemo(() => GRADE_BAND_GROUPS.find(item => item.id === group), [group])
  const legacyBands = useMemo(() => bands.filter(item => item.band_group == null), [bands])
  const testLevels = {
    primary: ['ECD A', 'Grade 1', 'Grade 7'],
    olevel: ['Form 1', 'Form 4'],
    alevel: ['Lower Six', 'Upper Six'],
  }[group]
  const testLevel = testLevels[0]
  const testOutcome = score === '' ? null : gradeForPercent(score, testLevel, bands, scopeCampusId)

  useEffect(() => {
    const scoped = bands.filter(item => item.band_group === group && item.campus_id === scopeCampusId)
    const reference = bands.filter(item => item.band_group === group && item.campus_id == null)
    const useInherited = scopeCampusId != null && scoped.length === 0 && reference.length > 0
    const source = scoped.length ? scoped : reference.length ? reference : referenceBandsFor(group)
    setDraft(source.map((item, index) => ({
      ...item,
      draft_key: item.id || `${group}-${index}`,
      minimum_percent: String(item.minimum_percent),
      maximum_percent: String(item.maximum_percent),
      points: String(item.points ?? ''),
      descriptor: item.descriptor || '',
    })))
    setInherited(useInherited)
    setExpectedUpdatedAt(scoped.length ? scoped.reduce((latest, item) => !latest || item.updated_at > latest ? item.updated_at : latest, null) : null)
    setReason('')
    setNotice('')
    setError('')
  }, [bands, group, scopeCampusId])

  function updateBand(draftKey, field, value) {
    setDraft(current => current.map(item => item.draft_key === draftKey ? { ...item, [field]: value } : item))
  }

  function addBand() {
    setDraft(current => [...current, {
      draft_key: `new-${crypto.randomUUID()}`,
      minimum_percent: '', maximum_percent: '', grade: '', points: '', descriptor: '',
    }])
  }

  async function save(event) {
    event.preventDefault()
    const validation = validateGradeScale(draft)
    if (validation) return setError(validation)
    if (reason.trim().length < 8) return setError('Enter a reason of at least 8 characters for this scale change.')
    setSaving(true)
    setError('')
    setNotice('')
    const { error: saveError } = await supabase.rpc('save_report_grade_scale', {
      p_campus_id: scopeCampusId,
      p_band_group: group,
      p_bands: draft.map(item => ({
        minimum_percent: Number(item.minimum_percent),
        maximum_percent: Number(item.maximum_percent),
        grade: item.grade.trim(),
        points: Number(item.points),
        descriptor: item.descriptor.trim(),
      })),
      p_reason: reason.trim(),
      p_expected_updated_at: expectedUpdatedAt,
    })
    if (saveError) setError(workflowError(saveError))
    else {
      setNotice(`${activeGroup.label} scale saved. New and previewed reports will use these boundaries.`)
      await load()
    }
    setSaving(false)
  }

  const scopeLabel = scope === 'global'
    ? 'Reliance reference defaults · temporary'
    : campuses.find(item => item.id === scope)?.name || 'Selected campus'

  return <section>
    <header className="workflow-heading"><div><p className="eyebrow">Formal reports</p><h1>Grade bands</h1><p className="progress-report-note">Reliance’s ECD/Primary, O Level, and A Level sequence is loaded as a temporary reference. Campus overrides can be changed later. Existing issued report snapshots are not recalculated.</p></div></header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {notice && <p className="workflow-notice" role="status">{notice}</p>}
    <section className="workflow-panel workflow-form">
      <label>Scale scope<select value={scope} onChange={event => setScope(event.target.value)} disabled={saving || Boolean(profile.campus_id)}>
        {!profile.campus_id && <option value="global">Reliance reference defaults · temporary</option>}
        {campuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>School level<select value={group} onChange={event => setGroup(event.target.value)} disabled={saving}>{GRADE_BAND_GROUPS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p className="progress-report-note workflow-wide">{activeGroup?.applies} · Scope: {scopeLabel}{inherited ? ' · Editing a copy of the global reference for this campus' : ''}</p>
    </section>
    {loading ? <p role="status">Loading grade scales…</p> : <>
      <form className="workflow-panel" onSubmit={save}>
        <div className="workflow-actions" style={{ justifyContent: 'space-between' }}><h2>{activeGroup?.label}</h2><button type="button" className="secondary-action" onClick={addBand} disabled={saving}>Add band</button></div>
        <div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>From %</th><th>To %</th><th>Grade</th><th>Points</th><th>Meaning</th><th>Action</th></tr></thead><tbody>{draft.map(item => <tr key={item.draft_key}>
          <td><input aria-label={`Minimum percentage for ${item.grade || 'new band'}`} type="number" min="0" max="100" step="1" value={item.minimum_percent} onChange={event => updateBand(item.draft_key, 'minimum_percent', event.target.value)} /></td>
          <td><input aria-label={`Maximum percentage for ${item.grade || 'new band'}`} type="number" min="0" max="100" step="1" value={item.maximum_percent} onChange={event => updateBand(item.draft_key, 'maximum_percent', event.target.value)} /></td>
          <td><input aria-label={`Grade for ${item.grade || 'new band'}`} value={item.grade} onChange={event => updateBand(item.draft_key, 'grade', event.target.value)} /></td>
          <td><input aria-label={`Points for ${item.grade || 'new band'}`} type="number" min="0" max="9" step="1" value={item.points} onChange={event => updateBand(item.draft_key, 'points', event.target.value)} /></td>
          <td><input aria-label={`Descriptor for ${item.grade || 'new band'}`} value={item.descriptor} onChange={event => updateBand(item.draft_key, 'descriptor', event.target.value)} /></td>
          <td><button type="button" className="secondary-action" aria-label={`Remove ${item.grade || 'new band'}`} onClick={() => setDraft(current => current.filter(row => row.draft_key !== item.draft_key))} disabled={saving}>Remove</button></td>
        </tr>)}</tbody></table></div>
        <label>Reason for saving this scale<textarea required minLength={8} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="workflow-actions"><button className="primary-action" disabled={saving}>{saving ? 'Saving scale…' : inherited ? 'Save campus override' : 'Save grade scale'}</button></div>
      </form>
      <section className="workflow-panel">
        <h2>Boundary checker</h2>
        <p className="progress-report-note">The scale uses integer minimum thresholds; a fractional average is floored before matching, following Reliance’s threshold sequence.</p>
        <label>Percentage<input type="number" min="0" max="100" step="0.01" value={score} onChange={event => setScore(event.target.value)} /></label>
        <p role="status">{score === '' ? 'Enter a percentage to check the selected scale.' : testOutcome ? `${testLevel} · ${Number(score).toFixed(2)}% → ${testOutcome.grade} · ${testOutcome.descriptor || testOutcome.description || ''} · ${testOutcome.points ?? '—'} points` : 'No grade band matches this class level and percentage.'}</p>
      </section>
    </>}
    {legacyBands.length > 0 && <section className="workflow-panel"><h2>Unassigned legacy bands</h2><p className="progress-report-note">These existing campus-only rows are preserved. Recognized school levels use the scoped scale above; legacy rows remain as a fallback for class labels without a Reliance mapping.</p><div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>Campus</th><th>Range</th><th>Grade</th><th>Descriptor</th></tr></thead><tbody>{legacyBands.map(item => <tr key={item.id}><td>{item.campus?.name || 'Unscoped legacy row'}</td><td>{item.minimum_percent}%–{item.maximum_percent}%</td><td>{item.grade}</td><td>{item.descriptor || '—'}</td></tr>)}</tbody></table></div></section>}
  </section>
}
