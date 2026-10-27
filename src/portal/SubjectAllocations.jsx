import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const emptyDraft = () => ({ teacher_id: '', campus_id: '', class_id: '', class_stream_id: '', subject: '' })

export default function SubjectAllocations({ profile }) {
  const admin = profile.role === 'admin'
  const [items, setItems] = useState([])
  const [teachers, setTeachers] = useState([])
  const [campuses, setCampuses] = useState([])
  const [classes, setClasses] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    let allocationQuery = supabase.from('teacher_class_assignments')
      .select('id,class_id,class_stream_id,class_level,class_stream,subject,assignment_kind,teacher_id,teacher:profiles!teacher_class_assignments_teacher_id_fkey(full_name),campus:campuses(id,name)')
      .not('subject', 'is', null)
      .order('class_level')
    if (!admin) allocationQuery = allocationQuery.eq('teacher_id', profile.id).eq('campus_id', profile.campus_id)
    const [allocations, staff, schools, catalogue] = await Promise.all([
      allocationQuery,
      admin ? supabase.from('profiles').select('id,full_name,campus_id').eq('role', 'teacher').order('full_name') : Promise.resolve({ data: [], error: null }),
      admin ? supabase.from('campuses').select('id,name').order('name') : Promise.resolve({ data: [], error: null }),
      admin ? supabase.from('school_classes').select('id,campus_id,class_level,is_active,streams:school_class_streams(id,stream_name,is_active)').eq('is_active', true).order('class_level') : Promise.resolve({ data: [], error: null }),
    ])
    const failed = [allocations, staff, schools, catalogue].find(result => result.error)
    if (failed) setError(workflowError(failed.error))
    else {
      setItems(allocations.data || [])
      setTeachers(staff.data || [])
      setCampuses(schools.data || [])
      setClasses(catalogue.data || [])
    }
  }, [admin, profile.id])

  useEffect(() => { load() }, [load])

  const campusClasses = classes.filter(item => item.campus_id === draft?.campus_id)
  const selectedClass = campusClasses.find(item => item.id === draft?.class_id)
  const activeStreams = (selectedClass?.streams || []).filter(item => item.is_active)

  function startLegacyLink(item) {
    const match = classes.find(candidate =>
      candidate.campus_id === item.campus?.id
      && candidate.class_level.trim().toLowerCase() === item.class_level.trim().toLowerCase(),
    )
    if (!match) return
    const stream = item.class_stream
      ? (match.streams || []).find(candidate => candidate.is_active && candidate.stream_name.trim().toLowerCase() === item.class_stream.trim().toLowerCase())
      : null
    if (item.class_stream && !stream) return
    setDraft({ assignment_id: item.id, campus_id: item.campus?.id || '', class_id: match.id, class_stream_id: stream?.id || '' })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const classRow = classes.find(item => item.id === draft.class_id)
    const streamRow = (classRow?.streams || []).find(item => item.id === draft.class_stream_id)
    const result = draft.assignment_id
      ? await supabase.from('teacher_class_assignments').update({ class_id: draft.class_id, class_stream_id: draft.class_stream_id || null }).eq('id', draft.assignment_id)
      : await supabase.from('teacher_class_assignments').insert({
        teacher_id: draft.teacher_id,
        campus_id: draft.campus_id,
        class_id: draft.class_id,
        class_stream_id: draft.class_stream_id || null,
        class_level: classRow?.class_level || '',
        class_stream: streamRow?.stream_name || null,
        subject: draft.subject.trim(),
        assignment_kind: 'subject',
      })
    if (result.error) setError(workflowError(result.error))
    else { setDraft(null); await load() }
    setSaving(false)
  }

  return <section>
    <header className="workflow-heading">
      <div><p className="eyebrow">Teaching workspace</p><h1>Subject allocations</h1><p className="progress-report-note">{admin ? 'Allocate a confirmed subject to a teacher, class and optional stream. Markbook writes require this allocation.' : 'Review subjects allocated to your classes and streams. Markbook writes require an allocation; subject-only allocations do not grant class-register attendance access.'}</p></div>
      {admin && <button className="primary-action" onClick={() => { setError(''); setDraft(emptyDraft()) }}>+ Allocate subject</button>}
    </header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {draft && <form className="workflow-panel workflow-form" onSubmit={save}>
      {!draft.assignment_id && <label>Teacher<select required value={draft.teacher_id} onChange={event => setDraft({ ...draft, teacher_id: event.target.value })}><option value="">Select teacher</option>{teachers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>}
      {!draft.assignment_id && <label>Campus<select required value={draft.campus_id} onChange={event => setDraft({ ...draft, campus_id: event.target.value, class_id: '', class_stream_id: '' })}><option value="">Select campus</option>{campuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label>Class / form<select required value={draft.class_id} onChange={event => setDraft({ ...draft, class_id: event.target.value, class_stream_id: '' })}><option value="">Select confirmed class</option>{campusClasses.map(item => <option key={item.id} value={item.id}>{item.class_level}</option>)}</select></label>
      <label>Stream<select value={draft.class_stream_id} onChange={event => setDraft({ ...draft, class_stream_id: event.target.value })}><option value="">All streams (whole class)</option>{activeStreams.map(item => <option key={item.id} value={item.id}>{item.stream_name}</option>)}</select></label>
      {!draft.assignment_id && <label>Subject<input required maxLength={100} value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} /></label>}
      {!classes.length && <p className="portal-empty-copy">The class catalogue is empty. Confirm class and stream allocations in Classes before assigning subjects. No subjects are preloaded.</p>}
      <div className="workflow-actions"><button className="primary-action" disabled={saving || !draft.class_id || (!draft.assignment_id && !draft.subject.trim())}>{saving ? 'Saving…' : draft.assignment_id ? 'Link allocation' : 'Save allocation'}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    <section className="workflow-panel"><div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Teacher</th><th>Campus</th><th>Class and scope</th><th>Subject</th>{admin && <th>Link status</th>}</tr></thead><tbody>{items.map(item => {
      const canonical = Boolean(item.class_id)
      const match = classes.find(candidate => candidate.id === item.class_id)
      const stream = match?.streams?.find(candidate => candidate.id === item.class_stream_id)
      const canLink = !canonical && admin && classes.some(candidate => candidate.campus_id === item.campus?.id && candidate.class_level.trim().toLowerCase() === item.class_level.trim().toLowerCase() && (!item.class_stream || candidate.streams?.some(value => value.is_active && value.stream_name.trim().toLowerCase() === item.class_stream.trim().toLowerCase())))
      return <tr key={item.id}><td>{item.teacher?.full_name}</td><td>{item.campus?.name}</td><td>{match?.class_level || item.class_level}{(stream?.stream_name || item.class_stream) ? ` · ${stream?.stream_name || item.class_stream}` : ' · All streams'}</td><td>{item.subject}</td>{admin && <td>{item.assignment_kind === 'subject' ? canonical ? 'Linked' : canLink ? <button type="button" onClick={() => startLegacyLink(item)}>Link to catalogue</button> : 'Legacy · pending catalogue match' : 'Legacy class + subject'}</td>}</tr>
    })}</tbody></table>{!items.length && <p className="portal-empty-copy">No subject allocations have been created yet.</p>}</div></section>
  </section>
}
