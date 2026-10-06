import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ReportArchive() {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('report_publications').select('id,academic_year,academic_term,published_at,campus:campuses(name)').not('published_at', 'is', null).order('published_at', { ascending: false })
    if (loadError) setError(workflowError(loadError)); else setItems(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  return <section><header className="workflow-heading"><div><p className="eyebrow">Academic progress</p><h1>Published report archive</h1><p className="progress-report-note">Only officially released report periods appear here.</p></div><Link className="primary-action" to="/portal/reports">Open progress reports</Link></header>{error && <p className="workflow-error" role="alert">{error}</p>}{loading ? <p role="status">Loading published reports…</p> : <section className="workflow-panel report-archive-list">{items.length ? items.map(item => <article key={item.id}><div><strong>{item.campus?.name || 'Fordridge Schools'} · {item.academic_year} · {item.academic_term}</strong><small>Released {new Date(item.published_at).toLocaleString()}</small></div><Link to="/portal/reports">View report</Link></article>) : <p className="portal-empty-copy">No report periods have been published for your school yet.</p>}</section>}</section>
}
