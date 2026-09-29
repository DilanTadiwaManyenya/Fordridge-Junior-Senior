import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '../.portal-test-tools/node_modules/@electric-sql/pglite/dist/index.js'
import { canEnterPortal } from '../src/portal/workflow.js'

const db = new PGlite()
await db.exec(`create role authenticated; create role anon; create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;`)
for (const file of (await readdir('supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort())
  await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
const ids = ['admin', 'student', 'parent', 'stranger', 'teacher'].reduce(
  (all, name, i) => ({
    ...all,
    [name]: `00000000-0000-4000-8000-00000000000${i + 1}`,
  }),
  {},
)
for (const [name, id] of Object.entries(ids)) {
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,$2)',
    [id, JSON.stringify({ full_name: name })],
  )
  await db.query(
    "update public.profiles set role=$1::app_role,campus_id=(select id from campuses where code='junior'),class_level='Form 1' where id=$2",
    [name === 'stranger' ? 'student' : name, id],
  )
}
await db.query('insert into student_guardians values($1,$2)', [
  ids.student,
  ids.parent,
])
const campus = (await db.query("select id from campuses where code='junior'"))
  .rows[0].id
const fee = (
  await db.query(
    'insert into fee_records(campus_id,student_id,amount) values($1,$2,100) returning id',
    [campus, ids.student],
  )
).rows[0].id
async function as(name) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    ids[name] || '',
  ])
  await db.exec('set role authenticated')
}
async function rejects(fn, pattern) {
  await assert.rejects(fn, pattern)
}
await as('admin')
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
await db.query('select admin_update_profile($1,$2,$3,$4,$5,$6,$7)', [
  ids.student,
  'Updated Student',
  campus,
  'F001',
  'Form 1',
  'A',
  'active',
])
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
await as('teacher')
assert.equal(canEnterPortal('teacher', 'staff'), true)
assert.equal(canEnterPortal('student', 'staff'), false)
assert.equal(canEnterPortal('parent', 'student'), false)
await rejects(() => pay(1), /Administrator/)
await as('')
await rejects(() => pay(1), /Administrator/)
await db.close()
console.log(
  'PASS: migrations, atomic payments, retry safety, rollback, profile permissions, published notices, class scoping, guardian access, private records and teacher login.',
)
