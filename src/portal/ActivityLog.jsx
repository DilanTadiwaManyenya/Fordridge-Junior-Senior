import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import AsyncState from './AsyncState'

export default function ActivityLog() {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const requestLock = useRef(false)
  const load = useCallback(async () => {
    if (requestLock.current) return
    requestLock.current = true
    setLoading(true)
    setError('')
    setItems([])
    try {
      const { data, error: requestError } = await supabase.rpc('read_activity_log')
      if (requestError) throw requestError
      setItems(data || [])
    } catch (err) {
      setError(workflowError(err))
    } finally {
      requestLock.current = false
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])
  return <section><header className="workflow-heading"><div><p className="eyebrow">Administration</p><h1>Activity log</h1><p className="progress-report-note">A read-only record of actions available to your active role.</p></div><button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></header><section className="workflow-panel"><AsyncState loading={loading} error={error} empty={!items.length} loadingMessage="Loading activity…" emptyMessage="No activity is available for your role yet." onRetry={load} />{!loading && !error && items.length > 0 && <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>When</th><th>Action</th><th>Area</th><th>By</th><th>Campus</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('en-ZW')}</td><td>{item.action}</td><td>{item.entity_type.replaceAll('_', ' ')}</td><td>{item.actor_name || 'System'}</td><td>{item.campus_name || 'All campuses'}</td></tr>)}</tbody></table></div>}</section></section>
}
