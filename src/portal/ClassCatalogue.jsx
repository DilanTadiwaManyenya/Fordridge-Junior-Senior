import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ClassCatalogue() {
  const [campuses, setCampuses] = useState([])
  const [classes, setClasses] = useState([])
  const [draft, setDraft] = useState({ campus_id: '', class_level: '' })
  const [streamDrafts, setStreamDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [locations, catalogue] = await Promise.all([
        supabase.from('campuses').select('id,name').order('name'),
        supabase
          .from('school_classes')
          .select('id,campus_id,class_level,is_active,campus:campuses(name),streams:school_class_streams(id,stream_name,is_active,capacity)')
          .order('class_level'),
      ])
      if (locations.error || catalogue.error)
        throw locations.error || catalogue.error
      setCampuses(locations.data || [])
      setClasses(catalogue.data || [])
    } catch (failure) {
      setError(workflowError(failure))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addClass(event) {
    event.preventDefault()
    if (saving) return
    const classLevel = draft.class_level.trim()
    if (!draft.campus_id || !classLevel) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { error: insertError } = await supabase
        .from('school_classes')
        .insert({ campus_id: draft.campus_id, class_level: classLevel })
      if (insertError) throw insertError
      setDraft((current) => ({ ...current, class_level: '' }))
      setNotice('Class added. Streams remain unset until the school allocates them.')
      await load()
    } catch (failure) {
      setError(workflowError(failure))
    } finally {
      setSaving(false)
    }
  }

  async function addStream(classId) {
    const streamName = streamDrafts[classId]?.trim()
    if (!streamName || busyId) return
    setBusyId(classId)
    setError('')
    setNotice('')
    try {
      const { error: insertError } = await supabase
        .from('school_class_streams')
        .insert({ class_id: classId, stream_name: streamName })
      if (insertError) throw insertError
      setStreamDrafts((current) => ({ ...current, [classId]: '' }))
      setNotice('Stream added. Capacity remains unset.')
      await load()
    } catch (failure) {
      setError(workflowError(failure))
    } finally {
      setBusyId('')
    }
  }

  async function setActive(table, id, isActive) {
    if (busyId) return
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      const { error: updateError } = await supabase
        .from(table)
        .update({ is_active: isActive })
        .eq('id', id)
      if (updateError) throw updateError
      setNotice(isActive ? 'Catalogue entry reactivated.' : 'Catalogue entry deactivated. Its history was retained.')
      await load()
    } catch (failure) {
      setError(workflowError(failure))
    } finally {
      setBusyId('')
    }
  }

  const activeClasses = classes.filter((item) => item.is_active)
  const inactiveClasses = classes.filter((item) => !item.is_active)
  const renderClass = (item) => (
    <article className="workflow-panel" key={item.id}>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">{item.campus?.name || 'Fordridge campus'}</p>
          <h2>{item.class_level}</h2>
          <p className="progress-report-note">
            {item.is_active ? 'Active class' : 'Inactive class'} · streams and capacity are optional
          </p>
        </div>
        <button
          type="button"
          disabled={busyId === item.id}
          onClick={() => setActive('school_classes', item.id, !item.is_active)}
        >
          {item.is_active ? 'Deactivate class' : 'Reactivate class'}
        </button>
      </header>
      {item.streams?.length ? (
        <ul className="portal-class-stream-list">
          {item.streams.map((stream) => (
            <li key={stream.id}>
              <span>{stream.stream_name}{stream.capacity ? ` · Capacity ${stream.capacity}` : ' · Capacity unset'}{!stream.is_active ? ' · Inactive' : ''}</span>
              <button
                type="button"
                disabled={busyId === stream.id || !item.is_active}
                onClick={() => setActive('school_class_streams', stream.id, !stream.is_active)}
              >
                {stream.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="portal-empty-copy">No streams allocated.</p>}
      {item.is_active && (
        <form className="workflow-form portal-class-stream-form" onSubmit={(event) => { event.preventDefault(); addStream(item.id) }}>
          <label>
            Add a confirmed stream
            <input
              value={streamDrafts[item.id] || ''}
              maxLength={80}
              onChange={(event) => setStreamDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
              placeholder="Leave blank until allocation is confirmed"
            />
          </label>
          <button type="submit" disabled={!streamDrafts[item.id]?.trim() || busyId === item.id}>
            {busyId === item.id ? 'Saving…' : 'Add stream'}
          </button>
        </form>
      )}
    </article>
  )

  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Academic services</p>
          <h1>Classes</h1>
          <p className="progress-report-note">The catalogue starts empty. Add only school-confirmed class names and stream allocations; capacity stays unset.</p>
        </div>
      </header>
      {error && <p role="alert" className="workflow-error">{error}</p>}
      {notice && <p role="status" className="workflow-notice">{notice}</p>}
      <form className="workflow-panel workflow-form" onSubmit={addClass}>
        <h2>Add a confirmed class</h2>
        <label>
          Campus
          <select required value={draft.campus_id} onChange={(event) => setDraft((current) => ({ ...current, campus_id: event.target.value }))}>
            <option value="">Select campus</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label>
          Class name
          <input required maxLength={80} value={draft.class_level} onChange={(event) => setDraft((current) => ({ ...current, class_level: event.target.value }))} placeholder="Enter only after the school confirms the name" />
        </label>
        <button className="primary-action" type="submit" disabled={saving || loading || !draft.campus_id || !draft.class_level.trim()}>
          {saving ? 'Saving…' : 'Add class'}
        </button>
      </form>
      {loading ? <p role="status">Loading classes…</p> : activeClasses.length ? <div>{activeClasses.map(renderClass)}</div> : (
        <section className="workflow-panel"><h2>No classes configured</h2><p className="portal-empty-copy">No class names, streams, or capacities were preloaded. The catalogue stays empty until Fordridge confirms them.</p></section>
      )}
      {inactiveClasses.length > 0 && <section><h2>Inactive classes</h2>{inactiveClasses.map(renderClass)}</section>}
    </section>
  )
}
