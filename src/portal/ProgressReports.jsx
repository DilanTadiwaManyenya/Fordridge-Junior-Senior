import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ProgressReports({ profile }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [learnerId, setLearnerId] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [term, setTerm] = useState('Term 1')
  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('learner_records').select('student_id,title,score,max_score,event_date,academic_year,academic_term,student:profiles!learner_records_student_id_fkey(full_name,admission_number,class_level,class_stream)').eq('kind', 'academic').order('event_date', { ascending: false })
    if (result.error) setError(workflowError(result.error)); else { setRecords(result.data || []); setLearnerId(current => current || result.data?.[0]?.student_id || '') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const learners = useMemo(() => Array.from(new Map(records.map(record => [record.student_id, record.student])).entries()).map(([id, student]) => ({ id, ...student })), [records])
  const selected = learners.find(item => item.id === learnerId)
  const report = records.filter(record => record.student_id === learnerId && (!year || String(record.academic_year || '') === year) && (!term || record.academic_term === term))
  const average = report.length ? report.reduce((sum, record) => sum + (Number(record.score) / Number(record.max_score)) * 100, 0) / report.length : null
  return <section className="progress-reports"><header className="workflow-heading"><div><p className="eyebrow">Academic progress</p><h1>Progress reports</h1><p className="progress-report-note">Marks reflect records entered into the portal. [EDIT THIS] Confirm the official Fordridge report-card format and grading scale before issuing formal reports.</p></div><button className="primary-action" onClick={() => window.print()} disabled={!report.length}>Print report</button></header>{error && <p className="workflow-error" role="alert">{error}</p>}{loading ? <p role="status">Loading progress records…</p> : <><section className="workflow-panel progress-report-controls"><label>Learner<select value={learnerId} onChange={event => setLearnerId(event.target.value)}>{learners.map(learner => <option key={learner.id} value={learner.id}>{learner.full_name || 'Learner'}{learner.class_level ? ` · ${learner.class_level}` : ''}</option>)}</select></label><label>Academic year<input type="number" value={year} onChange={event => setYear(event.target.value)} /></label><label>Term<select value={term} onChange={event => setTerm(event.target.value)}>{['Term 1', 'Term 2', 'Term 3'].map(item => <option key={item}>{item}</option>)}</select></label></section><article className="progress-report-sheet"><div className="progress-report-heading"><div><p className="eyebrow">Fordridge Schools</p><h2>Academic progress report</h2><p>{year} · {term}</p></div><div><strong>{selected?.full_name || 'Learner'}</strong><small>{[selected?.admission_number, selected?.class_level, selected?.class_stream].filter(Boolean).join(' · ') || 'Learner details [EDIT THIS]'}</small></div></div>{report.length ? <><table className="workflow-table"><thead><tr><th>Subject / assessment</th><th>Date</th><th>Mark</th><th>Percentage</th></tr></thead><tbody>{report.map(record => { const percent = Math.round((Number(record.score) / Number(record.max_score)) * 100); return <tr key={`${record.student_id}-${record.title}-${record.event_date}`}><td>{record.title}</td><td>{record.event_date}</td><td>{record.score} / {record.max_score}</td><td>{percent}%</td></tr> })}</tbody></table><div className="progress-report-total"><strong>Average recorded mark</strong><b>{average?.toFixed(1)}%</b></div></> : <p className="portal-empty-copy">No academic records have been entered for this learner, year and term.</p>}</article></>}</section>
}
