import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ActivityLog() {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); const { data, error } = await supabase.from('audit_trail').select('id,entity_type,action,detail,created_at,actor:profiles!audit_trail_actor_id_fkey(full_name),campus:campuses(name)').order('created_at', { ascending: false }).limit(200); if (error) setError(workflowError(error)); else setItems(data || []); setLoading(false) }, [])
  useEffect(() => { load() }, [load])
  return <section><header className="workflow-heading"><div><p className="eyebrow">Administration</p><h1>Activity log</h1><p className="progress-report-note">A read-only record of key administrative and finance actions.</p></div><button onClick={load}>Refresh</button></header>{error && <p className="workflow-error" role="alert">{error}</p>}<section className="workflow-panel"><div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>When</th><th>Action</th><th>Area</th><th>By</th><th>Campus</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('en-ZW')}</td><td>{item.action}</td><td>{item.entity_type.replaceAll('_', ' ')}</td><td>{item.actor?.full_name || 'System'}</td><td>{item.campus?.name || 'All campuses'}</td></tr>)}</tbody></table>{loading ? <p role="status">Loading activity…</p> : !items.length && <p className="portal-empty-copy">No activity has been logged yet.</p>}</div></section></section>
}
