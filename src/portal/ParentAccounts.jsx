import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import AsyncState from './AsyncState'

export default function ParentAccounts() {
  const [parents, setParents] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestLock = useRef(false)

  const load = useCallback(async () => {
    if (requestLock.current) return
    requestLock.current = true
    setLoading(true)
    setError('')
    try {
      const linksResult = await supabase
        .from('student_guardians')
        .select('parent_id,student_id,learner:profiles!student_guardians_student_id_fkey(id,full_name,admission_number,class_level,class_stream,enrollment_status,campus:campuses(name))')
        .order('parent_id')
      if (linksResult.error) throw linksResult.error

      const parentIds = [...new Set((linksResult.data || []).map((link) => link.parent_id))]
      if (!parentIds.length) {
        setParents([])
        return
      }

      const parentsResult = await supabase
        .from('profiles')
        .select('id,full_name,phone_number')
        .eq('role', 'parent')
        .in('id', parentIds)
        .order('full_name')
      if (parentsResult.error) throw parentsResult.error

      const linksByParent = new Map()
      for (const link of linksResult.data || []) {
        if (!link.learner) continue
        const linked = linksByParent.get(link.parent_id) || []
        linked.push(link.learner)
        linksByParent.set(link.parent_id, linked)
      }
      setParents(
        (parentsResult.data || [])
          .filter((parent) => linksByParent.has(parent.id))
          .map((parent) => ({ ...parent, learners: linksByParent.get(parent.id) })),
      )
    } catch (err) {
      setError(workflowError(err))
    } finally {
      requestLock.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const term = query.trim().toLowerCase()
  const filtered = parents.filter((parent) =>
    `${parent.full_name || ''} ${parent.phone_number || ''} ${parent.learners
      .map((learner) => `${learner.full_name || ''} ${learner.admission_number || ''} ${learner.class_level || ''} ${learner.class_stream || ''} ${learner.campus?.name || ''}`)
      .join(' ')}`
      .toLowerCase()
      .includes(term),
  )
  const relationshipCount = parents.reduce((total, parent) => total + parent.learners.length, 0)

  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Parent accounts</h1>
          <p className="progress-report-note">
            Showing registered parent accounts with an existing learner link. Verify relationships through the school office before changing a link.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>
      <section className="workflow-panel">
        <div className="parent-directory-summary" aria-live="polite">
          <strong>{parents.length} linked parent accounts</strong>
          <span>{relationshipCount} recorded parent–learner links</span>
        </div>
        <label>
          Search parent or learner
          <input
            className="workflow-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Parent name, phone, learner, admission number or class"
          />
        </label>
        <AsyncState
          loading={loading}
          error={error}
          empty={!filtered.length}
          loadingMessage="Loading linked parent accounts…"
          emptyMessage={query ? 'No linked parent accounts match this search.' : 'No parent accounts have verified learner links yet.'}
          onRetry={load}
        />
        {!loading && !error && filtered.length > 0 && (
          <div className="workflow-scroll">
            <table className="workflow-table parent-accounts-table">
              <thead>
                <tr>
                  <th>Parent account</th>
                  <th>Linked learners</th>
                  <th>Relationship access</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((parent) => (
                  <tr key={parent.id}>
                    <td>
                      <strong>{parent.full_name || 'Unnamed parent'}</strong>
                      <small>{parent.phone_number || 'Phone not recorded'}</small>
                    </td>
                    <td>
                      <ul className="parent-linked-learners">
                        {parent.learners.map((learner) => (
                          <li key={learner.id}>
                            <strong>{learner.full_name || 'Unnamed learner'}</strong>
                            <small>
                              {[
                                learner.campus?.name,
                                learner.admission_number,
                                [learner.class_level, learner.class_stream].filter(Boolean).join(' · '),
                              ].filter(Boolean).join(' · ') || 'Learner details not recorded'}
                            </small>
                            {learner.enrollment_status && learner.enrollment_status !== 'active' && (
                              <small className="parent-learner-status">{learner.enrollment_status}</small>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td><span className="learner-status">Linked</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
