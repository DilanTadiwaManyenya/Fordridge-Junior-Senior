import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function GuardianLinks({ studentId }) {
  const [parents, setParents] = useState([]),
    [links, setLinks] = useState([]),
    [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name,phone_number')
          .eq('role', 'parent')
          .order('full_name'),
        supabase
          .from('student_guardians')
          .select('parent_id')
          .eq('student_id', studentId),
      ])
      if (p.error || g.error) throw p.error || g.error
      setParents(p.data)
      setLinks(g.data.map((row) => row.parent_id))
    } catch (err) {
      setError(workflowError(err))
    }
  }, [studentId])
  useEffect(() => {
    load()
  }, [load])
  async function link(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const r = await supabase
        .from('student_guardians')
        .insert({ student_id: studentId, parent_id: selected })
      if (r.error) throw r.error
      setSelected('')
      await load()
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="workflow-panel">
      <h2>Linked guardians</h2>
      <p>
        Linked parents can view this learner’s fees, attendance and academic
        records. Verify the relationship before granting access.
      </p>
      {error && (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      )}
      {parents
        .filter((p) => links.includes(p.id))
        .map((p) => (
          <p key={p.id}>
            {p.full_name} · {p.phone_number}
          </p>
        ))}
      {!links.length && <p>No guardians linked.</p>}
      <form onSubmit={link} className="workflow-form">
        <label>
          Parent account
          <select
            required
            disabled={busy}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a registered parent</option>
            {parents
              .filter((p) => !links.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} · {p.phone_number}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy || !selected}>Link verified guardian</button>
      </form>
    </section>
  )
}
