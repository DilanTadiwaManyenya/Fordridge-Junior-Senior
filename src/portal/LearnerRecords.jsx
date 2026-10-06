import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const blank = () => ({
  student_id: '',
  kind: 'attendance',
  event_date: new Date().toLocaleDateString('en-CA'),
  title: 'Daily attendance',
  notes: '',
  attendance_status: 'present',
  score: '',
  max_score: '',
})
export default function LearnerRecords({ profile, user }) {
  const admin = profile.role === 'admin'
  const teacher = profile.role === 'teacher'
  const canManage = admin || teacher
  const [items, setItems] = useState([]),
    [students, setStudents] = useState([]),
    [draft, setDraft] = useState(null),
    [kind, setKind] = useState('all')
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await supabase
        .from('learner_records')
        .select(
          '*,student:profiles!learner_records_student_id_fkey(full_name,admission_number)',
        )
        .order('event_date', { ascending: false })
        .limit(500)
      if (r.error) throw r.error
      setItems(r.data)
      if (canManage) {
        let request = supabase
          .from('profiles')
          .select('id,full_name,admission_number')
          .eq('role', 'student')
          .order('full_name')
        if (teacher) request = request.eq('campus_id', profile.campus_id)
        const s = await request
        if (s.error) throw s.error
        setStudents(s.data)
      }
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setLoading(false)
    }
  }, [canManage, profile.campus_id, teacher])
  useEffect(() => {
    load()
  }, [load])
  async function save(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        student_id: draft.student_id,
        kind: draft.kind,
        event_date: draft.event_date,
        title: draft.title.trim(),
        notes: draft.notes.trim(),
        attendance_status:
          draft.kind === 'attendance' ? draft.attendance_status : null,
        score:
          draft.kind === 'academic' && draft.score !== ''
            ? Number(draft.score)
            : null,
        max_score:
          draft.kind === 'academic' && draft.max_score !== ''
            ? Number(draft.max_score)
            : null,
        created_by: draft.created_by || user.id,
      }
      if (!payload.title) throw new Error('Enter a title or subject.')
      const r = draft.id
        ? await supabase
            .from('learner_records')
            .update(payload)
            .eq('id', draft.id)
            .select('id')
            .single()
        : await supabase
            .from('learner_records')
            .insert(payload)
            .select('id')
            .single()
      if (r.error) throw r.error
      setDraft(null)
      setNotice('Learner record saved.')
      await load()
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setSaving(false)
    }
  }
  const shown = items.filter((item) => kind === 'all' || item.kind === kind)
  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Fordridge Schools</p>
          <h1>Learner records</h1>
        </div>
        {canManage && (
          <button className="primary-action" onClick={() => setDraft(blank())}>
            + Add record
          </button>
        )}
      </header>
      {error && (
        <p className="workflow-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="workflow-notice" role="status">
          {notice}
        </p>
      )}
      {draft && (
        <form className="workflow-panel workflow-form" onSubmit={save}>
          <fieldset disabled={saving}>
            <label>
              Learner
              <select
                required
                value={draft.student_id}
                onChange={(e) =>
                  setDraft({ ...draft, student_id: e.target.value })
                }
              >
                <option value="">Select learner</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} · {s.admission_number || 'Unassigned'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Record area
              <select
                value={draft.kind}
                disabled={!!draft.id}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value,
                    title:
                      e.target.value === 'attendance' ? 'Daily attendance' : '',
                  })
                }
              >
                {(admin
                  ? ['attendance', 'academic', 'wellbeing']
                  : ['attendance', 'academic']
                ).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                required
                type="date"
                value={draft.event_date}
                onChange={(e) =>
                  setDraft({ ...draft, event_date: e.target.value })
                }
              />
            </label>
            <label>
              Title / subject
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            {draft.kind === 'attendance' && (
              <label>
                Status
                <select
                  value={draft.attendance_status}
                  onChange={(e) =>
                    setDraft({ ...draft, attendance_status: e.target.value })
                  }
                >
                  {['present', 'absent', 'late', 'excused'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            )}
            {draft.kind === 'academic' && (
              <>
                {[
                  ['score', 'Mark'],
                  ['max_score', 'Out of'],
                ].map(([id, label]) => (
                  <label key={id}>
                    {label}
                    <input
                      type="number"
                      min={id === 'max_score' ? '0.01' : '0'}
                      step="0.01"
                      required
                      value={draft[id] ?? ''}
                      onChange={(e) =>
                        setDraft({ ...draft, [id]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </>
            )}
            <label className="workflow-wide">
              Notes
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            {draft.kind === 'wellbeing' && (
              <p className="workflow-wide">
                Wellbeing notes are visible to administrators only.
              </p>
            )}
            <div className="workflow-actions workflow-wide">
              <button className="primary-action">
                {saving ? 'Saving…' : 'Save record'}
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <section className="workflow-panel">
        <label>
          Record area{' '}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All areas</option>
            {(admin
              ? ['attendance', 'academic', 'wellbeing']
              : ['attendance', 'academic']
            ).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <p>Latest 500 records accessible to your account.</p>
        {loading ? (
          <p role="status">Loading records…</p>
        ) : (
          <div className="workflow-scroll">
            <table className="workflow-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Learner</th>
                  <th>Record</th>
                  <th>Details</th>
                  {canManage && <th>Edit</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <td>{item.event_date}</td>
                    <td>{item.student?.full_name || 'Learner'}</td>
                    <td>
                      {item.title}
                      <small>{item.kind}</small>
                    </td>
                    <td>
                      {item.attendance_status ||
                        (item.score !== null
                          ? `${item.score} / ${item.max_score}`
                          : '')}
                      <p>{item.notes}</p>
                    </td>
                    {canManage && (
                      <td>
                        {item.created_by === user.id ? (
                          <button onClick={() => setDraft(item)}>Edit</button>
                        ) : (
                          <span>Recorded by another staff member</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <p>No matching records.</p>}
          </div>
        )}
      </section>
    </section>
  )
}
