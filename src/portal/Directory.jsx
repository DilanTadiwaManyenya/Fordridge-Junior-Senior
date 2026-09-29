import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import PhoneNumberField, { toE164 } from './PhoneNumberField'
import PasswordInput from './PasswordInput'
import GuardianLinks from './GuardianLinks'

const empty = (role) => ({
  full_name: '',
  role,
  campus_id: '',
  admission_number: '',
  class_level: '',
  class_stream: '',
  enrollment_status: 'active',
})
export default function Directory({ view }) {
  const learner = view === 'learners'
  const [items, setItems] = useState([]),
    [campuses, setCampuses] = useState([])
  const [query, setQuery] = useState(''),
    [draft, setDraft] = useState(null)
  const [phone, setPhone] = useState(''),
    [country, setCountry] = useState('ZW'),
    [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const lock = useRef(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profiles, locations] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id,full_name,phone_number,role,campus_id,admission_number,class_level,class_stream,enrollment_status,campus:campuses(name)',
          )
          .in('role', learner ? ['student'] : ['staff', 'teacher', 'admin'])
          .order('full_name'),
        supabase.from('campuses').select('id,name').order('name'),
      ])
      if (profiles.error || locations.error)
        throw profiles.error || locations.error
      setItems(profiles.data)
      setCampuses(locations.data)
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setLoading(false)
    }
  }, [learner])
  useEffect(() => {
    load()
  }, [load])
  function open(item) {
    setDraft(
      item
        ? { ...empty(item.role), ...item }
        : empty(learner ? 'student' : 'teacher'),
    )
    setPhone('')
    setPassword('')
    setError('')
    setNotice('')
  }
  async function save(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (!draft.full_name.trim()) throw new Error('Enter a name.')
      if (draft.id) {
        const { error: err } = await supabase.rpc('admin_update_profile', {
          p_id: draft.id,
          p_name: draft.full_name,
          p_campus: draft.campus_id || null,
          p_admission: draft.admission_number,
          p_class: draft.class_level,
          p_stream: draft.class_stream,
          p_status: draft.enrollment_status,
        })
        if (err) throw err
      } else {
        const number = toE164(phone, country)
        if (!number) throw new Error('Enter a valid phone number.')
        const { data, error: err } = await supabase.functions.invoke(
          'create-portal-account',
          { body: { ...draft, phone: number, password } },
        )
        if (err) {
          const response = await err.context?.json?.().catch(() => null)
          throw new Error(
            response?.error ||
              'Account creation could not be completed. Ask the administrator to check the account provisioning service before retrying.',
          )
        }
        if (data?.error) throw new Error(data.error)
      }
      setDraft(null)
      setPassword('')
      setNotice('Profile saved.')
      await load()
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setSaving(false)
      lock.current = false
    }
  }
  const filtered = items.filter((item) =>
    `${item.full_name} ${item.admission_number || ''} ${item.class_level || ''} ${item.campus?.name || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Fordridge administration</p>
          <h1>{learner ? 'Learners' : 'Staff'}</h1>
        </div>
        <button className="primary-action" onClick={() => open(null)}>
          + Add {learner ? 'learner' : 'staff member'}
        </button>
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
        <section className="workflow-panel">
          <h2>{draft.id ? 'Edit profile' : 'Create portal account'}</h2>
          <form className="workflow-form" onSubmit={save}>
            <fieldset disabled={saving}>
              <label>
                Full name
                <input
                  required
                  value={draft.full_name}
                  onChange={(e) =>
                    setDraft({ ...draft, full_name: e.target.value })
                  }
                />
              </label>
              <label>
                Campus
                <select
                  required
                  value={draft.campus_id || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, campus_id: e.target.value })
                  }
                >
                  <option value="">Select campus</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {!draft.id && (
                <>
                  <PhoneNumberField
                    value={phone}
                    onChange={setPhone}
                    country={country}
                    onCountryChange={setCountry}
                  />
                  <label>
                    Initial password
                    <PasswordInput
                      id="initial-password"
                      ariaLabel="Initial password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={12}
                    />
                  </label>
                  {!learner && (
                    <label>
                      Role
                      <select
                        value={draft.role}
                        onChange={(e) =>
                          setDraft({ ...draft, role: e.target.value })
                        }
                      >
                        <option value="teacher">Teacher</option>
                        <option value="staff">Staff</option>
                      </select>
                    </label>
                  )}
                  <p className="workflow-wide">
                    Use the account holder’s verified phone number. Share their
                    initial password privately; they can change it in Account
                    settings.
                  </p>
                </>
              )}
              {draft.id && (
                <p className="workflow-wide">
                  Phone: {draft.phone_number || 'Not recorded'} · Role:{' '}
                  {draft.role}
                </p>
              )}
              {learner && (
                <>
                  {[
                    ['admission_number', 'Admission number'],
                    ['class_level', 'Class / form'],
                    ['class_stream', 'Stream'],
                  ].map(([id, label]) => (
                    <label key={id}>
                      {label}
                      <input
                        value={draft[id] || ''}
                        onChange={(e) =>
                          setDraft({ ...draft, [id]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Enrolment status
                    <select
                      value={draft.enrollment_status || ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          enrollment_status: e.target.value,
                        })
                      }
                    >
                      <option value="">Not assigned</option>
                      {['active', 'inactive', 'graduated', 'transferred'].map(
                        (status) => (
                          <option key={status}>{status}</option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              )}
              <div className="workflow-actions workflow-wide">
                <button className="primary-action">
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
                <button type="button" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {learner && draft?.id && (
        <GuardianLinks key={draft.id} studentId={draft.id} />
      )}
      <section className="workflow-panel">
        <label>
          Search directory
          <input
            className="workflow-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, admission number, class or campus"
          />
        </label>
        {loading ? (
          <p role="status">Loading directory…</p>
        ) : (
          <div className="workflow-scroll">
            <table className="workflow-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>{learner ? 'Admission / class' : 'Role'}</th>
                  <th>Campus</th>
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.full_name}
                      <small>{item.phone_number}</small>
                    </td>
                    <td>
                      {learner
                        ? `${item.admission_number || 'Unassigned'} · ${item.class_level || ''} ${item.class_stream || ''}`
                        : item.role}
                    </td>
                    <td>{item.campus?.name || 'Unassigned'}</td>
                    <td>
                      <button
                        onClick={() => open(item)}
                        aria-label={`View or edit ${item.full_name}`}
                      >
                        View / edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <p>No matching records.</p>}
          </div>
        )}
      </section>
    </section>
  )
}
