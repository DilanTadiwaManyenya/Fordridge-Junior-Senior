import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ProgressReports({ profile }) {
  const [records, setRecords] = useState([])
  const [bands, setBands] = useState([])
  const [ranking, setRanking] = useState(null)
  const [signatories, setSignatories] = useState([])
  const [reportSettings, setReportSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [learnerId, setLearnerId] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [term, setTerm] = useState('Term 1')
  const load = useCallback(async () => {
    setLoading(true)
    const [result, bandResult, settingsResult] = await Promise.all([
      supabase.from('learner_records').select('student_id,title,score,max_score,event_date,academic_year,academic_term,student:profiles!learner_records_student_id_fkey(full_name,admission_number,class_level,class_stream,campus_id)').eq('kind', 'academic').order('event_date', { ascending: false }),
      supabase.from('report_grade_bands').select('*').order('minimum_percent', { ascending: false }),
      supabase.from('report_term_settings').select('*'),
    ])
    if (result.error) setError(workflowError(result.error)); else { setRecords(result.data || []); setLearnerId(current => current || result.data?.[0]?.student_id || '') }
    if (bandResult.error) setError(workflowError(bandResult.error)); else setBands(bandResult.data || [])
    if (settingsResult.error) setError(workflowError(settingsResult.error)); else setReportSettings(settingsResult.data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const learners = useMemo(() => Array.from(new Map(records.map(record => [record.student_id, record.student])).entries()).map(([id, student]) => ({ id, ...student })), [records])
  const selected = learners.find(item => item.id === learnerId)
  const report = records.filter(record => record.student_id === learnerId && (!year || String(record.academic_year || '') === year) && (!term || record.academic_term === term))
  const average = report.length ? report.reduce((sum, record) => sum + (Number(record.score) / Number(record.max_score)) * 100, 0) / report.length : null
  const gradeBand = average === null ? null : bands.find(band => band.campus_id === selected?.campus_id && average >= Number(band.minimum_percent) && average <= Number(band.maximum_percent))
  const activeSettings = reportSettings.find(setting => setting.campus_id === selected?.campus_id && String(setting.academic_year) === year && setting.academic_term === term)
  useEffect(() => {
    let active = true
    if (!learnerId || !year || !term) { setRanking(null); return undefined }
    supabase.rpc('report_class_ranking', { p_student_id: learnerId, p_academic_year: Number(year), p_academic_term: term }).then(({ data }) => {
      if (active) setRanking(data?.[0] || null)
    })
    return () => { active = false }
  }, [learnerId, year, term])
  useEffect(() => {
    let active = true
    if (!learnerId) { setSignatories([]); return undefined }
    supabase.rpc('report_subject_signatories', { p_student_id: learnerId }).then(({ data }) => {
      if (active) setSignatories(data || [])
    })
    return () => { active = false }
  }, [learnerId])
  const initialsFor = subject => signatories.find(item => item.subject?.trim().toLowerCase() === subject?.trim().toLowerCase())?.teacher_initials || '—'
  return <section className="progress-reports"><header className="workflow-heading"><div><p className="eyebrow">Academic progress</p><h1>Progress reports</h1><p className="progress-report-note">Marks reflect records entered into the portal. [EDIT THIS] Confirm the official Fordridge report-card format and grading scale before issuing formal reports.</p></div><button className="primary-action" onClick={() => window.print()} disabled={!report.length}>Print report</button></header>{error && <p className="workflow-error" role="alert">{error}</p>}{loading ? <p role="status">Loading progress records…</p> : <><section className="workflow-panel progress-report-controls"><label>Learner<select value={learnerId} onChange={event => setLearnerId(event.target.value)}>{learners.map(learner => <option key={learner.id} value={learner.id}>{learner.full_name || 'Learner'}{learner.class_level ? ` · ${learner.class_level}` : ''}</option>)}</select></label><label>Academic year<input type="number" value={year} onChange={event => setYear(event.target.value)} /></label><label>Term<select value={term} onChange={event => setTerm(event.target.value)}>{['Term 1', 'Term 2', 'Term 3'].map(item => <option key={item}>{item}</option>)}</select></label></section><article className="progress-report-sheet"><div className="progress-report-heading"><div><p className="eyebrow">Fordridge Schools</p><h2>Academic progress report</h2><p>{year} · {term}</p></div><div><strong>{selected?.full_name || 'Learner'}</strong><small>{[selected?.admission_number, selected?.class_level, selected?.class_stream].filter(Boolean).join(' · ') || 'Learner details [EDIT THIS]'}</small></div></div>{report.length ? <><section className="report-summary" aria-label="Report summary"><article><span>Average</span><strong>{average?.toFixed(1)}%</strong><small>Recorded assessments</small></article><article><span>Grade</span><strong>{gradeBand?.grade || '—'}</strong><small>{gradeBand?.descriptor || 'Grade band not configured'}</small></article><article><span>Class ranking</span><strong>{ranking ? `${ranking.class_rank} / ${ranking.class_size}` : '—'}</strong><small>{ranking ? 'Position / class size' : 'Ranking unavailable'}</small></article></section><table className="workflow-table"><thead><tr><th>Subject / assessment</th><th>Date</th><th>Mark</th><th>Percentage</th><th>Sign</th></tr></thead><tbody>{report.map(record => { const percent = Math.round((Number(record.score) / Number(record.max_score)) * 100); return <tr key={`${record.student_id}-${record.title}-${record.event_date}`}><td>{record.title}</td><td>{record.event_date}</td><td>{record.score} / {record.max_score}</td><td>{percent}%</td><td className="report-sign-cell" aria-label={`Teacher initials for ${record.title}`}>{initialsFor(record.title)}</td></tr> })}</tbody></table><div className="progress-report-total"><strong>Average recorded mark</strong><b>{average?.toFixed(1)}%</b></div><footer className="report-approvals"><div><span>Class teacher</span><strong>{activeSettings?.class_teacher_name || '[EDIT THIS]'}</strong></div><div><span>Head of school</span><strong>{activeSettings?.head_of_school_name || '[EDIT THIS]'}</strong></div>{activeSettings?.next_term_begins_on && <div><span>Next term begins</span><strong>{new Date(`${activeSettings.next_term_begins_on}T00:00:00`).toLocaleDateString()}</strong></div>}</footer></> : <p className="portal-empty-copy">No academic records have been entered for this learner, year and term.</p>}</article></>}</section>
}
