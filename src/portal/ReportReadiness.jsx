import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ReportReadiness() {
  const [campuses, setCampuses] = useState([]), [records, setRecords] = useState([]), [bands, setBands] = useState([]), [settings, setSettings] = useState([]), [publications, setPublications] = useState([]), [error, setError] = useState('')
  const [filters, setFilters] = useState({ campus_id: '', year: String(new Date().getFullYear()), term: 'Term 1' })
  const load = useCallback(async () => {
    const [campusResult, recordResult, bandResult, settingsResult, publicationResult] = await Promise.all([
      supabase.from('campuses').select('id,name').order('name'),
      supabase.from('learner_records').select('student_id,academic_year,academic_term,student:profiles!learner_records_student_id_fkey(campus_id)').eq('kind', 'academic'),
      supabase.from('report_grade_bands').select('campus_id'),
      supabase.from('report_term_settings').select('campus_id,academic_year,academic_term,class_teacher_name,head_of_school_name'),
      supabase.from('report_publications').select('campus_id,academic_year,academic_term,published_at'),
    ])
    const failed = [campusResult, recordResult, bandResult, settingsResult, publicationResult].find(item => item.error)
    if (failed) setError(workflowError(failed.error)); else { setCampuses(campusResult.data || []); setRecords(recordResult.data || []); setBands(bandResult.data || []); setSettings(settingsResult.data || []); setPublications(publicationResult.data || []); setFilters(current => ({ ...current, campus_id: current.campus_id || campusResult.data?.[0]?.id || '' })) }
  }, [])
  useEffect(() => { load() }, [load])
  const readiness = useMemo(() => {
    const period = item => item.campus_id === filters.campus_id && String(item.academic_year) === filters.year && item.academic_term === filters.term
    const marks = records.filter(item => item.student?.campus_id === filters.campus_id && String(item.academic_year) === filters.year && item.academic_term === filters.term)
    const learnerCount = new Set(marks.map(item => item.student_id)).size
    const setup = settings.find(period)
    const publication = publications.find(period)
    return [
      { label: 'Academic records', ready: marks.length > 0, detail: marks.length ? `${marks.length} marks for ${learnerCount} learner${learnerCount === 1 ? '' : 's'}` : 'No academic marks entered' },
      { label: 'Grade bands', ready: bands.some(item => item.campus_id === filters.campus_id), detail: bands.some(item => item.campus_id === filters.campus_id) ? 'Configured for this campus' : 'Grade bands still need setup' },
      { label: 'Approvals', ready: Boolean(setup?.class_teacher_name && setup?.head_of_school_name), detail: setup?.class_teacher_name && setup?.head_of_school_name ? 'Class teacher and head of school set' : 'Approval names still required' },
      { label: 'Release state', ready: Boolean(publication?.published_at), detail: publication?.published_at ? `Published ${new Date(publication.published_at).toLocaleString()}` : 'Draft — not yet released' },
    ]
  }, [bands, filters, publications, records, settings])
  return <section><header className="workflow-heading"><div><p className="eyebrow">Formal reports</p><h1>Report readiness</h1><p className="progress-report-note">Check this period before using Report release.</p></div></header>{error && <p className="workflow-error" role="alert">{error}</p>}<section className="workflow-panel workflow-form"><label>Campus<select value={filters.campus_id} onChange={e => setFilters({ ...filters, campus_id: e.target.value })}>{campuses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Academic year<input type="number" value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })} /></label><label>Term<select value={filters.term} onChange={e => setFilters({ ...filters, term: e.target.value })}>{['Term 1','Term 2','Term 3'].map(item => <option key={item}>{item}</option>)}</select></label></section><section className="report-readiness-grid">{readiness.map(item => <article className={item.ready ? 'is-ready' : 'needs-attention'} key={item.label}><span>{item.ready ? 'Ready' : 'Action needed'}</span><h2>{item.label}</h2><p>{item.detail}</p></article>)}</section></section>
}
