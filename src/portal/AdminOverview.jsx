import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import './admin-overview.css'

const money = amount => new Intl.NumberFormat('en-ZW', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(amount || 0))
const campusLabel = campus => campus === 'junior' ? 'Junior School' : campus === 'senior' ? 'Senior School' : 'All Campuses'

export default function AdminOverview({ profile }) {
  const [campus, setCampus] = useState('all')
  const [state, setState] = useState({ loading: isSupabaseConfigured, error: '', profiles: [], guardians: [], fees: [], campuses: [] })

  const load = useCallback(async () => {
    if (!supabase) return
    setState(current => ({ ...current, loading: true, error: '' }))
    const [profiles, guardians, fees, campuses] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,campus_id,admission_number,class_level,class_stream,enrollment_status,created_at').order('created_at', { ascending: false }),
      supabase.from('student_guardians').select('student_id,parent_id'),
      supabase.from('fee_records').select('id,campus_id,paid_amount,created_at'),
      supabase.from('campuses').select('id,code,name').order('name'),
    ])
    const error = [profiles, guardians, fees, campuses].find(result => result.error)?.error?.message || ''
    setState({ loading: false, error, profiles: profiles.data || [], guardians: guardians.data || [], fees: fees.data || [], campuses: campuses.data || [] })
  }, [])

  useEffect(() => { load() }, [load])

  const data = useMemo(() => {
    const campusIds = new Set(state.campuses.filter(item => campus === 'all' || item.code === campus).map(item => item.id))
    const inScope = item => campus === 'all' || campusIds.has(item.campus_id)
    const profiles = state.profiles.filter(inScope)
    const students = profiles.filter(item => item.role === 'student')
    const staff = profiles.filter(item => ['staff', 'teacher'].includes(item.role))
    const learnerIds = new Set(students.map(item => item.id))
    const parentIds = new Set(state.guardians.filter(item => learnerIds.has(item.student_id)).map(item => item.parent_id))
    const collected = state.fees.filter(item => campus === 'all' || campusIds.has(item.campus_id)).reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
    return { students, staff, parentIds, collected }
  }, [campus, state])

  if (!isSupabaseConfigured) return <section className="admin-overview"><p className="admin-note">Connect Supabase to load the administrator overview.</p></section>

  return <section className="admin-overview">
    <header className="admin-overview-header">
      <div><p className="admin-kicker">Administration · {campusLabel(campus)}</p><h1>Good day, {profile.full_name?.split(' ')[0] || 'Administrator'}.</h1><p>Monitor Fordridge operations across both campuses.</p></div>
      <div className="campus-filter" aria-label="Campus filter">
        {[['all', 'All Campuses'], ['junior', 'Junior'], ['senior', 'Senior']].map(([value, label]) => <button key={value} type="button" className={campus === value ? 'active' : ''} onClick={() => setCampus(value)}>{label}</button>)}
      </div>
    </header>
    {state.error && <p className="admin-error">Unable to load dashboard data: {state.error}</p>}
    <section className="admin-stat-grid" aria-label="School statistics">
      <Stat label="Total Learners" value={data.students.length} detail={campusLabel(campus)} />
      <Stat id="staff" label="Teaching Staff" value={data.staff.length} detail="Staff and teachers" />
      <Stat label="Parents Linked" value={data.parentIds.size} detail="Unique linked guardians" />
      <Stat label="Fees Collected" value={money(data.collected)} detail="Recorded payments" accent="maroon" />
    </section>
    <section className="admin-dashboard-grid">
      <article className="admin-card admin-attendance" id="records"><div><p className="admin-kicker">Records</p><h2>Attendance trend</h2></div><MissingAttendance /></article>
      <article className="admin-card"><p className="admin-kicker">Today</p><h2>Attendance breakdown</h2><MissingAttendance compact /></article>
      <article className="admin-card admin-recent" id="learners"><div className="admin-card-heading"><div><p className="admin-kicker">Learners</p><h2>Recent learners</h2></div><button type="button" onClick={load}>Refresh</button></div>{state.loading ? <p className="admin-muted">Loading learner records…</p> : <RecentLearners learners={data.students} />}</article>
    </section>
  </section>
}

function Stat({ id, label, value, detail, accent = 'navy' }) { return <article id={id} className={`admin-stat ${accent}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article> }

function MissingAttendance({ compact = false }) { return <div className={compact ? 'attendance-empty compact' : 'attendance-empty'}><strong>Attendance data unavailable</strong><p>Fordridge does not yet have an attendance table, so no attendance figures or trend are shown.</p></div> }

function RecentLearners({ learners }) {
  const complete = learners.filter(item => item.admission_number || item.class_level || item.class_stream || item.enrollment_status).slice(0, 8)
  if (!complete.length) return <p className="admin-muted">No learner records with admission, class, stream, or status have been entered yet.</p>
  return <div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Admission no.</th><th>Class</th><th>Stream</th><th>Status</th></tr></thead><tbody>{complete.map(item => <tr key={item.id}><td>{item.full_name || 'Unnamed learner'}</td><td>{item.admission_number || 'Not recorded'}</td><td>{item.class_level || 'Not recorded'}</td><td>{item.class_stream || 'Not recorded'}</td><td><span className="learner-status">{item.enrollment_status || 'Not recorded'}</span></td></tr>)}</tbody></table></div>
}
