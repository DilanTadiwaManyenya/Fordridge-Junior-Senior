import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import { buildTeacherClassScopes } from './teacher-workspace'

export default function MyClass({ profile }) {
  const [scopes, setScopes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [assignments, learners] = await Promise.all([
        supabase
          .from('teacher_class_assignments')
          .select('id,campus_id,class_id,class_stream_id,class_level,class_stream,subject,assignment_kind,campus:campuses(name)')
          .eq('teacher_id', profile.id)
          .eq('campus_id', profile.campus_id)
          .eq('assignment_kind', 'class')
          .order('class_level'),
        supabase
          .from('profiles')
          .select('id,full_name,campus_id,class_level,class_stream,enrollment_status')
          .eq('role', 'student')
          .eq('campus_id', profile.campus_id)
          .neq('enrollment_status', 'inactive')
          .order('full_name'),
      ])
      if (assignments.error) throw assignments.error
      if (learners.error) throw learners.error
      setScopes(buildTeacherClassScopes(assignments.data || [], learners.data || []))
    } catch (loadError) {
      setError(workflowError(loadError))
      setScopes([])
    } finally {
      setLoading(false)
    }
  }, [profile.id])

  useEffect(() => { load() }, [load])

  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Teaching workspace</p>
          <h1>My class</h1>
          <p className="progress-report-note">
            Your class-register assignments and their currently visible learners. Subject-only allocations are listed separately.
          </p>
        </div>
        <div className="workflow-actions">
          <Link className="primary-action" to="/portal/attendance">Class attendance</Link>
          <Link to="/portal/subject-allocations">Subject allocations</Link>
        </div>
      </header>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading your class assignments…</p> : scopes.length ? (
        <div className="portal-learner-list">
          {scopes.map((scope) => (
            <article key={scope.key}>
              <div className="portal-learner-avatar" aria-hidden="true">▦</div>
              <div>
                <strong>{scope.campus_name} · {scope.class_level}</strong>
                <small>{scope.class_stream || 'All streams'} · {scope.learners.length} active learners</small>
                {scope.subjects.length > 0 && <small>Class-linked subjects: {scope.subjects.join(', ')}</small>}
                {scope.learners.length > 0 && (
                  <details>
                    <summary>View assigned learners</summary>
                    <ul>{scope.learners.map((learner) => <li key={learner.id}>{learner.full_name || 'Learner'}</li>)}</ul>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="workflow-panel">
          <h2>No class-register assignments yet</h2>
          <p className="portal-empty-copy">
            This view includes only confirmed class-register assignments. If you have a subject-only allocation, open Subject allocations to review it; ask the school office to confirm any class assignment.
          </p>
          <Link to="/portal/subject-allocations">Open Subject allocations</Link>
        </section>
      )}
    </section>
  )
}
