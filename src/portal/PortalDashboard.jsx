import { useCallback, useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import crest from '../assets/fordridge-crest.jpeg'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import FeesDashboard from './FeesDashboard'
import AdminOverview from './AdminOverview'
import Directory from './Directory'
import SchoolContent from './SchoolContent'
import LearnerRecords from './LearnerRecords'
import AccountSettings from './AccountSettings'
import { workflowError } from './workflow'
import './workflow.css'

export default function PortalDashboard() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [state, setState] = useState({
    loading: true,
    profile: null,
    user: null,
    error: '',
  })
  const navigate = useNavigate(),
    location = useLocation()
  const view = location.pathname.split('/')[2] || 'overview'
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      if (!isSupabaseConfigured)
        throw new Error(
          'Portal configuration is unavailable. Please contact the school office.',
        )
      const { data, error } = await supabase.auth.getUser()
      if (error && error.name !== 'AuthSessionMissingError') throw error
      if (!data.user) {
        setState({ loading: false, profile: null, user: null, error: '' })
        return
      }
      const result = await supabase
        .from('profiles')
        .select('id,full_name,role,campus_id,campus:campuses(name,code)')
        .eq('id', data.user.id)
        .single()
      if (result.error) throw result.error
      if (!result.data)
        throw new Error(
          'Your school profile is not ready. Contact the school office.',
        )
      setState({
        loading: false,
        profile: result.data,
        user: data.user,
        error: '',
      })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: workflowError(err) }))
    }
  }, [])
  useEffect(() => {
    load()
    const { data } =
      supabase?.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT')
          setState({ loading: false, profile: null, user: null, error: '' })
      }) || {}
    return () => data?.subscription.unsubscribe()
  }, [load])
  if (state.loading)
    return (
      <div className="loading" role="status">
        Loading your portal…
      </div>
    )
  if (state.error)
    return (
      <section className="workflow-panel">
        <h1>Unable to load your portal</h1>
        <p role="alert">{state.error}</p>
        <button onClick={load}>Try again</button>{' '}
        <Link to="/portal/login">Back to sign in</Link>
      </section>
    )
  if (!state.profile) return <Navigate to="/portal/login" replace />
  const { profile, user } = state,
    admin = profile.role === 'admin'
  const fees = ['student', 'parent', 'admin'].includes(profile.role)
  const records = ['student', 'parent', 'teacher', 'admin'].includes(profile.role)
  if (
    (['learners', 'staff'].includes(view) && !admin) ||
    (view === 'fees' && !fees) ||
    (view === 'records' && !records) ||
    ![
      'overview',
      'learners',
      'staff',
      'fees',
      'records',
      'announcements',
      'timetable',
      'account',
    ].includes(view)
  )
    return <Navigate to="/portal" replace />
  const nav = (path, label, icon) => (
    <NavLink
      end={path === '/portal'}
      to={path}
      className={({ isActive }) => (isActive ? 'active' : '')}
      onClick={() => setMobileNavOpen(false)}
    >
      <span className="portal-nav-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) setState((s) => ({ ...s, error: error.message }))
    else navigate('/portal/login')
  }
  return (
    <main className="dashboard">
      <aside className={`portal-sidebar${mobileNavOpen ? ' mobile-nav-open' : ''}`}>
        <Link to="/portal" className="portal-mark">
          <img src={crest} alt="Fordridge crest" />
          <span>
            FORDRIDGE
            <br />
            <b>PORTAL</b>
          </span>
        </Link>
        <button
          type="button"
          className="portal-menu-toggle"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-expanded={mobileNavOpen}
          aria-controls="portal-navigation"
        >
          <span aria-hidden="true">{mobileNavOpen ? '×' : '☰'}</span>
          <span>{mobileNavOpen ? 'Close' : 'Menu'}</span>
        </button>
        <nav id="portal-navigation">
          <span className="portal-nav-label">Workspace</span>
          {nav('/portal', 'Overview', '⌂')}
          {admin && nav('/portal/learners', 'Learners', '◉')}
          {records && nav('/portal/records', 'Records', '▤')}
          {nav('/portal/announcements', 'Announcements', '✦')}
          {nav('/portal/timetable', 'Timetable', '◷')}
          <span className="portal-nav-label portal-nav-label-secondary">Management</span>
          {fees && nav('/portal/fees', 'Finance', '$')}
          {admin && nav('/portal/staff', 'Staff', '♙')}
          {['staff', 'admin'].includes(profile.role) && (
            <a
              href="https://inventory-management-system-3xi2f.sevalla.page/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="portal-nav-icon" aria-hidden="true">▣</span>
              <span>Inventory & POS</span><span aria-hidden="true">↗</span>
            </a>
          )}
          {nav('/portal/account', 'Account settings', '⚙')}
        </nav>
        <div className="portal-sidebar-footer">
          <div className="portal-account-summary">
          <span className="portal-avatar">{profile.full_name?.split(' ').map((part) => part[0]).slice(0, 2).join('') || 'F'}</span>
          <span><strong>{profile.full_name || 'Fordridge account'}</strong><small>{profile.role} portal</small></span>
        </div>
          <button className="portal-signout" onClick={logout}>Sign out <span aria-hidden="true">→</span></button>
        </div>
      </aside>
      <section
        className={
          view === 'fees' ? 'dashboard-main fees-main' : 'dashboard-main'
        }
      >
        <div className="portal-topbar">
          <div><span>Fordridge Schools</span><b>{profile.campus?.name || 'School portal'}</b></div>
          <div className="portal-topbar-status"><i /><span>Secure session</span></div>
        </div>
        {view === 'fees' ? (
          <FeesDashboard profile={profile} user={user} />
        ) : ['learners', 'staff'].includes(view) ? (
          <Directory key={view} view={view} />
        ) : view === 'records' ? (
          <LearnerRecords profile={profile} user={user} />
        ) : ['announcements', 'timetable'].includes(view) ? (
          <SchoolContent key={view} view={view} profile={profile} user={user} />
        ) : view === 'account' ? (
          <AccountSettings />
        ) : admin ? (
          <AdminOverview profile={profile} />
        ) : (
          <>
            <section className="portal-welcome">
              <div>
                <p className="eyebrow">Your school day</p>
                <h1>Good day, {profile.full_name?.split(' ')[0] || 'welcome'}.</h1>
                <p>Stay on top of what matters, from campus updates to your learner's progress.</p>
                <div className="portal-welcome-actions"><Link to="/portal/timetable">View timetable <span>→</span></Link><Link to="/portal/announcements">Latest notices</Link></div>
              </div>
              <div className="portal-welcome-mark"><span>FORDRIDGE</span><strong>Learn<br/>Excel<br/>Achieve</strong></div>
            </section>
            <div className="dashboard-grid">
              <Link className="dashboard-action" to="/portal/announcements">
                <span className="dashboard-card-icon">✦</span>
                <p>Campus updates</p>
                <h2>Announcements</h2>
                <span>Read school notices and important updates.</span>
                <b>Open notices <em>→</em></b>
              </Link>
              <Link className="dashboard-action" to="/portal/timetable">
                <span className="dashboard-card-icon">◷</span>
                <p>Your routine</p>
                <h2>Timetable</h2>
                <span>See your week at a glance and prepare ahead.</span>
                <b>View schedule <em>→</em></b>
              </Link>
              {records && (
                <Link className="dashboard-action" to="/portal/records">
                  <span className="dashboard-card-icon">▤</span>
                  <p>Progress hub</p>
                  <h2>Learner records</h2>
                  <span>Attendance and academic progress in one place.</span>
                  <b>Open records <em>→</em></b>
                </Link>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
