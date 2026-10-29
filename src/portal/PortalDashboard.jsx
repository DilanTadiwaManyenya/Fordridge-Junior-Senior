import { useCallback, useEffect, useRef, useState } from 'react'
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
import ClassCatalogue from './ClassCatalogue'
import SchoolContent from './SchoolContent'
import LearnerRecords from './LearnerRecords'
import AccountSettings from './AccountSettings'
import PortalOverview from './PortalOverview'
import ProgressReports from './ProgressReports'
import BulkAttendance from './BulkAttendance'
import ClassAssignments from './ClassAssignments'
import MyClass from './MyClass'
import SubjectAllocations from './SubjectAllocations'
import ExpenseCashbook from './ExpenseCashbook'
import ActivityLog from './ActivityLog'
import ParentAccounts from './ParentAccounts'
import NotificationCenter from './NotificationCenter'
import AttendanceHistory from './AttendanceHistory'
import LearningAnalytics from './LearningAnalytics'
import BulkMarks from './BulkMarks'
import CourseWork from './CourseWork'
import BulkLearnerImport from './BulkLearnerImport'
import ReportSettings from './ReportSettings'
import GradeBands from './GradeBands'
import ReportPublication from './ReportPublication'
import ReportReadiness from './ReportReadiness'
import ReportArchive from './ReportArchive'
import OfficialReports from './OfficialReports'
import ReportApprovalRegister from './ReportApprovalRegister'
import ReportReleaseMetrics from './ReportReleaseMetrics'
import ReportVerification from './ReportVerification'
import ReportingPeriods from './ReportingPeriods'
import YearRolloverReadiness from './YearRolloverReadiness'
import { withPortalTimeout, workflowError } from './workflow'
import { canOpenTeacherMyClass } from './teacher-workspace'
import { getFinanceNavigation } from './navigation'
import './workflow.css'

export default function PortalDashboard() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuToggleRef = useRef(null)
  const [state, setState] = useState({
    loading: true,
    profile: null,
    user: null,
    error: '',
  })
  const loadRequest = useRef(0)
  const navigate = useNavigate(),
    location = useLocation()
  const view = location.pathname.split('/')[2] || 'overview'
  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false)
    if (window.matchMedia('(max-width: 700px)').matches) {
      window.requestAnimationFrame(() => menuToggleRef.current?.focus())
    }
  }, [])
  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileNav()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen, closeMobileNav])
  const load = useCallback(async () => {
    const requestId = ++loadRequest.current
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const nextState = await withPortalTimeout(async () => {
        if (!isSupabaseConfigured)
          throw new Error(
            'Portal configuration is unavailable. Please contact the school office.',
          )
        const { data, error } = await supabase.auth.getUser()
        if (error && error.name !== 'AuthSessionMissingError') throw error
        if (!data.user)
          return { loading: false, profile: null, user: null, error: '' }
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
        const [contextResult, membershipResult] = await Promise.all([
          supabase.rpc('resolve_active_portal_context'),
          supabase
            .from('user_role_memberships')
            .select('role,campus_id,is_primary,campus:campuses(name,code)')
            .order('role'),
        ])
        if (contextResult.error) throw contextResult.error
        if (membershipResult.error) throw membershipResult.error
        const context = Array.isArray(contextResult.data)
          ? contextResult.data[0]
          : contextResult.data
        if (!context?.active_role)
          throw new Error('Your active role could not be loaded. Contact the school office.')
        if (context.active_role === 'student') {
          const learnerAccess = await supabase.rpc('learner_portal_access_status')
          if (learnerAccess.error) throw learnerAccess.error
          if (!learnerAccess.data?.allowed) {
            await supabase.auth.signOut()
            setState({
              loading: false,
              profile: null,
              user: null,
              error: 'This learner account is inactive or no longer enrolled. Contact the school office for help.',
            })
            return null
          }
        }
        const memberships = membershipResult.data || []
        const activeMembership = memberships.find(
          (item) =>
            item.role === context.active_role &&
            item.campus_id === context.active_campus_id,
        )
        let hasClassAssignment = false
        if (context.active_role === 'teacher' && context.active_campus_id) {
          const classAssignment = await supabase
            .from('teacher_class_assignments')
            .select('id')
            .eq('teacher_id', data.user.id)
            .eq('campus_id', context.active_campus_id)
            .eq('assignment_kind', 'class')
            .limit(1)
          if (classAssignment.error) throw classAssignment.error
          hasClassAssignment = Boolean(classAssignment.data?.length)
        }
        return {
          loading: false,
          profile: {
            ...result.data,
            primary_role: result.data.role,
            role: context.active_role,
            active_role: context.active_role,
            campus_id: context.active_campus_id,
            campus:
              activeMembership?.campus ||
              (context.active_campus_id === result.data.campus_id
                ? result.data.campus
                : null),
            role_memberships: memberships,
            has_class_assignment: hasClassAssignment,
          },
          user: data.user,
          error: '',
        }
      })
      if (requestId !== loadRequest.current) return
      if (nextState === null) return
      setState(nextState)
    } catch (err) {
      if (requestId !== loadRequest.current) return
      setState((s) => ({ ...s, loading: false, error: workflowError(err) }))
    }
  }, [])
  useEffect(() => {
    load()
    const { data } =
      supabase?.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          loadRequest.current += 1
          setState({ loading: false, profile: null, user: null, error: '' })
        }
      }) || {}
    return () => {
      loadRequest.current += 1
      data?.subscription.unsubscribe()
    }
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
  const { profile: loadedProfile, user } = state
  const scopedAdmin = loadedProfile.role === 'admin' && loadedProfile.campus_id
  const profile = scopedAdmin
    ? { ...loadedProfile, role: 'staff' }
    : loadedProfile
  const admin = profile.role === 'admin'
  const fees = ['student', 'parent', 'principal', 'accountant', 'admin'].includes(profile.role)
  const records = ['student', 'parent', 'teacher', 'admin'].includes(profile.role)
  const reports = ['student', 'parent', 'teacher', 'admin'].includes(profile.role)
  const attendance = ['teacher', 'admin'].includes(profile.role)
  const assignments = ['teacher', 'admin'].includes(profile.role)
  const teacherMyClass = canOpenTeacherMyClass(
    profile.role,
    profile.has_class_assignment,
  )
  const analytics = ['teacher', 'admin'].includes(profile.role)
  const financeNavigation = getFinanceNavigation(profile.role)
  if (
    (['learners', 'staff', 'classes'].includes(view) && !admin) ||
    (view === 'parent-accounts' && !admin) ||
    (view === 'fees' && !fees) ||
    (view === 'records' && !records) ||
    (view === 'reports' && !reports) ||
    (view === 'attendance' && !attendance) ||
    (view === 'attendance-history' && !attendance) ||
    (view === 'analytics' && !analytics) ||
    (view === 'marks' && !attendance) ||
    (view === 'coursework' && !attendance) ||
    (view === 'import-learners' && !admin) ||
    (view === 'report-settings' && !admin) ||
    (view === 'report-periods' && !admin) ||
    (view === 'grade-bands' && !admin) ||
    (view === 'report-release' && !admin) ||
    (view === 'report-readiness' && !admin) ||
    (view === 'report-archive' && !reports) ||
    (view === 'official-reports' && !reports) ||
    (view === 'report-approvals' && !admin) ||
    (view === 'report-dashboard' && !admin) ||
    (view === 'report-verification' && !admin) ||
    (view === 'year-rollover-readiness' && !admin) ||
    (view === 'assignments' && !admin) ||
    (view === 'my-class' && !teacherMyClass) ||
    (view === 'subject-allocations' && !assignments) ||
    (view === 'cashbook' && !admin) ||
    (view === 'activity' && !admin) ||
    ![
      'overview',
      'learners',
      'staff',
      'parent-accounts',
      'classes',
      'fees',
      'records',
      'reports',
      'attendance',
      'attendance-history',
      'analytics',
      'marks',
      'coursework',
      'import-learners',
      'report-settings',
      'report-periods',
      'grade-bands',
      'report-release',
      'report-readiness',
      'report-archive',
      'official-reports',
      'report-approvals',
      'report-dashboard',
      'report-verification',
      'year-rollover-readiness',
      'assignments',
      'my-class',
      'subject-allocations',
      'cashbook',
      'activity',
      'notifications',
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
      onClick={closeMobileNav}
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
  async function switchRole(event) {
    const [role, campusId = ''] = event.target.value.split('|')
    if (role === profile.active_role && (campusId || null) === profile.campus_id) return
    setState((s) => ({ ...s, loading: true, error: '' }))
    try {
      const { error } = await withPortalTimeout(
        () =>
          supabase.rpc('switch_active_portal_role', {
            p_role: role,
            p_campus_id: campusId || null,
          }),
      )
      if (error) throw error
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error: workflowError(error) }))
      return
    }
    await load()
  }
  const membershipLabel = (item) => {
    const roleName =
      item.role === 'admin'
        ? item.campus_id
          ? 'Campus Admin'
          : 'Main Admin'
        : item.role[0].toUpperCase() + item.role.slice(1)
    return `${roleName}${item.campus?.name ? ` · ${item.campus.name}` : ''}`
  }
  return (
    <main className="dashboard" key={`${profile.id}:${profile.role}:${profile.campus_id || 'all'}`}>
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
          ref={menuToggleRef}
          type="button"
          className="portal-menu-toggle"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-label={mobileNavOpen ? 'Close portal navigation' : 'Open portal navigation'}
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
          {admin && nav('/portal/import-learners', 'Bulk learner import', '⇧')}
          {admin && <span className="portal-nav-label portal-nav-label-secondary">Academic services</span>}
          {admin && nav('/portal/classes', 'Classes', '▦')}
          {admin && nav('/portal/year-rollover-readiness', 'Year rollover readiness', '↗')}
          {admin && nav('/portal/report-settings', 'Report settings', '▣')}
          {admin && nav('/portal/report-periods', 'Reporting periods', '◷')}
          {admin && nav('/portal/grade-bands', 'Grade bands', 'A')}
          {admin && nav('/portal/report-release', 'Report release', '✓')}
          {admin && nav('/portal/report-readiness', 'Report readiness', '◷')}
          {admin && nav('/portal/report-approvals', 'Approval register', '▤')}
          {admin && nav('/portal/report-dashboard', 'Report dashboard', '◉')}
          {admin && nav('/portal/report-verification', 'Report verification', '✓')}
          {records && nav('/portal/records', 'Records', '▤')}
          {reports && nav('/portal/reports', 'Progress reports', '▥')}
          {reports && nav('/portal/report-archive', 'Report archive', '▤')}
          {reports && nav('/portal/official-reports', 'Official reports', '▥')}
          {attendance && nav('/portal/attendance', 'Class attendance', '✓')}
          {attendance && nav('/portal/attendance-history', 'Attendance history', '◷')}
          {analytics && nav('/portal/analytics', 'Academic analytics', '▤')}
          {attendance && nav('/portal/marks', 'Bulk mark entry', '✎')}
          {attendance && nav('/portal/coursework', 'Course Work', '▤')}
          {admin && nav('/portal/assignments', 'Class assignments', '⌘')}
          {teacherMyClass && nav('/portal/my-class', 'My class', '▦')}
          {assignments && nav('/portal/subject-allocations', 'Subject allocations', '▤')}
          {nav('/portal/announcements', 'Announcements', '✦')}
          {nav('/portal/notifications', 'Notifications', '●')}
          {nav('/portal/timetable', 'Timetable', '◷')}
          {nav('/portal/account', 'Account settings', '⚙')}
          {financeNavigation.items.length > 0 && (
            <span className="portal-nav-label portal-nav-label-secondary">
              {financeNavigation.heading}
            </span>
          )}
          {financeNavigation.items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMobileNav}
              >
                <span className="portal-nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span><span aria-hidden="true">↗</span>
              </a>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'active' : '')}
                onClick={closeMobileNav}
              >
                <span className="portal-nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ),
          )}
          {admin && <span className="portal-nav-label portal-nav-label-secondary">Administration</span>}
          {admin && nav('/portal/activity', 'Activity Log', '◫')}
          {admin && nav('/portal/parent-accounts', 'Parent accounts', '♧')}
          {admin && nav('/portal/staff', 'Staff', '♙')}
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
          <div className="portal-page-context">
            <span>Fordridge Schools</span>
            {view !== 'overview' && (
              <Link
                className="portal-return-link"
                to="/portal"
                aria-label="Back to overview"
                onClick={closeMobileNav}
              >
                ← Overview
              </Link>
            )}
            <b>{profile.campus?.name || 'School portal'}</b>
          </div>
          <label className="portal-role-switcher">
            <span>Active role</span>
            {profile.role_memberships.length > 1 ? (
              <select
                aria-label="Active role"
                value={`${profile.active_role}|${profile.campus_id || ''}`}
                onChange={switchRole}
              >
                {profile.role_memberships.map((item) => {
                  const key = `${item.role}|${item.campus_id || ''}`
                  const deferredCampusAdmin = item.role === 'admin' && item.campus_id
                  return (
                    <option key={key} value={key} disabled={Boolean(deferredCampusAdmin)}>
                      {membershipLabel(item)}{deferredCampusAdmin ? ' · scoped access pending' : ''}
                    </option>
                  )
                })}
              </select>
            ) : <strong>{membershipLabel(profile.role_memberships.find((item) => item.role === profile.active_role && item.campus_id === profile.campus_id) || { role: profile.active_role })}</strong>}
          </label>
          <div className="portal-topbar-status"><i /><span>Secure session</span></div>
        </div>
        {view === 'fees' ? (
          <FeesDashboard profile={profile} user={user} />
        ) : view === 'classes' ? (
          <ClassCatalogue />
        ) : ['learners', 'staff'].includes(view) ? (
          <Directory key={view} view={view} />
        ) : view === 'import-learners' ? (
          <BulkLearnerImport />
        ) : view === 'report-settings' ? (
          <ReportSettings />
        ) : view === 'report-periods' ? (
          <ReportingPeriods profile={profile} />
        ) : view === 'grade-bands' ? (
          <GradeBands profile={profile} />
        ) : view === 'report-release' ? (
          <ReportPublication />
        ) : view === 'report-readiness' ? (
          <ReportReadiness />
        ) : view === 'report-archive' ? (
          <ReportArchive />
        ) : view === 'official-reports' ? (
          <OfficialReports />
        ) : view === 'report-approvals' ? (
          <ReportApprovalRegister />
        ) : view === 'report-dashboard' ? (
          <ReportReleaseMetrics />
        ) : view === 'report-verification' ? (
          <ReportVerification />
        ) : view === 'year-rollover-readiness' ? (
          <YearRolloverReadiness />
        ) : view === 'records' ? (
          <LearnerRecords profile={profile} user={user} />
        ) : view === 'reports' ? (
          <ProgressReports profile={profile} />
        ) : view === 'attendance' ? (
          <BulkAttendance profile={profile} />
        ) : view === 'attendance-history' ? (
          <AttendanceHistory />
        ) : view === 'analytics' ? (
          <LearningAnalytics />
        ) : view === 'marks' ? (
          <BulkMarks profile={profile} />
        ) : view === 'coursework' ? (
          <CourseWork profile={profile} />
        ) : view === 'assignments' ? (
          <ClassAssignments profile={profile} />
        ) : view === 'my-class' ? (
          <MyClass profile={profile} />
        ) : view === 'subject-allocations' ? (
          <SubjectAllocations profile={profile} />
        ) : view === 'cashbook' ? (
          <ExpenseCashbook />
        ) : view === 'activity' ? (
          <ActivityLog />
        ) : view === 'parent-accounts' ? (
          <ParentAccounts />
        ) : ['announcements', 'timetable'].includes(view) ? (
          <SchoolContent key={view} view={view} profile={profile} user={user} />
        ) : view === 'notifications' ? (
          <NotificationCenter user={user} />
        ) : view === 'account' ? (
          <AccountSettings />
        ) : admin ? (
          <AdminOverview profile={profile} />
        ) : <PortalOverview profile={profile} user={user} />}
      </section>
    </main>
  )
}
