import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import AsyncState from './AsyncState'

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function newsletterStatus(item, now = Date.now()) {
  if (!item.published_at) return 'Draft'
  if (Date.parse(item.published_at) > now) return 'Scheduled'
  if (item.expires_at && Date.parse(item.expires_at) <= now) return 'Expired'
  return 'Published'
}

export default function SchoolContent({ view, profile, user }) {
  const timetable = view === 'timetable'
  const table = timetable ? 'timetable' : 'announcements'
  const canManage = ['admin', 'teacher'].includes(profile.role)
  const canEdit = (item) =>
    profile.role === 'admin' ||
    (profile.role === 'teacher' &&
      (timetable
        ? !!item.class_level && item.teacher_id === user.id
        : item.author_id === user.id))
  const [items, setItems] = useState([]),
    [campuses, setCampuses] = useState([]),
    [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState('')
  const requestLock = useRef(false)
  const load = useCallback(async () => {
    if (requestLock.current) return
    requestLock.current = true
    setLoading(true)
    setLoadError('')
    setItems([])
    setCampuses([])
    try {
      const request = supabase.from(table).select('*,campus:campuses(name)')
      const result = timetable
        ? await request.order('day_of_week').order('starts_at')
        : await request.order('created_at', { ascending: false })
      if (result.error) throw result.error
      setItems(result.data)
      if (canManage) {
        const c = await supabase.from('campuses').select('id,name')
        if (c.error) throw c.error
        setCampuses(
          c.data.filter(
            (item) => profile.role === 'admin' || item.id === profile.campus_id,
          ),
        )
      }
    } catch (err) {
      setLoadError(workflowError(err))
    } finally {
      requestLock.current = false
      setLoading(false)
    }
  }, [table, timetable, canManage, profile.role, profile.campus_id])
  useEffect(() => {
    load()
  }, [load])
  function open(item) {
    setError('')
    setNotice('')
    setDraft(
      item
        ? { ...item, publish: !!item.published_at }
        : {
            campus_id: profile.campus_id || '',
            title: '',
            body: '',
            publish: false,
            publishMode: 'draft',
            publishAt: '',
            expiresAt: '',
            subject: '',
            day_of_week: 1,
            starts_at: '08:00',
            ends_at: '09:00',
            class_level: '',
            class_stream: '',
            room: '',
            audience_role: 'student',
            audience_roles: [],
          },
    )
    if (!timetable && item) {
      const publishTime = Date.parse(item.published_at)
      setDraft({
        ...item,
        publishMode: Number.isFinite(publishTime)
          ? (publishTime > Date.now() ? 'scheduled' : 'published')
          : 'draft',
        publishAt: Number.isFinite(publishTime) ? toDateTimeInput(item.published_at) : '',
        expiresAt: toDateTimeInput(item.expires_at),
      })
    }
  }
  async function save(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (timetable && draft.ends_at <= draft.starts_at)
        throw new Error('End time must be after start time.')
      if (!timetable && draft.publishMode === 'scheduled' && (!draft.publishAt || Date.parse(draft.publishAt) <= Date.now()))
        throw new Error('Choose a future publication date and time.')
      const publicationTime = timetable ? null : draft.publishMode === 'draft'
        ? null
        : draft.publishMode === 'scheduled'
          ? Date.parse(draft.publishAt)
          : Date.parse(draft.published_at) || Date.now()
      if (!timetable && draft.expiresAt && Date.parse(draft.expiresAt) <= (publicationTime || Date.now()))
        throw new Error('The expiry date and time must be after publication.')
      const payload = timetable
        ? {
            campus_id: draft.campus_id,
            subject: draft.subject.trim(),
            day_of_week: Number(draft.day_of_week),
            starts_at: draft.starts_at,
            ends_at: draft.ends_at,
            class_level: draft.class_level?.trim() || null,
            class_stream: draft.class_stream?.trim() || null,
            room: draft.room?.trim() || null,
            audience_role: draft.audience_role || null,
            teacher_id:
              profile.role === 'teacher' ? user.id : draft.teacher_id || null,
          }
        : {
          campus_id: draft.campus_id,
          title: draft.title.trim(),
          body: draft.body.trim(),
          author_id: draft.author_id || user.id,
          audience_roles: draft.audience_roles || [],
          published_at: draft.publishMode === 'draft'
            ? null
            : draft.publishMode === 'scheduled'
              ? new Date(draft.publishAt).toISOString()
              : draft.published_at || new Date().toISOString(),
          expires_at: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
          }
      if (!(timetable ? payload.subject : payload.title && payload.body))
        throw new Error('Complete all required text fields.')
      const r = draft.id
        ? await supabase
            .from(table)
            .update(payload)
            .eq('id', draft.id)
            .select('id')
            .single()
        : await supabase.from(table).insert(payload).select('id').single()
      if (r.error) throw r.error
      setDraft(null)
      setNotice('Saved successfully.')
      await load()
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Fordridge Schools</p>
          <h1>{timetable ? 'Timetable' : 'Newsletters'}</h1>
        </div>
        {canManage && (
          <button className="primary-action" onClick={() => open(null)}>
            + {timetable ? 'Add lesson' : 'Write newsletter'}
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="workflow-notice">
          {notice}
        </p>
      )}
      {draft && (
        <form className="workflow-panel workflow-form" onSubmit={save}>
          <fieldset disabled={saving}>
            <label>
              Campus
              <select
                required
                value={draft.campus_id}
                onChange={(e) =>
                  setDraft({ ...draft, campus_id: e.target.value })
                }
              >
                <option value="">Select campus</option>
                {campuses.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {timetable ? (
              <>
                <label>
                  Subject
                  <input
                    required
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft({ ...draft, subject: e.target.value })
                    }
                  />
                </label>
                <label>
                  Day
                  <select
                    value={draft.day_of_week}
                    onChange={(e) =>
                      setDraft({ ...draft, day_of_week: e.target.value })
                    }
                  >
                    {days.map((day, i) => (
                      <option key={day} value={i + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  ['starts_at', 'Start time', 'time'],
                  ['ends_at', 'End time', 'time'],
                  ['class_level', 'Class / form (blank for all)', 'text'],
                  ['class_stream', 'Stream (blank for all)', 'text'],
                  ['room', 'Room', 'text'],
                ].map(([id, label, type]) => (
                  <label key={id}>
                    {label}
                    <input
                      type={type}
                      required={type === 'time'}
                      value={draft[id] || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, [id]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  Audience
                  <select
                    value={draft.audience_role || ''}
                    onChange={(e) =>
                      setDraft({ ...draft, audience_role: e.target.value })
                    }
                  >
                    <option value="">All roles</option>
                    {['student', 'parent', 'teacher', 'staff'].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Title
                  <input
                    required
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label className="workflow-wide">
                  Announcement
                  <textarea
                    required
                    value={draft.body}
                    onChange={(e) =>
                      setDraft({ ...draft, body: e.target.value })
                    }
                  />
                </label>
                <label>
                  Publication
                  <select value={draft.publishMode} onChange={(e) => setDraft({
                    ...draft,
                    publishMode: e.target.value,
                    published_at: e.target.value === 'published' && draft.publishMode === 'scheduled' ? null : draft.published_at,
                  })}>
                    <option value="draft">Save as draft — staff only</option>
                    <option value="scheduled">Schedule publication</option>
                    <option value="published">Publish now</option>
                  </select>
                </label>
                {draft.publishMode === 'scheduled' && <label>Publish at<input type="datetime-local" required value={draft.publishAt} onChange={(e) => setDraft({ ...draft, publishAt: e.target.value })} /></label>}
                <label>Expires at (optional)<input type="datetime-local" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} /></label>
                <label>
                  Audience
                  <select
                    value={(draft.audience_roles || []).join(',')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        audience_roles: e.target.value
                          ? e.target.value.split(',')
                          : [],
                      })
                    }
                  >
                    <option value="">Everyone at this campus</option>
                    <option value="student">Students and linked parents</option>
                    <option value="parent">Parents only</option>
                    <option value="teacher,staff">Teachers and staff</option>
                    <option value="principal,accountant,admin">School leadership and administrators</option>
                  </select>
                </label>
                <p className="workflow-wide">Scheduled newsletters remain hidden until publication. Expired newsletters stop appearing to their audience. File attachments are not enabled in this workflow.</p>
              </>
            )}
            <div className="workflow-actions workflow-wide">
              <button className="primary-action">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <AsyncState
        loading={loading}
        error={loadError}
        empty={!items.length}
        loadingMessage={`Loading ${timetable ? 'timetable' : 'announcements'}…`}
        emptyMessage={timetable ? 'No lessons are available for your account yet.' : 'No announcements are available for your account yet.'}
        onRetry={load}
      />
      {!loading && !loadError && items.length ? (
        items.map((item) => (
          <article className="workflow-panel" key={item.id}>
            <div className="workflow-heading">
              <h2>
                {timetable
                  ? `${days[item.day_of_week - 1]} · ${item.subject}`
                  : item.title}
              </h2>
              {canEdit(item) && <button onClick={() => open(item)}>Edit</button>}
            </div>
            <p>
              {item.campus?.name}
              {!timetable && canManage ? ` · ${newsletterStatus(item)}` : ''}
            </p>
            {timetable ? (
              <p>
                {item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)} ·{' '}
                {item.class_level || 'All classes'} {item.class_stream || ''}
                {item.room ? ` · ${item.room}` : ''}
              </p>
            ) : (
              <>
                <p>{item.body}</p>
                {item.expires_at && <small>Expires {new Date(item.expires_at).toLocaleString()}</small>}
                {canManage && <small>Audience: {item.audience_roles?.length ? item.audience_roles.join(', ') : 'Everyone at this campus'}</small>}
              </>
            )}
          </article>
        ))
      ) : null}
    </section>
  )
}
