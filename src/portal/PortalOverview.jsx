import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

const weekday = new Intl.DateTimeFormat('en-ZW', { weekday: 'long' })

export default function PortalOverview({ profile, user }) {
  const [state, setState] = useState({ loading: true, error: '', learners: [], fees: [], records: [], announcements: [], timetable: [] })
  const load = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: '' }))
    try {
      let learners = []
      if (profile.role === 'parent') {
        const links = await supabase
          .from('student_guardians')
          .select('student_id,student:profiles!student_guardians_student_id_fkey(id,full_name,class_level,class_stream)')
          .eq('parent_id', user.id)
        if (links.error) throw links.error
        learners = links.data.map(link => link.student).filter(Boolean)
      } else if (profile.role === 'student') {
        learners = [{ id: user.id, full_name: profile.full_name, class_level: profile.class_level, class_stream: profile.class_stream }]
      }
      const learnerIds = learners.map(learner => learner.id)
      const [fees, records, announcements, timetable] = await Promise.all([
        learnerIds.length ? supabase.from('fee_records').select('student_id,amount,paid_amount,status,due_date').in('student_id', learnerIds) : Promise.resolve({ data: [], error: null }),
        learnerIds.length ? supabase.from('learner_records').select('student_id,kind,event_date,title,attendance_status,score,max_score').in('student_id', learnerIds).order('event_date', { ascending: false }).limit(8) : Promise.resolve({ data: [], error: null }),
        supabase.from('announcements').select('id,title,body,published_at').order('published_at', { ascending: false }).limit(3),
        supabase.from('timetable').select('id,subject,day_of_week,starts_at,ends_at,room').order('day_of_week').order('starts_at').limit(8),
      ])
      const failure = [fees, records, announcements, timetable].find(result => result.error)
      if (failure?.error) throw failure.error
      setState({ loading: false, error: '', learners, fees: fees.data || [], records: records.data || [], announcements: announcements.data || [], timetable: timetable.data || [] })
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: workflowError(error) }))
    }
  }, [profile, user.id])
  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const outstanding = state.fees.reduce((total, fee) => total + Math.max(0, Number(fee.amount || 0) - Number(fee.paid_amount || 0)), 0)
    const present = state.records.filter(record => record.kind === 'attendance' && ['present', 'late'].includes(record.attendance_status)).length
    const attendance = state.records.filter(record => record.kind === 'attendance')
    return { outstanding, attendance: attendance.length ? Math.round((present / attendance.length) * 100) : null }
  }, [state.fees, state.records])
  const isFamily = ['parent', 'student'].includes(profile.role)
  const firstName = profile.full_name?.split(' ')[0] || 'welcome'
  return <section className="portal-overview">
    <section className="portal-welcome"><div><p className="eyebrow">Your school day</p><h1>Good day, {firstName}.</h1><p>{isFamily ? 'Keep up with your learner’s updates, timetable, records and fee information in one place.' : 'Use your Fordridge workspace to manage school updates and learner records.'}</p><div className="portal-welcome-actions"><Link to="/portal/announcements">Latest notices</Link><Link to={isFamily ? '/portal/records' : '/portal/timetable'}>{isFamily ? 'View learner records' : 'View timetable'}</Link></div></div><div className="portal-welcome-mark"><span>FORDRIDGE</span><strong>Learn<br />Excel<br />Achieve</strong></div></section>
    {state.error && <p className="workflow-error" role="alert">{state.error}</p>}
    {state.loading ? <p className="portal-overview-loading" role="status">Loading your school information…</p> : <>
      {isFamily && <section className="portal-summary-grid" aria-label="Learner overview"><article><span>Linked learners</span><strong>{state.learners.length}</strong><small>{profile.role === 'parent' ? 'Learners connected to this account' : 'Your learner account'}</small></article><article><span>Attendance</span><strong>{summary.attendance === null ? '—' : `${summary.attendance}%`}</strong><small>{summary.attendance === null ? 'No attendance entries yet' : 'Present or late in recent records'}</small></article><article><span>Outstanding balance</span><strong>US${summary.outstanding.toFixed(2)}</strong><small>{state.fees.length ? 'Across visible fee records' : 'No fee records available'}</small></article></section>}
      {isFamily && <section className="portal-learner-list"><div className="portal-section-heading"><div><p className="eyebrow">Family overview</p><h2>{profile.role === 'parent' ? 'Your learners' : 'Your profile'}</h2></div><Link to="/portal/records">Open records →</Link></div>{state.learners.length ? state.learners.map(learner => <article key={learner.id}><span className="portal-learner-avatar">{learner.full_name?.slice(0, 1) || 'L'}</span><div><strong>{learner.full_name}</strong><small>{[learner.class_level, learner.class_stream].filter(Boolean).join(' · ') || 'Class details not recorded'}</small></div><Link to="/portal/records">View progress →</Link></article>) : <p className="portal-empty-copy">No learner is linked to this parent account yet. Please contact the school office once the relationship has been verified.</p>}</section>}
      <section className="portal-feed-grid"><article><div className="portal-section-heading"><div><p className="eyebrow">School updates</p><h2>Latest announcements</h2></div><Link to="/portal/announcements">All notices →</Link></div>{state.announcements.length ? state.announcements.map(item => <div className="portal-feed-item" key={item.id}><strong>{item.title}</strong><p>{item.body}</p></div>) : <p className="portal-empty-copy">No announcements are available yet.</p>}</article><article><div className="portal-section-heading"><div><p className="eyebrow">{weekday.format(new Date())}</p><h2>Timetable</h2></div><Link to="/portal/timetable">Full timetable →</Link></div>{state.timetable.length ? state.timetable.slice(0, 4).map(item => <div className="portal-schedule-item" key={item.id}><time>{item.starts_at?.slice(0, 5)}</time><div><strong>{item.subject}</strong><small>{item.room || 'Room to be confirmed'}</small></div></div>) : <p className="portal-empty-copy">No timetable entries are available yet.</p>}</article></section>
    </>}
  </section>
}
