import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function BulkAttendance({ profile }) {
  const [classes, setClasses] = useState([]), [learners, setLearners] = useState([]), [classKey, setClassKey] = useState(''), [date, setDate] = useState(new Date().toLocaleDateString('en-CA')), [status, setStatus] = useState({}), [notice, setNotice] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const admin = profile.role === 'admin'
  const load = useCallback(async () => {
    let query = supabase.from('profiles').select('id,full_name,class_level,class_stream,campus_id').eq('role', 'student').neq('enrollment_status', 'inactive').order('class_level').order('class_stream').order('full_name')
    if (!admin) query = query.eq('campus_id', profile.campus_id)
    const { data, error } = await query
    if (error) { setError(workflowError(error)); return }
    setLearners(data || [])
    let groups = [...new Set((data || []).filter(item => item.class_level).map(item => `${item.class_level}||${item.class_stream || ''}`))]
    if (!admin) { const assignments = await supabase.from('teacher_class_assignments').select('class_level,class_stream').eq('teacher_id', profile.id); if (assignments.error) { setError(workflowError(assignments.error)); return } const allowed = new Set((assignments.data || []).map(item => `${item.class_level}||${item.class_stream || ''}`)); groups = groups.filter(item => allowed.has(item)) }
    setClasses(groups)
    setClassKey(current => current || groups[0] || '')
  }, [admin, profile.campus_id])
  useEffect(() => { load() }, [load])
  const [level, stream] = classKey.split('||')
  const selected = learners.filter(item => item.class_level === level && (item.class_stream || '') === stream)
  useEffect(() => setStatus(Object.fromEntries(selected.map(item => [item.id, 'present']))), [classKey])
  async function save(event) { event.preventDefault(); if (!selected.length || saving) return; setSaving(true); setError(''); setNotice(''); const { error } = await supabase.rpc('record_bulk_attendance', { p_event_date: date, p_entries: selected.map(item => ({ student_id: item.id, attendance_status: status[item.id] || 'present' })) }); if (error) setError(workflowError(error)); else setNotice(`Attendance saved for ${selected.length} learner${selected.length === 1 ? '' : 's'}.`); setSaving(false) }
  return <section><header className="workflow-heading"><div><p className="eyebrow">Class register</p><h1>Bulk attendance</h1><p className="progress-report-note">Mark attendance for a whole class in one submission.</p></div></header>{error && <p className="workflow-error" role="alert">{error}</p>}{notice && <p className="workflow-notice" role="status">{notice}</p>}<form className="workflow-panel" onSubmit={save}><div className="bulk-attendance-controls"><label>Class<select value={classKey} onChange={e => setClassKey(e.target.value)}>{classes.map(item => <option key={item} value={item}>{item.replace('||', ' · ')}</option>)}</select></label><label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label></div>{selected.length ? <><div className="bulk-attendance-list">{selected.map(learner => <label key={learner.id}><span>{learner.full_name}</span><select value={status[learner.id] || 'present'} onChange={e => setStatus({ ...status, [learner.id]: e.target.value })}>{['present', 'late', 'absent', 'excused'].map(item => <option key={item}>{item}</option>)}</select></label>)}</div><button className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save class attendance'}</button></> : <p className="portal-empty-copy">No active learners with class details are available. Add class and stream details in Learners first.</p>}</form></section>
}
