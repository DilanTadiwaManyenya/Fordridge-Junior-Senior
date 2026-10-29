import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const same = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()

function localDateValue(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export default function BulkMarks({ profile, assessmentType = 'markbook' }) {
  const admin = profile.role === 'admin'
  const [learners, setLearners] = useState([])
  const [allocations, setAllocations] = useState([])
  const [periods, setPeriods] = useState([])
  const [groups, setGroups] = useState([])
  const [group, setGroup] = useState('')
  const [subject, setSubject] = useState('')
  const [marks, setMarks] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', event_date: new Date().toLocaleDateString('en-CA'), academic_year: String(new Date().getFullYear()), academic_term: 'Term 1', max_score: '100' })
  const load = useCallback(async () => {
    const [students, assigned, reportingPeriods] = await Promise.all([
      supabase.from('profiles').select('id,full_name,class_level,class_stream,campus_id,campus:campuses(name)').eq('role', 'student').neq('enrollment_status', 'inactive').order('full_name'),
      supabase.from('teacher_class_assignments').select('id,teacher_id,campus_id,class_level,class_stream,subject,campus:campuses(name)').not('subject', 'is', null).order('class_level'),
      supabase.from('reporting_periods').select('campus_id,academic_year,academic_term,period_status'),
    ])
    if (students.error) { setError(workflowError(students.error)); return }
    if (assigned.error) { setError(workflowError(assigned.error)); return }
    if (reportingPeriods.error) { setError(workflowError(reportingPeriods.error)); return }
    const availableAllocations = (assigned.data || []).filter(item => admin || item.teacher_id === profile.id)
    const keys = new Set()
    const same = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
    for (const learner of students.data || []) {
      const allowed = availableAllocations.some(item => item.campus_id === learner.campus_id && same(item.class_level, learner.class_level) && (!item.class_stream || same(item.class_stream, learner.class_stream)))
      if (allowed) keys.add(JSON.stringify([learner.campus_id, learner.class_level, learner.class_stream || '']))
    }
    setLearners(students.data || [])
    setAllocations(availableAllocations)
    setPeriods(reportingPeriods.data || [])
    setGroups([...keys])
    setGroup(current => keys.has(current) ? current : [...keys][0] || '')
  }, [admin, profile.id])
  useEffect(() => { load() }, [load])
  const [campusId, level, stream] = useMemo(() => { try { return JSON.parse(group) } catch { return [] } }, [group])
  const selected = useMemo(() => learners.filter(item => item.campus_id === campusId && same(item.class_level, level) && same(item.class_stream, stream)), [learners, campusId, level, stream])
  const subjectOptions = useMemo(() => [...new Map(allocations.filter(item => item.campus_id === campusId && same(item.class_level, level) && (!item.class_stream || same(item.class_stream, stream))).map(item => [item.subject.trim().toLowerCase(), item.subject.trim()])).values()], [allocations, campusId, level, stream])
  const periodClosed = periods.some(item => item.campus_id === campusId && Number(item.academic_year) === Number(form.academic_year) && item.academic_term === form.academic_term && item.period_status === 'closed')
  const subjectKey = subjectOptions.join('|')
  useEffect(() => {
    if (!subjectOptions.includes(subject)) setSubject(subjectOptions[0] || '')
  }, [subject, subjectKey])
  useEffect(() => {
    setMarks(Object.fromEntries(selected.map(item => [item.id, ''])))
  }, [selected])
  async function save(event) {
    event.preventDefault()
    if (periodClosed) return setError('This reporting period is closed. Contact an administrator before changing marks.')
    if (!form.title.trim()) return setError('Enter an assessment title.')
    if (!subject) return setError('Choose a subject allocated to this class.')
    if (!form.event_date || form.event_date > localDateValue()) return setError('Enter an assessment date that is today or earlier.')
    if (!Number.isInteger(Number(form.academic_year)) || Number(form.academic_year) !== Number(form.event_date.slice(0, 4))) return setError('The academic year must match the assessment date.')
    const maxScore = Number(form.max_score)
    if (!Number.isFinite(maxScore) || maxScore <= 0) return setError('Enter a maximum score greater than zero.')
    if (selected.some(item => marks[item.id] === '' || !Number.isFinite(Number(marks[item.id])))) return setError('Enter a numeric mark for every learner.')
    if (selected.some(item => Number(marks[item.id]) < 0 || Number(marks[item.id]) > maxScore)) return setError('Every mark must be between zero and the maximum score.')
    setSaving(true); setError(''); setNotice('')
    const rpc = assessmentType === 'coursework' ? 'record_bulk_coursework_marks' : 'record_bulk_marks'
    const { error } = await supabase.rpc(rpc, {
      p_title: form.title.trim(), p_subject: subject, p_event_date: form.event_date,
      p_academic_year: Number(form.academic_year), p_academic_term: form.academic_term,
      p_max_score: maxScore,
      p_entries: selected.map(item => ({ student_id: item.id, score: Number(marks[item.id]) })),
    })
    if (error) setError(workflowError(error))
    else setNotice(subject + (assessmentType === 'coursework' ? ' coursework marks saved for ' : ' marks saved for ') + selected.length + ' learners.')
    setSaving(false)
  }
  const isCoursework = assessmentType === 'coursework'
  return <section><header className="workflow-heading"><div><p className="eyebrow">{isCoursework ? 'Course Work' : 'Assessment register'}</p><h1>{isCoursework ? 'Course Work' : 'Bulk mark entry'}</h1><p className="progress-report-note">{isCoursework ? 'Record raw coursework marks for your allocated learners. School weighting rules have not been configured.' : 'Enter marks only for a subject allocated to this class and teacher.'}</p></div></header>{periodClosed && <p className="workflow-error" role="alert">This reporting period is closed. Contact an administrator before changing marks.</p>}{error && <p className="workflow-error" role="alert">{error}</p>}{notice && <p className="workflow-notice" role="status">{notice}</p>}<form className="workflow-panel" onSubmit={save}><div className="bulk-marks-controls"><label>Class<select value={group} onChange={event => setGroup(event.target.value)}><option value="">Select class</option>{groups.map(key => { const [id, classLevel, classStream] = JSON.parse(key); const learner = learners.find(item => item.campus_id === id && same(item.class_level, classLevel) && same(item.class_stream, classStream)); return <option key={key} value={key}>{learner?.campus?.name || 'Campus'} · {classLevel}{classStream ? ` · ${classStream}` : ' · All streams'}</option> })}</select></label><label>Subject<select required value={subject} onChange={event => setSubject(event.target.value)}><option value="">Select allocated subject</option>{subjectOptions.map(item => <option key={item}>{item}</option>)}</select></label><label>{isCoursework ? 'Coursework title' : 'Assessment title'}<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label>Date<input type="date" max={localDateValue()} required value={form.event_date} onChange={event => setForm({ ...form, event_date: event.target.value })} /></label><label>Year<input type="number" min="2000" max={new Date().getFullYear()} required value={form.academic_year} onChange={event => setForm({ ...form, academic_year: event.target.value })} /></label><label>Term<select value={form.academic_term} onChange={event => setForm({ ...form, academic_term: event.target.value })}>{['Term 1', 'Term 2', 'Term 3'].map(item => <option key={item}>{item}</option>)}</select></label><label>Out of<input type="number" min="0.01" required value={form.max_score} onChange={event => setForm({ ...form, max_score: event.target.value })} /></label></div>{selected.length && subject ? <><div className="bulk-marks-list">{selected.map(item => <label key={item.id}><span>{item.full_name}</span><input type="number" min="0" max={form.max_score} step="0.01" required value={marks[item.id] || ''} onChange={event => setMarks({ ...marks, [item.id]: event.target.value })} /></label>)}</div><button className="primary-action" disabled={saving || periodClosed}>{saving ? 'Saving…' : isCoursework ? 'Save coursework marks' : 'Save subject marks'}</button></> : <p className="portal-empty-copy">{allocations.length ? 'Choose an allocated class and subject to start mark entry.' : 'No subject allocations are available yet. Ask an administrator to add confirmed subjects in Subject allocations.'}</p>}</form></section>
}
