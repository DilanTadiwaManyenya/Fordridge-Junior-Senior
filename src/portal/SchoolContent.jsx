import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
export default function SchoolContent({ view, profile, user }) {
  const timetable = view === 'timetable'
  const table = timetable ? 'timetable' : 'announcements'
  const canManage = ['admin', 'teacher'].includes(profile.role)
  const [items, setItems] = useState([]),
    [campuses, setCampuses] = useState([]),
    [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
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
      setError(workflowError(err))
    } finally {
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
            subject: '',
            day_of_week: 1,
            starts_at: '08:00',
            ends_at: '09:00',
            class_level: '',
            class_stream: '',
            room: '',
            audience_role: 'student',
          },
    )
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
            published_at: draft.publish
              ? draft.published_at || new Date().toISOString()
              : null,
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
          <h1>{timetable ? 'Timetable' : 'Announcements'}</h1>
        </div>
        {canManage && (
          <button className="primary-action" onClick={() => open(null)}>
            + {timetable ? 'Add lesson' : 'Write announcement'}
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
                  <select
                    value={draft.publish ? 'published' : 'draft'}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        publish: e.target.value === 'published',
                      })
                    }
                  >
                    <option value="draft">Draft — staff only</option>
                    <option value="published">Publish to campus</option>
                  </select>
                </label>
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
      {loading ? (
        <p role="status">Loading…</p>
      ) : items.length ? (
        items.map((item) => (
          <article className="workflow-panel" key={item.id}>
            <div className="workflow-heading">
              <h2>
                {timetable
                  ? `${days[item.day_of_week - 1]} · ${item.subject}`
                  : item.title}
              </h2>
              {canManage && <button onClick={() => open(item)}>Edit</button>}
            </div>
            <p>
              {item.campus?.name}
              {!timetable && canManage && !item.published_at ? ' · Draft' : ''}
            </p>
            {timetable ? (
              <p>
                {item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)} ·{' '}
                {item.class_level || 'All classes'} {item.class_stream || ''}
                {item.room ? ` · ${item.room}` : ''}
              </p>
            ) : (
              <p>{item.body}</p>
            )}
          </article>
        ))
      ) : (
        <section className="workflow-panel">
          <p>
            {timetable
              ? 'No lessons are available for your account yet.'
              : 'No announcements are available for your account yet.'}
          </p>
        </section>
      )}
    </section>
  )
}
