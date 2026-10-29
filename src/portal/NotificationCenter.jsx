import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function NotificationCenter({ user, profile }) {
  const [notices, setNotices] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState('')
  const parent = profile?.role === 'parent'
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [announcements, reads] = await Promise.all([
      supabase.from('announcements').select('id,title,body,published_at,expires_at').order('published_at', { ascending: false }).limit(40),
      supabase.from('announcement_reads').select('announcement_id').eq('user_id', user.id),
    ])
    const failed = [announcements, reads].find((item) => item.error)
    if (failed) setError(workflowError(failed.error))
    else {
      setNotices(announcements.data || [])
      setReadIds(new Set((reads.data || []).map((item) => item.announcement_id)))
    }
    setLoading(false)
  }, [user.id, profile?.role])
  useEffect(() => { load() }, [load])
  const unread = useMemo(() => notices.filter(item => !readIds.has(item.id)).length, [notices, readIds])
  async function markRead(ids) {
    if (!ids.length || marking) return
    setMarking(true)
    setError('')
    const { error: saveError } = await supabase.from('announcement_reads').upsert(
      ids.map((announcement_id) => ({ announcement_id, user_id: user.id })),
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
    )
    if (saveError) setError(workflowError(saveError))
    else setReadIds((current) => new Set([...current, ...ids]))
    setMarking(false)
  }
  return <section className="notification-center">
    <header className="workflow-heading">
      <div><p className="eyebrow">{parent ? 'Parent updates' : 'School communications'}</p>
        <h1>{parent ? 'Newsletters & notifications' : 'Notifications'}</h1>
        <p className="progress-report-note">{unread ? `${unread} unread school notice${unread === 1 ? '' : 's'}.` : 'You are up to date.'}</p>
      </div>
      {unread > 0 && <button disabled={marking} onClick={() => markRead(notices.filter(item => !readIds.has(item.id)).map(item => item.id))}>{marking ? 'Saving…' : 'Mark all read'}</button>}
    </header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading notifications…</p> : <section className="workflow-panel notification-list">
      {notices.map((notice) => <article className={readIds.has(notice.id) ? 'read' : 'unread'} key={notice.id}>
        <div><strong>{notice.title}</strong>
          <small>{notice.published_at ? new Date(notice.published_at).toLocaleDateString('en-ZW') : 'School notice'}</small>
          <p>{notice.body}</p>
          {notice.expires_at && <small>Available until {new Date(notice.expires_at).toLocaleDateString('en-ZW')}</small>}
        </div>
        {!readIds.has(notice.id) && <button disabled={marking} onClick={() => markRead([notice.id])}>Mark read</button>}
      </article>)}
      {!notices.length && <p className="portal-empty-copy">No notices are available yet.</p>}
    </section>}
  </section>
}
