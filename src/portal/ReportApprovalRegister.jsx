import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ReportApprovalRegister() {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); const { data, error: loadError } = await supabase.from('report_release_snapshots').select('id,academic_year,academic_term,class_teacher_name,head_of_school_name,released_at,publication:report_publications!report_release_snapshots_publication_id_fkey(campus:campuses(name))').order('released_at', { ascending: false }); if (loadError) setError(workflowError(loadError)); else setItems(data || []); setLoading(false) }, [])
  useEffect(() => { load() }, [load])
  return <section><header className="workflow-heading"><div><p className="eyebrow">Formal reports</p><h1>Approval register</h1><p className="progress-report-note">Approval names below are the frozen values stored at the point each report was released.</p></div></header>{error && <p className="workflow-error" role="alert">{error}</p>}{loading ? <p role="status">Loading approval register…</p> : <section className="workflow-panel"><table className="workflow-table"><thead><tr><th>Campus</th><th>Period</th><th>Class Teacher</th><th>Head of School</th><th>Released</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.publication?.campus?.name || 'Fordridge Schools'}</td><td>{item.academic_year} · {item.academic_term}</td><td>{item.class_teacher_name || '[EDIT THIS]'}</td><td>{item.head_of_school_name || '[EDIT THIS]'}</td><td>{new Date(item.released_at).toLocaleString()}</td></tr>)}</tbody></table>{!items.length && <p className="portal-empty-copy">No official reports have been released yet.</p>}</section>}</section>
}
