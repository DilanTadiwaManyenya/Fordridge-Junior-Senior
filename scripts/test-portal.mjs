import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '../.portal-test-tools/node_modules/@electric-sql/pglite/dist/index.js'
import { canEnterPortal, withPortalTimeout } from '../src/portal/workflow.js'
import { buildTeacherClassScopes, canOpenTeacherMyClass } from '../src/portal/teacher-workspace.js'
import { getFinanceNavigation } from '../src/portal/navigation.js'

assert.deepEqual(
  getFinanceNavigation('accountant'),
  {
    heading: 'Accountant workspace',
    items: [{ to: '/portal/fees', label: 'Finance', icon: '$' }],
  },
  'Accountant navigation exposes the authorized Finance screen only',
)
assert.deepEqual(
  getFinanceNavigation('admin').items.map((item) => item.label),
  ['Finance', 'Expenses & Cashbook', 'Inventory & POS'],
  'Main Admin retains its Finance, cashbook and POS links',
)
assert.deepEqual(
  getFinanceNavigation('staff').items.map((item) => item.label),
  ['Inventory & POS'],
  'ordinary Staff do not see finance ledgers or cashbook',
)
assert.deepEqual(
  getFinanceNavigation('teacher').items,
  [],
  'teachers do not see finance navigation they are not authorized to use',
)

assert.equal(canOpenTeacherMyClass('teacher', true), true)
assert.equal(canOpenTeacherMyClass('teacher', false), false)
assert.equal(canOpenTeacherMyClass('admin', true), false)

const teacherLearners = [
  { id: 'one', campus_id: 'junior', class_level: 'Form 1', class_stream: 'A', full_name: 'A Learner' },
  { id: 'two', campus_id: 'junior', class_level: 'Form 1', class_stream: 'B', full_name: 'B Learner' },
  { id: 'three', campus_id: 'junior', class_level: 'Form 2', class_stream: null, full_name: 'Other Class Learner' },
  { id: 'four', campus_id: 'senior', class_level: 'Form 1', class_stream: 'A', full_name: 'Other Campus Learner' },
]
const wholeClassView = buildTeacherClassScopes([
  { assignment_kind: 'class', campus_id: 'junior', class_level: 'Form 1', class_stream: null },
], teacherLearners)
assert.deepEqual(
  wholeClassView[0].learners.map((learner) => learner.id),
  ['one', 'two'],
  'My class whole-class cards include each assigned stream and campus only',
)
const streamClassView = buildTeacherClassScopes([
  { assignment_kind: 'class', campus_id: 'junior', class_level: 'Form 1', class_stream: 'B' },
], teacherLearners)
assert.deepEqual(
  streamClassView[0].learners.map((learner) => learner.id),
  ['two'],
  'My class stream cards show only that stream',
)
assert.deepEqual(
  buildTeacherClassScopes([
    { assignment_kind: 'subject', campus_id: 'junior', class_level: 'Form 1', class_stream: 'A', subject: 'Maths' },
  ], teacherLearners),
  [],
  'subject-only allocations do not appear as class-register assignments',
)

const juniorWorkspaceLearners = [
  { id: 'ecd-one', campus_id: 'junior', class_level: 'ECD', class_stream: null, full_name: 'ECD Test Learner' },
  { id: 'grade-blue', campus_id: 'junior', class_level: 'Grade 3', class_stream: 'Example stream', full_name: 'Grade Test Learner' },
  { id: 'grade-other', campus_id: 'junior', class_level: 'Grade 3', class_stream: 'Other example stream', full_name: 'Other Grade Test Learner' },
]
const juniorWorkspaceView = buildTeacherClassScopes([
  { assignment_kind: 'class', campus_id: 'junior', class_level: 'ECD', class_stream: null },
  { assignment_kind: 'class', campus_id: 'junior', class_level: 'Grade 3', class_stream: 'Example stream' },
], juniorWorkspaceLearners)
assert.deepEqual(
  juniorWorkspaceView.map((scope) => [scope.class_level, scope.learners.map((learner) => learner.id)]),
  [
    ['ECD', ['ecd-one']],
    ['Grade 3', ['grade-blue']],
  ],
  'Junior ECD whole-class and Grade stream scopes use the same assignment-bound roster rules (synthetic fixtures)',
)
assert.equal(
  canOpenTeacherMyClass('teacher', juniorWorkspaceView.length > 0),
  true,
  'an assigned Junior ECD/Grade teacher can enter My class',
)

const db = new PGlite()
await db.exec(`create role authenticated; create role anon; create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema public,auth to authenticated,anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;`)
const preExistingUserId = '00000000-0000-4000-8000-000000000020'
for (const file of (await readdir('supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  if (file === '20261010000000_role_membership_storage.sql') {
    await db.query(
      'insert into auth.users(id,raw_user_meta_data) values($1,$2)',
      [preExistingUserId, JSON.stringify({ full_name: 'Legacy role account', portal_role: 'parent' })],
    )
    await db.query(
      "update public.profiles set role='teacher',campus_id=(select id from campuses where code='junior') where id=$1",
      [preExistingUserId],
    )
  }
  await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
}
const ids = ['admin', 'student', 'parent', 'stranger', 'teacher', 'stream_teacher', 'stream_student', 'other_student', 'subject_teacher'].reduce(
  (all, name, i) => ({
    ...all,
    [name]: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  }),
  {},
)
for (const [name, id] of Object.entries(ids)) {
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,$2)',
    [id, JSON.stringify({ full_name: name })],
  )
  await db.query(
    "update public.profiles set role=$1::app_role,campus_id=case when $1='admin' then null else (select id from campuses where code='junior') end,class_level='Form 1' where id=$2",
    [name === 'stranger' || name === 'stream_student' || name === 'other_student' ? 'student' : name === 'stream_teacher' || name === 'subject_teacher' ? 'teacher' : name, id],
  )
  await db.query(
    "update public.user_role_memberships set role=$1,campus_id=case when $1='admin' then null else (select id from campuses where code='junior') end where user_id=$2 and is_primary",
    [name === 'stranger' || name === 'stream_student' || name === 'other_student' ? 'student' : name === 'stream_teacher' || name === 'subject_teacher' ? 'teacher' : name, id],
  )
}
await db.query('insert into student_guardians values($1,$2)', [
  ids.student,
  ids.parent,
])
const campus = (await db.query("select id from campuses where code='junior'"))
  .rows[0].id
assert.equal(
  Number((await db.query('select count(*) from user_role_memberships where is_primary')).rows[0].count),
  Object.keys(ids).length + 1,
  'existing profiles are backfilled and new profiles receive a primary membership',
)
assert.equal(
  (await db.query("select role from user_role_memberships where user_id=$1 and is_primary", [ids.admin])).rows[0].role,
  'admin',
  'the existing Main Admin primary role is preserved',
)
assert.equal(
  (await db.query('select role from user_role_memberships where user_id=$1 and is_primary', [preExistingUserId])).rows[0].role,
  'teacher',
  'migration backfills a legacy profile role and campus without changing it',
)
await db.query(
  "insert into auth.users(id,raw_user_meta_data) values('00000000-0000-4000-8000-000000000010', $1)",
  [JSON.stringify({ full_name: 'Role target', portal_role: 'parent' })],
)
assert.equal(
  (await db.query("select role from user_role_memberships where user_id='00000000-0000-4000-8000-000000000010' and is_primary")).rows[0].role,
  'parent',
  'approved parent signup receives a matching primary membership',
)
const fee = (
  await db.query(
    'insert into fee_records(campus_id,student_id,amount) values($1,$2,100) returning id',
    [campus, ids.student],
  )
).rows[0].id
async function as(name) {
  await db.exec('reset role')
  const userId = ids[name] || ''
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    userId,
  ])
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(userId ? { session_id: userId } : {}),
  ])
  await db.exec('set role authenticated')
}
async function rejects(fn, pattern) {
  await assert.rejects(fn, pattern)
}
await as('admin')
assert.deepEqual(
  (await db.query('select active_role,active_campus_id from resolve_active_portal_context()')).rows,
  [{ active_role: 'admin', active_campus_id: null }],
  'a new Supabase session starts with its primary role and campus',
)
const term = await db.query(
  "select * from create_term_fee_record($1,'Form 1','ZIMSEC',1,2026,'Term 3',null)",
  [ids.student],
)
assert.equal(
  Number(term.rows[0].amount),
  475,
  'term fees include configured school fees',
)
const request = '10000000-0000-4000-8000-000000000001'
const pay = (amount, method = 'cash', key = request) =>
  db.query('select * from record_fee_payment($1,$2,$3,$4,$5)', [
    fee,
    amount,
    method,
    'test',
    key,
  ])
await pay(40)
await pay(40)
assert.equal(
  Number(
    (await db.query('select paid_amount from fee_records where id=$1', [fee]))
      .rows[0].paid_amount,
  ),
  40,
  'retry must not double charge',
)
assert.equal(
  (await db.query('select count(*) from fee_transactions')).rows[0].count,
  1,
)
assert.equal(
  (await db.query('select count(*) from audit_trail')).rows[0].count,
  1,
)
await rejects(() => pay(41), /already used/)
await rejects(
  () => pay(61, 'cash', '10000000-0000-4000-8000-000000000002'),
  /outstanding/,
)
await rejects(
  () => pay(5, 'invalid', '10000000-0000-4000-8000-000000000003'),
  /check constraint/,
)
assert.equal(
  Number(
    (await db.query('select paid_amount from fee_records where id=$1', [fee]))
      .rows[0].paid_amount,
  ),
  40,
  'failed transaction must roll back',
)
await rejects(
  () =>
    db.query(
      "insert into fee_transactions(fee_record_id,campus_id,amount,payment_method,recorded_by) values($1,$2,1,'cash',$3)",
      [fee, campus, ids.admin],
    ),
  /permission denied/,
)
await rejects(
  () => db.query('update fee_records set paid_amount=99 where id=$1', [fee]),
  /permission denied/,
)
await db.query('select admin_correct_learner_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
  ids.student,
  'Student baseline',
  campus,
  'F001',
  'Form 1',
  'A',
  'active',
  'Correct imported learner details',
])
await rejects(
  () => db.query('select admin_correct_learner_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
    ids.student, 'Invalid Update', campus, 'F001', 'Form 1', 'A', 'active', 'wrong',
  ]),
  /Correction reason must be between 10 and 500 characters/,
)
await rejects(
  () => db.query('select admin_update_profile($1,$2,$3,$4,$5,$6,$7)', [
    ids.student, 'Bypass Attempt', campus, 'F001', 'Form 1', 'A', 'active',
  ]),
  /controlled learner correction workflow/,
)
const firstCorrection = (await db.query(
  "select actor_id,action,detail from audit_trail where entity_type='learner_profile' and entity_id=$1 order by created_at desc limit 1",
  [ids.student],
)).rows[0]
assert.equal(firstCorrection.actor_id, ids.admin, 'learner correction audit records the acting administrator')
assert.equal(firstCorrection.action, 'corrected')
assert.equal(firstCorrection.detail.reason, 'Correct imported learner details')
assert.deepEqual(firstCorrection.detail.changes.admission_number, { from: null, to: 'F001' })
await db.query(
  "insert into announcements(campus_id,title,body,published_at) values($1,'Draft','hidden',null),($1,'Published','visible',now())",
  [campus],
)
await db.query(
  "insert into timetable(campus_id,subject,day_of_week,starts_at,ends_at,class_level,audience_role) values($1,'Maths',1,'08:00','09:00','Form 1','student'),($1,'Other class',1,'09:00','10:00','Form 2','student')",
  [campus],
)
await db.query(
  "insert into learner_records(student_id,kind,event_date,title) values($1,'academic',current_date,'Maths'),($1,'wellbeing',current_date,'Private support')",
  [ids.student],
)
await db.query(
  "insert into learner_records(student_id,kind,event_date,title,attendance_status) values($1,'attendance',current_date,'Register','present')",
  [ids.student],
)
await rejects(
  () =>
    db.query(
      "insert into learner_records(student_id,kind,event_date,title,attendance_status) values($1,'attendance',current_date,'Duplicate','absent')",
      [ids.student],
    ),
  /duplicate key/,
)
await as('student')
await rejects(() => pay(1), /Administrator/)
await rejects(
  () => db.query('select * from principal_finance_fee_records()'),
  /Principal finance access required/,
)
await rejects(
  () =>
    db.query('select admin_update_profile($1,$2,$3,null,null,null,null)', [
      ids.student,
      'Hacked',
      campus,
    ]),
  /Administrator/,
)
assert.equal(
  (await db.query('select title from announcements')).rows.length,
  1,
  'student cannot see drafts',
)
assert.equal(
  (await db.query('select subject from timetable')).rows.length,
  1,
  'student only sees own class',
)
assert.equal(
  (await db.query('select * from learner_records')).rows.length,
  2,
  'wellbeing notes stay private',
)
await as('parent')
assert.equal((await db.query('select * from learner_records')).rows.length, 2)
assert.equal((await db.query('select subject from timetable')).rows.length, 1)
assert.equal(
  (await db.query('select * from profiles where id=$1', [ids.student])).rows
    .length,
  1,
)
await as('stranger')
assert.equal((await db.query('select * from learner_records')).rows.length, 0)
assert.equal((await db.query('select * from fee_records')).rows.length, 0)
await as('admin')
const formOne = (await db.query(
  "insert into school_classes(campus_id,class_level) values($1,'Form 1') returning id",
  [campus],
)).rows[0].id
await db.query(
  "insert into school_classes(campus_id,class_level) values($1,'Form 2')",
  [campus],
)
const streamA = (await db.query(
  "insert into school_class_streams(class_id,stream_name) values($1,'A') returning id",
  [formOne],
)).rows[0].id
const streamB = (await db.query(
  "insert into school_class_streams(class_id,stream_name) values($1,'B') returning id",
  [formOne],
)).rows[0].id
const correctLearner = (id, name, admission, classLevel, stream, status = 'active') =>
  db.query('select admin_correct_learner_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
    id, name, campus, admission, classLevel, stream, status,
    'Set up the confirmed learner profile',
  ])
await correctLearner(ids.student, 'Updated Student', 'F001', 'Form 1', 'A')
await correctLearner(ids.stream_student, 'Stream B Learner', 'B001', 'Form 1', 'B')
await correctLearner(ids.other_student, 'Other Class Learner', 'F201', 'Form 2', '')
await correctLearner(ids.stranger, 'Unassigned Learner', 'U001', 'Form 2', '')
await db.query('select admin_update_profile($1,$2,$3,$4,$5,$6,$7)', [ids.stream_teacher, 'Stream Teacher', campus, null, null, null, null])
await db.query('select admin_update_profile($1,$2,$3,$4,$5,$6,$7)', [ids.subject_teacher, 'Subject Teacher', campus, null, null, null, null])
await db.query(
  "insert into teacher_class_assignments(teacher_id,campus_id,class_level,class_id,subject) values($1,$2,'Form 1',$3,null)",
  [ids.teacher, campus, formOne],
)
await db.query(
  "insert into teacher_class_assignments(teacher_id,campus_id,class_level,class_stream,class_id,class_stream_id,subject) values($1,$2,'Form 1','B',$3,$4,null)",
  [ids.stream_teacher, campus, formOne, streamB],
)
await db.query(
  "insert into teacher_class_assignments(teacher_id,campus_id,class_level,class_id,subject) values($1,$2,'Form 1',$3,'Science')",
  [ids.teacher, campus, formOne],
)
await db.query(
  "insert into teacher_class_assignments(teacher_id,campus_id,class_level,class_stream,class_id,class_stream_id,subject,assignment_kind) values($1,$2,'Form 1','A',$3,$4,'English','subject')",
  [ids.subject_teacher, campus, formOne, streamA],
)
await rejects(
  () => db.query(
    "insert into teacher_class_assignments(teacher_id,campus_id,class_level,class_stream,class_id,class_stream_id,subject) values($1,$2,'Form 1','B',$3,$4,'science')",
    [ids.stream_teacher, campus, formOne, streamB],
  ),
  /overlapping teacher assignment/,
)
await rejects(
  () => db.query(
    "insert into teacher_class_assignments(teacher_id,campus_id,class_level,subject) values($1,$2,'Form 1','Art')",
    [ids.teacher, campus],
  ),
  /Choose a confirmed class/,
)
const seniorCampus = (await db.query("select id from campuses where code='senior'")).rows[0].id
const seniorSixthForm = (await db.query(
  "insert into school_classes(campus_id,class_level) values($1,'Sixth Form') returning id",
  [seniorCampus],
)).rows[0].id
const seniorStreamA = (await db.query(
  "insert into school_class_streams(class_id,stream_name) values($1,'Example A') returning id",
  [seniorSixthForm],
)).rows[0].id
const seniorStreamB = (await db.query(
  "insert into school_class_streams(class_id,stream_name) values($1,'Example B') returning id",
  [seniorSixthForm],
)).rows[0].id
const seniorLearnerId = '00000000-0000-4000-8000-000000000011'
const otherSeniorLearnerId = '00000000-0000-4000-8000-000000000012'
await db.exec('reset role')
for (const [id, name, stream] of [
  [seniorLearnerId, 'Sixth Form Example A Learner', 'Example A'],
  [otherSeniorLearnerId, 'Sixth Form Example B Learner', 'Example B'],
]) {
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
    id,
    JSON.stringify({ full_name: name }),
  ])
  await db.query(
    "update profiles set campus_id=$1,class_level='Sixth Form',class_stream=$2,enrollment_status='active' where id=$3",
    [seniorCampus, stream, id],
  )
}
await as('admin')
await db.query(
  "insert into teacher_class_assignments(teacher_id,campus_id,class_level,class_stream,class_id,class_stream_id,subject,assignment_kind) values($1,$2,'Sixth Form','Example A',$3,$4,'Biology','subject')",
  [ids.teacher, seniorCampus, seniorSixthForm, seniorStreamA],
)
await db.query(
  "select grant_portal_role($1,'teacher',$2,'Approved second campus teaching assignment')",
  [ids.teacher, seniorCampus],
)
await as('teacher')
assert.equal(canEnterPortal('teacher', 'staff'), true)
assert.equal(canEnterPortal('student', 'staff'), false)
assert.equal(canEnterPortal('parent', 'student'), false)
assert.equal(
  await withPortalTimeout(() => Promise.resolve('ready'), 100),
  'ready',
  'portal timeout wrapper returns successful requests',
)
await assert.rejects(
  withPortalTimeout(() => new Promise(() => {}), 5),
  /portal took too long to respond/,
  'portal timeout wrapper rejects stalled requests',
)
await rejects(() => pay(1), /Administrator/)
const wholeClassLearners = await db.query(
  "select id from profiles where role='student' order by id",
)
assert.deepEqual(
  wholeClassLearners.rows.map(row => row.id).sort(),
  [ids.student, ids.stream_student].sort(),
  'a whole-class assignment covers every stream but not another class',
)
assert.equal(
  (await db.query('select teacher_has_class_assignment($1,$2,$3) as allowed', [campus, 'Form 1', 'B'])).rows[0].allowed,
  true,
)
assert.equal(
  (await db.query('select teacher_has_class_assignment($1,$2,$3) as allowed', [campus, 'Form 2', null])).rows[0].allowed,
  false,
)
assert.equal(
  (await db.query('select teacher_has_class_assignment($1,$2,$3) as allowed', [seniorCampus, 'Sixth Form', 'Example A'])).rows[0].allowed,
  false,
  'a junior campus assignment does not grant senior campus access',
)
assert.equal(
  (await db.query('select teacher_has_subject_assignment($1,$2,$3,$4) as allowed', [seniorCampus, 'Sixth Form', 'Example A', 'Biology'])).rows[0].allowed,
  false,
  'a subject assignment from another active campus is not enabled',
)
assert.equal(
  (await db.query('select count(*) from profiles where id=$1', [seniorLearnerId])).rows[0].count,
  0,
  'the teacher cannot query another assigned campus before switching context',
)
assert.deepEqual(
  (await db.query("select active_role,active_campus_id from switch_active_portal_role('teacher',$1)", [seniorCampus])).rows,
  [{ active_role: 'teacher', active_campus_id: seniorCampus }],
  'a multi-campus teacher can explicitly switch campus context',
)
assert.equal(
  (await db.query('select teacher_has_class_assignment($1,$2,$3) as allowed', [seniorCampus, 'Sixth Form', 'Example A'])).rows[0].allowed,
  false,
  'a subject-only Sixth Form allocation does not grant class-register access',
)
assert.equal(
  (await db.query('select teacher_has_subject_assignment($1,$2,$3,$4) as allowed', [seniorCampus, 'Sixth Form', 'Example A', 'Biology'])).rows[0].allowed,
  true,
  'the assigned Sixth Form subject and stream are available after switching context',
)
assert.equal(
  (await db.query('select teacher_has_subject_assignment($1,$2,$3,$4) as allowed', [seniorCampus, 'Sixth Form', 'Example B', 'Biology'])).rows[0].allowed,
  false,
  'the Sixth Form subject allocation does not include another stream',
)
assert.equal(
  (await db.query('select teacher_has_subject_assignment($1,$2,$3,$4) as allowed', [seniorCampus, 'Sixth Form', 'Example A', 'Chemistry'])).rows[0].allowed,
  false,
  'the Sixth Form stream allocation does not include another subject',
)
assert.equal(
  (await db.query('select count(*) from profiles where id=$1', [seniorLearnerId])).rows[0].count,
  1,
  'assigned Sixth Form learner appears only in the matching active campus context',
)
assert.equal(
  (await db.query('select count(*) from profiles where id=$1', [otherSeniorLearnerId])).rows[0].count,
  0,
  'an unassigned Sixth Form stream learner is not visible',
)
await db.query("select record_bulk_marks('Biology Quiz','Biology',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: seniorLearnerId, score: 80 }])])
await rejects(
  () => db.query("select record_bulk_marks('Biology Quiz','Biology',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: otherSeniorLearnerId, score: 80 }])]),
  /Subject is not allocated/,
)
await db.query("select switch_active_portal_role('teacher',$1)", [campus])
await db.query('select record_bulk_attendance(current_date,$1::jsonb)', [JSON.stringify([{ student_id: ids.stream_student, attendance_status: 'present' }])])
await rejects(
  () => db.query("select record_bulk_marks('Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 75 }])]),
  /Choose an allocated subject/,
)
await db.query("select record_bulk_marks('Quiz 1','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 75 }])])
assert.equal(
  (await db.query("select subject from learner_records where student_id=$1 and title='Quiz 1'", [ids.stream_student])).rows[0].subject,
  'Science',
  'Markbook persists subject separately from the assessment title',
)
await rejects(
  () => db.query('select record_bulk_attendance(current_date,$1::jsonb)', [JSON.stringify([{ student_id: ids.other_student, attendance_status: 'present' }])]),
  /outside an assigned class/,
)
await rejects(
  () => db.query("select record_bulk_marks('Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.other_student, score: 75 }])]),
  /Choose an allocated subject/,
)
await rejects(
  () => db.query("select record_bulk_marks('Quiz 2','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.other_student, score: 75 }])]),
  /Subject is not allocated/,
)
assert.equal(
  (await db.query("select count(*) from learner_records where student_id=$1 and kind='wellbeing'", [ids.student])).rows[0].count,
  0,
  'teacher assignment does not reveal wellbeing records',
)
await as('stream_teacher')
assert.deepEqual(
  (await db.query("select id from profiles where role='student'")).rows.map(row => row.id),
  [ids.stream_student],
  'a stream assignment exposes only learners in that stream',
)
await rejects(
  () => db.query('select record_bulk_attendance(current_date,$1::jsonb)', [JSON.stringify([{ student_id: ids.student, attendance_status: 'late' }])]),
  /outside an assigned class/,
)
await as('subject_teacher')
assert.deepEqual(
  (await db.query("select id from profiles where role='student'")).rows.map(row => row.id),
  [ids.student],
  'a subject allocation grants only its assigned stream learner scope',
)
assert.equal(
  (await db.query('select teacher_has_class_assignment($1,$2,$3) as allowed', [campus, 'Form 1', 'A'])).rows[0].allowed,
  false,
  'a subject-only allocation does not grant class-register attendance scope',
)
await rejects(
  () => db.query('select record_bulk_attendance(current_date,$1::jsonb)', [JSON.stringify([{ student_id: ids.student, attendance_status: 'late' }])]),
  /outside an assigned class/,
)
await db.query("select record_bulk_marks('Essay','English',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.student, score: 80 }])])
await rejects(
  () => db.query("select record_bulk_marks('Essay','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.student, score: 80 }])]),
  /Subject is not allocated/,
)
await rejects(
  () => db.query("select record_bulk_marks('Essay','English',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 80 }])]),
  /Subject is not allocated/,
)
await as('admin')
await db.query("select record_bulk_marks('Baseline mark','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([
  { student_id: ids.other_student, score: 60 },
  { student_id: ids.stranger, score: 55 },
])])
await db.query(
  "insert into report_grade_bands(campus_id,minimum_percent,maximum_percent,grade,descriptor) values($1,0,100,'A','Excellent')",
  [campus],
)
await db.query(
  "insert into report_term_settings(campus_id,academic_year,academic_term,class_teacher_name,head_of_school_name,updated_by) values($1,2026,'Term 1','Class Teacher','Head of School',$2)",
  [campus, ids.admin],
)
const publicationId = (await db.query(
  "insert into report_publications(campus_id,academic_year,academic_term,published_at,published_by) values($1,2026,'Term 1',now(),$2) returning id",
  [campus, ids.admin],
)).rows[0].id
const frozen = (await db.query(
  'select assessments,subject_signatories from report_release_snapshots where publication_id=$1 and student_id=$2',
  [publicationId, ids.stream_student],
)).rows[0]
assert.ok(frozen.assessments.some(item => item.title === 'Quiz 1' && item.subject === 'Science'), 'official snapshots preserve the allocated subject')
assert.equal(frozen.subject_signatories.Science, 'T', 'whole-class subject allocations appear on stream-specific report snapshots')
await as('teacher')
await rejects(
  () => db.query('select admin_correct_learner_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
    ids.stream_student, 'Unauthorised Correction', campus, 'B001', 'Form 1', 'B', 'active', 'This must be denied',
  ]),
  /Administrator access required/,
)
await as('admin')
await correctLearner(ids.stream_student, 'Corrected After Publication', 'B001', 'Form 1', 'B')
const frozenAfterCorrection = (await db.query(
  'select assessments,subject_signatories from report_release_snapshots where publication_id=$1 and student_id=$2',
  [publicationId, ids.stream_student],
)).rows[0]
assert.deepEqual(frozenAfterCorrection, frozen, 'correcting the current learner profile leaves the issued report snapshot unchanged')
await as('student')
assert.equal(
  Number((await db.query('select count(*) from user_role_memberships')).rows[0].count),
  1,
  'users can read only their own role memberships',
)
await rejects(
  () => db.query("insert into user_role_memberships(user_id,role,grant_reason) values($1,'admin','self grant')", [ids.student]),
  /permission denied/,
)
await as('admin')
const accountantGrant = (await db.query(
  "select grant_portal_role($1,'accountant',$2,'Approved finance role for testing') as id",
  ['00000000-0000-4000-8000-000000000010', campus],
)).rows[0].id
await db.query(
  "select grant_portal_role($1,'admin',null,'Approved secondary Main Admin role')",
  ['00000000-0000-4000-8000-000000000010'],
)
await db.query(
  "select grant_portal_role($1,'admin',$2,'Approved Campus Admin role')",
  ['00000000-0000-4000-8000-000000000010', campus],
)
assert.equal(
  (await db.query("select role from user_role_memberships where id=$1", [accountantGrant])).rows[0].role,
  'accountant',
  'Main Admin can create a campus-scoped additional role grant',
)
assert.equal(
  (await db.query('select grant_portal_role($1,$2,$3,$4) as id', ['00000000-0000-4000-8000-000000000010', 'accountant', campus, 'Approved finance role for testing'])).rows[0].id,
  accountantGrant,
  'repeating a role grant does not duplicate membership',
)
await rejects(
  () => db.query("select grant_portal_role($1,'teacher',$2,'Attempted self grant')", [ids.admin, campus]),
  /cannot grant a role to yourself/,
)
await rejects(
  () => db.query("select revoke_portal_role($1,'parent',null,'Attempted primary revoke')", ['00000000-0000-4000-8000-000000000010']),
  /Primary role must be changed through account provisioning/,
)
await rejects(
  () => db.query("insert into user_role_memberships(user_id,role,grant_reason) values($1,'teacher','Direct write')", [ids.stranger]),
  /permission denied/,
)
await as('teacher')
await rejects(
  () => db.query("select grant_portal_role($1,'accountant',$2,'Teacher cannot grant roles')", ['00000000-0000-4000-8000-000000000010', campus]),
  /Main administrator access required/,
)
await db.exec('reset role')
await db.query(
  "update public.profiles set role='teacher',campus_id=$1 where id='00000000-0000-4000-8000-000000000010'",
  [campus],
)
await as('admin')
await db.query(
  "select replace_primary_portal_role($1,'teacher'::app_role,$2,'Administrator provisioned teacher account')",
  ['00000000-0000-4000-8000-000000000010', campus],
)
assert.deepEqual(
  (await db.query("select role,is_primary,campus_id is not null as campus_scoped from user_role_memberships where user_id='00000000-0000-4000-8000-000000000010' order by role,campus_id")).rows,
  [
    { role: 'accountant', is_primary: false, campus_scoped: true },
    { role: 'admin', is_primary: false, campus_scoped: true },
    { role: 'admin', is_primary: false, campus_scoped: false },
    { role: 'teacher', is_primary: true, campus_scoped: true },
  ],
  'provisioning replaces the temporary signup role while preserving separately granted roles',
)
const roleTargetId = '00000000-0000-4000-8000-000000000010'
const roleTargetSession = '10000000-0000-4000-8000-000000000001'
await db.query(
  "select grant_portal_role($1,'principal',$2,'Approved campus read-only finance access')",
  [roleTargetId, campus],
)
const seniorFinanceFee = (await db.query(
  'insert into fee_records(campus_id,student_id,amount) values($1,$2,50) returning id',
  [seniorCampus, ids.other_student],
)).rows[0].id
await db.query(
  "select record_fee_payment($1,5,'cash','senior campus test','20000000-0000-4000-8000-000000000001')",
  [seniorFinanceFee],
)
await db.exec('reset role')
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [roleTargetId])
await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: roleTargetSession })])
await db.exec('set role authenticated')
assert.deepEqual(
  (await db.query('select active_role,active_campus_id from resolve_active_portal_context()')).rows,
  [{ active_role: 'teacher', active_campus_id: campus }],
  'a session initializes to the provisioned primary role and campus',
)
assert.deepEqual(
  (await db.query("select active_role,active_campus_id from switch_active_portal_role('accountant',$1)", [campus])).rows,
  [{ active_role: 'accountant', active_campus_id: campus }],
  'a user can switch only to an explicitly granted role and scope',
)
assert.equal(
  (await db.query('select my_role()::text as role')).rows[0].role,
  'accountant',
  'database authorization follows the active Accountant role instead of the primary role',
)
assert.equal(
  (await db.query('select my_campus_id() as campus_id')).rows[0].campus_id,
  campus,
  'database campus scope follows the active membership',
)
assert.equal(
  (await db.query('select count(*) from fee_records')).rows[0].count,
  Number((await db.query('select count(*) from fee_records where campus_id=$1', [campus])).rows[0].count),
  'an Accountant reads only its assigned campus fee records',
)
assert.equal(
  (await db.query('select count(*) from fee_records where campus_id=$1', [seniorCampus])).rows[0].count,
  0,
  'an Accountant cannot read fee records from another campus',
)
const accountantPaymentRequest = '30000000-0000-4000-8000-000000000002'
const accountantPayment = (await db.query(
  "select * from record_fee_payment($1,1,'cash','accountant campus payment',$2)",
  [fee, accountantPaymentRequest],
)).rows[0]
assert.equal(accountantPayment.campus_id, campus)
assert.equal(accountantPayment.recorded_by, roleTargetId)
assert.equal(
  (await db.query(
    "select id from record_fee_payment($1,1,'cash','accountant campus payment',$2)",
    [fee, accountantPaymentRequest],
  )).rows[0].id,
  accountantPayment.id,
  'accountant payment retries remain idempotent',
)
assert.equal(
  Number((await db.query('select count(*) from fee_transactions where request_id=$1', [accountantPaymentRequest])).rows[0].count),
  1,
  'an accountant retry does not duplicate a campus payment',
)
await rejects(
  () => db.query("select * from record_fee_payment($1,1,'cash','wrong campus','30000000-0000-4000-8000-000000000003')", [seniorFinanceFee]),
  /unavailable in your assigned campus/,
)
assert.ok(
  Number((await db.query('select count(*) from fee_transactions where campus_id=$1', [campus])).rows[0].count) > 0,
  'Accountant can read assigned-campus payment history',
)
const accountantFeeRows = await db.query('select * from accountant_finance_fee_records()')
assert.ok(accountantFeeRows.rows.length > 0)
assert.ok(accountantFeeRows.rows.every((row) => row.campus_id === campus))
assert.deepEqual(
  Object.keys(accountantFeeRows.rows[0]).sort(),
  ['academic_term','academic_year','amount','campus_code','campus_id','campus_name','currency','due_date','id','paid_amount','payment_reference','status','student_name'].sort(),
  'the Accountant RPC returns only required campus fee and learner directory fields',
)
assert.ok(
  Number((await db.query('select count(*) from fee_settings')).rows[0].count) > 0,
  'Accountant can read the shared fee schedule',
)
assert.equal(
  (await db.query("update fee_settings set setting_value=setting_value+1 where setting_key='fee_olevel_zimsec' returning setting_key")).rows.length,
  0,
  'Accountant cannot modify fee settings',
)
await rejects(
  () => db.query('insert into fee_records(campus_id,student_id,amount) values($1,$2,25)', [campus, ids.student]),
  /row-level security/,
)
await rejects(
  () => db.query("insert into fee_transactions(fee_record_id,campus_id,amount,payment_method,recorded_by) values($1,$2,1,'cash',$3)", [fee, campus, roleTargetId]),
  /permission denied/,
)
await rejects(
  () => db.query("insert into cashbook_expenses(expense_date,category,description,amount) values(current_date,'test','accountant write attempt',1)"),
  /row-level security/,
)
assert.equal(
  Number((await db.query('select count(*) from cashbook_expenses')).rows[0].count),
  0,
  'Accountant cannot read the unscoped cashbook',
)
await rejects(
  () => db.query('select * from principal_finance_fee_records()'),
  /Principal finance access required/,
)
assert.deepEqual(
  (await db.query("select active_role,active_campus_id from switch_active_portal_role('principal',$1)", [campus])).rows,
  [{ active_role: 'principal', active_campus_id: campus }],
  'an assigned Principal can activate the approved campus scope',
)
assert.equal(
  (await db.query('select my_role()::text as role')).rows[0].role,
  'principal',
  'database finance authorization follows the selected Principal role',
)
assert.ok(
  Number((await db.query('select count(*) from fee_records where campus_id=$1', [campus])).rows[0].count) > 0,
  'Principal can read fee records for the assigned campus',
)
assert.equal(
  (await db.query('select count(*) from fee_records where id=$1', [seniorFinanceFee])).rows[0].count,
  0,
  'Principal cannot read fee records from another campus',
)
assert.ok(
  Number((await db.query('select count(*) from fee_transactions where campus_id=$1', [campus])).rows[0].count) > 0,
  'Principal can read payment transactions for the assigned campus',
)
assert.equal(
  (await db.query('select count(*) from fee_transactions where campus_id=$1', [seniorCampus])).rows[0].count,
  0,
  'Principal cannot read payment transactions from another campus',
)
assert.ok(
  Number((await db.query('select count(*) from fee_settings')).rows[0].count) > 0,
  'Principal can read the school-wide fee schedule',
)
const principalFeeRows = await db.query('select * from principal_finance_fee_records()')
assert.ok(principalFeeRows.rows.length > 0)
assert.ok(principalFeeRows.rows.every((row) => row.campus_id === campus))
assert.deepEqual(
  Object.keys(principalFeeRows.rows[0]).sort(),
  ['academic_term','academic_year','amount','campus_code','campus_id','campus_name','currency','due_date','id','paid_amount','payment_reference','status','student_name'].sort(),
  'the read-only Principal RPC returns only required fee and learner directory fields',
)
assert.equal(
  (await db.query("select has_function_privilege('anon','public.principal_finance_fee_records()','EXECUTE') as allowed")).rows[0].allowed,
  false,
  'anonymous callers cannot execute the Principal finance RPC',
)
assert.equal(
  (await db.query("update fee_settings set setting_value=setting_value+1 where setting_key='fee_olevel_zimsec' returning setting_key")).rows.length,
  0,
  'Principal cannot modify school fee settings',
)
await rejects(() => pay(1), /Administrator/)
await rejects(
  () => db.query("select create_term_fee_record($1,'Form 1','ZIMSEC',1,2026,'Term 1',null)", [ids.student]),
  /Only administrators/,
)
await rejects(
  () => db.query('insert into fee_records(campus_id,student_id,amount) values($1,$2,25)', [campus, ids.student]),
  /row-level security/,
)
await rejects(
  () => db.query("insert into fee_transactions(fee_record_id,campus_id,amount,payment_method,recorded_by) values($1,$2,1,'cash',$3)", [fee, campus, roleTargetId]),
  /permission denied/,
)
await rejects(
  () => db.query("insert into cashbook_expenses(expense_date,category,description,amount) values(current_date,'test','principal write attempt',1)"),
  /row-level security/,
)
assert.equal(
  Number((await db.query('select count(*) from cashbook_expenses')).rows[0].count),
  0,
  'Principal does not receive unscoped cashbook records',
)
await rejects(
  () => db.query("select switch_active_portal_role('admin',$1)", [campus]),
  /Campus Admin switching requires the scoped policy stage/,
)
assert.deepEqual(
  (await db.query("select active_role,active_campus_id from switch_active_portal_role('admin',null)")).rows,
  [{ active_role: 'admin', active_campus_id: null }],
  'a school-wide Main Admin membership can be selected in its own session',
)
assert.equal(
  (await db.query('select my_role()::text as role')).rows[0].role,
  'admin',
  'database authorization follows the verified active Main Admin membership',
)
assert.equal(
  (await db.query('select my_campus_id() as campus_id')).rows[0].campus_id,
  null,
  'Main Admin remains school-wide only when the active membership is unscoped',
)
assert.deepEqual(
  (await db.query("select active_role,active_campus_id from switch_active_portal_role('teacher',$1)", [campus])).rows,
  [{ active_role: 'teacher', active_campus_id: campus }],
  'the user can return to the primary context',
)
assert.equal(
  (await db.query('select my_role()::text as role')).rows[0].role,
  'teacher',
  'database authorization changes back with the active role context',
)
await db.exec('reset role')
const otherSession = '10000000-0000-4000-8000-000000000002'
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [roleTargetId])
await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: otherSession })])
await db.exec('set role authenticated')
assert.deepEqual(
  (await db.query('select active_role,active_campus_id from resolve_active_portal_context()')).rows,
  [{ active_role: 'teacher', active_campus_id: campus }],
  'role switching in one session does not change another session',
)
await as('admin')
await db.query(
  "select revoke_portal_role($1,'admin',$2,'Campus admin scope test complete')",
  [roleTargetId, campus],
)
await db.query(
  "select revoke_portal_role($1,'accountant',$2,'Finance role no longer needed')",
  ['00000000-0000-4000-8000-000000000010', campus],
)
assert.ok(
  Number((await db.query("select count(*) from audit_trail where entity_type='role_membership' and entity_id='00000000-0000-4000-8000-000000000010'")).rows[0].count) >= 4,
  'role grant, provisioning and revocation are written to the audit trail',
)
assert.equal(
  (await db.query("select count(*) from user_role_memberships where user_id='00000000-0000-4000-8000-000000000010' and role='accountant'")).rows[0].count,
  0,
  'Main Admin can revoke an additional grant with an audit reason',
)
await db.exec('reset role')
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [roleTargetId])
await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: roleTargetSession })])
await db.exec('set role authenticated')
assert.deepEqual(
  (await db.query('select active_role,active_campus_id from resolve_active_portal_context()')).rows,
  [{ active_role: 'teacher', active_campus_id: campus }],
  'a revoked active membership resets to the primary role on reload',
)
assert.equal(
  (await db.query("select count(*) from user_role_memberships where user_id='00000000-0000-4000-8000-000000000010' and role='admin'")).rows[0].count,
  1,
  'additional role grants remain stored separately from the primary role',
)
await db.exec('reset role')
await db.query("select set_config('request.jwt.claim.sub',$1,false)", ['00000000-0000-4000-8000-000000000010'])
await db.exec('set role authenticated')
assert.equal(
  (await db.query('select is_current_main_admin() as allowed')).rows[0].allowed,
  false,
  'a secondary Main Admin grant is not active before Stage 13 role switching',
)
await rejects(
  () => db.query("select grant_portal_role($1,'teacher',$2,'Secondary admin cannot grant')", [ids.student, campus]),
  /Main administrator access required/,
)
await as('')
await rejects(() => pay(1), /Administrator/)
await db.close()
console.log(
  'PASS: migrations, atomic payments/retries/rollback, class and subject scope, role membership isolation/grants/revocation/provisioning, teacher profile/record/RPC scope, guardian access, private records and teacher login.',
)
