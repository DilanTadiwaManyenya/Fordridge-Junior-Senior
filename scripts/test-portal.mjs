import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '../.portal-test-tools/node_modules/@electric-sql/pglite/dist/index.js'
import { canEnterPortal, withPortalTimeout } from '../src/portal/workflow.js'
import { buildTeacherClassScopes, canOpenTeacherMyClass } from '../src/portal/teacher-workspace.js'
import { canReviewIncomeExpenses, getFinanceNavigation } from '../src/portal/navigation.js'
import { referenceBandsFor } from '../src/portal/grade-band-rules.js'
import { learningFileDetails, matchesLearningFileReservation, needsAbandonedUploadReview } from '../src/portal/learning-library-file-workflow.js'
import {
  buildIncomeExpenseCsv,
  buildIncomeExpenseEntries,
  filterIncomeExpenseEntries,
  summarizeIncomeExpenseEntries,
} from '../src/portal/income-expense-review.js'

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
  ['Finance', 'Income & expenses', 'Expenses & Cashbook', 'Inventory & POS', 'External Inventory & POS'],
  'Main Admin receives native stock receipts while retaining a separately labeled external POS link',
)
assert.deepEqual(
  getFinanceNavigation('staff').items.map((item) => item.label),
  ['External Inventory & POS'],
  'ordinary Staff do not see finance ledgers or cashbook',
)
assert.deepEqual(
  getFinanceNavigation('teacher').items,
  [],
  'teachers do not see finance navigation they are not authorized to use',
)
assert.equal(canReviewIncomeExpenses('admin'), true)
assert.equal(canReviewIncomeExpenses('principal'), false)
assert.equal(canReviewIncomeExpenses('accountant'), false)

const financeEntries = buildIncomeExpenseEntries({
  payments: [
    { id: 'payment-usd', fee_record_id: 'fee-usd', campus_id: 'junior', amount: 80, reference: 'R-1', created_at: '2026-10-28T22:30:00Z' },
    { id: 'payment-zig', fee_record_id: 'fee-zig', campus_id: 'senior', amount: 100, created_at: '2026-10-29T09:00:00Z' },
  ],
  feeRecords: [
    { id: 'fee-usd', campus_id: 'junior', currency: 'USD', academic_year: 2026, academic_term: 'Term 3' },
    { id: 'fee-zig', campus_id: 'senior', currency: 'ZiG', academic_year: 2026, academic_term: 'Term 3' },
  ],
  expenses: [
    { id: 'expense-fuel', expense_date: '2026-10-29', category: 'Fuel', description: 'Bus fuel', amount: 20, currency: 'USD', reference: 'INV-1', review_status: 'approved' },
    { id: 'expense-legacy', expense_date: '2026-10-27', category: '=1+1', description: 'Historic row', amount: 5, currency: 'USD' },
    { id: 'expense-pending', expense_date: '2026-10-28', category: 'Food', description: 'Lunch', amount: 4, currency: 'USD', review_status: 'pending' },
    { id: 'expense-rejected', expense_date: '2026-10-26', category: 'Other', description: 'Rejected', amount: 2, currency: 'USD', review_status: 'rejected' },
    { id: 'expense-reversed', expense_date: '2026-10-25', category: 'Repairs', description: 'Reversed', amount: 1, currency: 'USD', review_status: 'reversed' },
  ],
  campuses: [
    { id: 'junior', name: 'Junior School', code: 'JNR' },
    { id: 'senior', name: 'Senior School', code: 'SNR' },
  ],
})
assert.equal(financeEntries.length, 7)
assert.equal(financeEntries.find((entry) => entry.sourceId === 'payment-usd').date, '2026-10-29', 'transaction timestamps use the school-local date')
assert.equal(financeEntries.find((entry) => entry.sourceId === 'expense-fuel').campusId, null, 'legacy expenses are not attributed to a campus')
assert.equal(financeEntries.find((entry) => entry.sourceId === 'expense-legacy').categoryNeedsReview, true, 'unmapped legacy category text remains visible and is flagged')
assert.deepEqual(
  summarizeIncomeExpenseEntries(financeEntries),
  {
    USD: { currency: 'USD', income: 80, expenses: 20, pendingExpenses: 4, legacyUnreviewedExpenses: 5, rejectedExpenses: 2, reversedExpenses: 1, net: 60 },
    ZiG: { currency: 'ZiG', income: 100, expenses: 0, pendingExpenses: 0, legacyUnreviewedExpenses: 0, rejectedExpenses: 0, reversedExpenses: 0, net: 100 },
  },
  'only approved expenses reduce net totals; pending, legacy, rejected and reversed amounts remain separately visible by currency',
)
const filteredFinanceRows = filterIncomeExpenseEntries(financeEntries, { currency: 'USD', direction: 'expense', category: 'Fuel', campusId: 'unassigned' })
assert.deepEqual(filteredFinanceRows.map((entry) => entry.sourceId), ['expense-fuel'], 'filters include unassigned expenses and preserve the active currency/type/category')
const filteredFinanceCsv = buildIncomeExpenseCsv(filteredFinanceRows)
assert.match(filteredFinanceCsv, /"USD","0","20","0","0","0","0","-20"/, 'CSV totals match the filtered rows and approved-only expense basis')
assert.match(buildIncomeExpenseCsv(financeEntries), /"'=1\+1"/, 'CSV protects legacy text from spreadsheet formulas')

assert.equal(canOpenTeacherMyClass('teacher', true), true)
assert.equal(canOpenTeacherMyClass('teacher', false), false)
assert.equal(canOpenTeacherMyClass('admin', true), false)

assert.deepEqual(learningFileDetails({ name: 'lesson.pdf', size: 1024, type: 'application/pdf' }), {
  extension: 'pdf', mimeType: 'application/pdf',
}, 'learning-library upload validation accepts the approved PDF type')
assert.throws(() => learningFileDetails({ name: 'lesson.svg', size: 1024, type: 'image/svg+xml' }), /up to 10 MiB/,
  'unsupported file formats are rejected before a reservation is created')
assert.throws(() => learningFileDetails({ name: 'lesson.pdf', size: 1024, type: 'image/png' }), /do not match/,
  'a filename and browser MIME mismatch cannot resume a saved reservation')
const learningReservation = {
  original_name: 'lesson.pdf', size_bytes: 1024, extension: 'pdf', mime_type: 'application/pdf',
}
assert.equal(matchesLearningFileReservation({ name: 'lesson.pdf', size: 1024, type: 'application/pdf' }, learningReservation), true)
assert.equal(matchesLearningFileReservation({ name: 'other.pdf', size: 1024, type: 'application/pdf' }, learningReservation), false,
  'resume requires the saved filename, size, and type')
const reviewClock = Date.parse('2026-10-29T00:00:00Z')
assert.equal(needsAbandonedUploadReview({ ready: false, created_at: '2026-10-22T00:00:00Z' }, reviewClock), true,
  'an incomplete reservation enters the review queue at seven days without automatic deletion')
assert.equal(needsAbandonedUploadReview({ ready: false, created_at: '2026-10-28T00:00:00Z' }, reviewClock), false)
assert.equal(needsAbandonedUploadReview({ ready: true, created_at: '2026-10-01T00:00:00Z' }, reviewClock), false,
  'finalized files are never treated as abandoned upload reservations')

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
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text not null,name text not null,metadata jsonb not null default '{}'::jsonb,primary key(bucket_id,name));
alter table storage.objects enable row level security;
create policy "synthetic legacy storage policy" on storage.objects for all to authenticated using(true) with check(true);
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
const unrelatedFee = (
  await db.query(
    'insert into fee_records(campus_id,student_id,amount) values($1,$2,35) returning id',
    [campus, ids.stranger],
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
const cashbookExpensePayload = {
  expense_date: '2026-10-29', category: 'Fuel', description: 'School bus fuel',
  amount: 20, currency: 'USD', reference: 'FUEL-001',
}
const expenseSubmitRequest = '61000000-0000-4000-8000-000000000001'
const submittedExpense = (await db.query(
  'select * from submit_cashbook_expense($1,$2::jsonb)',
  [expenseSubmitRequest, JSON.stringify(cashbookExpensePayload)],
)).rows[0]
assert.equal(submittedExpense.review_status, 'pending')
assert.equal(submittedExpense.recorded_by, ids.admin)
assert.equal(
  (await db.query("select * from submit_cashbook_expense($1,$2::jsonb)", [expenseSubmitRequest, JSON.stringify(cashbookExpensePayload)])).rows[0].id,
  submittedExpense.id,
  'expense submission retry returns the original pending expense',
)
await rejects(
  () => db.query("select * from submit_cashbook_expense($1,$2::jsonb)", [expenseSubmitRequest, JSON.stringify({ ...cashbookExpensePayload, amount: 25 })]),
  /already used/,
)
await rejects(
  () => db.query("select * from submit_cashbook_expense('61000000-0000-4000-8000-000000000009',$1::jsonb)", [JSON.stringify({ ...cashbookExpensePayload, category: 'Unapproved category' })]),
  /recognized expense category/,
)
await rejects(
  () => db.query("select review_cashbook_expense($1,'61000000-0000-4000-8000-000000000010','approved','no')", [submittedExpense.id]),
  /review reason/,
)
const reviewRequestId = '61000000-0000-4000-8000-000000000002'
const approvedExpense = (await db.query(
  "select * from review_cashbook_expense($1,$2,'approved','Receipt and amount checked')",
  [submittedExpense.id, reviewRequestId],
)).rows[0]
assert.equal(approvedExpense.review_status, 'approved')
assert.equal(approvedExpense.reviewed_by, ids.admin)
assert.equal(
  (await db.query("select * from review_cashbook_expense($1,$2,'approved','Receipt and amount checked')", [submittedExpense.id, reviewRequestId])).rows[0].id,
  submittedExpense.id,
  'repeating a confirmed review request returns the same approved expense',
)
await rejects(
  () => db.query("select review_cashbook_expense($1,$2,'rejected','Different decision')", [submittedExpense.id, reviewRequestId]),
  /already used/,
)
const correctionPayload = { ...cashbookExpensePayload, category: 'Repairs', description: 'Corrected bus repair entry', amount: 18, reference: 'REPAIR-001' }
const correctionRequestId = '61000000-0000-4000-8000-000000000003'
const correctionResult = (await db.query(
  'select correct_cashbook_expense($1,$2,$3::jsonb,$4) as result',
  [submittedExpense.id, correctionRequestId, JSON.stringify(correctionPayload), 'Corrected after checking the supplier invoice'],
)).rows[0].result
assert.equal(correctionResult.original.review_status, 'reversed')
assert.equal(correctionResult.original.reversal_reason, 'Corrected after checking the supplier invoice')
assert.equal(correctionResult.replacement.review_status, 'pending')
assert.equal(correctionResult.replacement.correction_of, submittedExpense.id)
assert.equal(Number(correctionResult.replacement.amount), 18)
const retriedCorrection = (await db.query(
  'select correct_cashbook_expense($1,$2,$3::jsonb,$4) as result',
  [submittedExpense.id, correctionRequestId, JSON.stringify(correctionPayload), 'Corrected after checking the supplier invoice'],
)).rows[0].result
assert.equal(retriedCorrection.replacement.id, correctionResult.replacement.id, 'correction retry returns the original replacement without duplicating it')
assert.equal(Number((await db.query('select count(*) from cashbook_expenses where correction_of=$1', [submittedExpense.id])).rows[0].count), 1)
assert.equal(Number((await db.query("select count(*) from cashbook_expense_events where action in ('submitted','approved','reversed_for_correction','correction_submitted') and expense_id in ($1,$2)", [submittedExpense.id, correctionResult.replacement.id])).rows[0].count), 4)
await db.exec('reset role')
const legacyExpenseId = (await db.query(
  "insert into cashbook_expenses(expense_date,category,description,amount,recorded_by) values('2026-09-01','Transport','Legacy entry',12,$1) returning id",
  [ids.admin],
)).rows[0].id
await as('admin')
await rejects(
  () => db.query("select reverse_cashbook_expense($1,'61000000-0000-4000-8000-000000000011','no')", [legacyExpenseId]),
  /reversal reason/,
)
const reversalRequestId = '61000000-0000-4000-8000-000000000004'
const reversedExpense = (await db.query(
  'select * from reverse_cashbook_expense($1,$2,$3)',
  [legacyExpenseId, reversalRequestId, 'Duplicate legacy entry; retained for audit'],
)).rows[0]
assert.equal(reversedExpense.review_status, 'reversed')
assert.equal(reversedExpense.reversal_reason, 'Duplicate legacy entry; retained for audit')
assert.equal((await db.query('select * from reverse_cashbook_expense($1,$2,$3)', [legacyExpenseId, reversalRequestId, 'Duplicate legacy entry; retained for audit'])).rows[0].id, legacyExpenseId)
await rejects(
  () => db.query("update cashbook_expenses set amount=1 where id=$1", [legacyExpenseId]),
  /permission denied/,
)
await rejects(
  () => db.query("delete from cashbook_expenses where id=$1", [legacyExpenseId]),
  /permission denied/,
)
await rejects(
  () => db.query("insert into cashbook_expense_events(expense_id,actor_id,action,after_state) values($1,$2,'submitted','{}'::jsonb)", [legacyExpenseId, ids.admin]),
  /permission denied/,
)
await rejects(
  () => db.query('select * from cashbook_expense_requests'),
  /permission denied/,
)
await as('teacher')
await rejects(
  () => db.query("insert into cashbook_expenses(expense_date,category,description,amount) values(current_date,'Fuel','direct write',1)"),
  /permission denied/,
)
await as('admin')
const simpleProductRequest = '65000000-0000-4000-8000-000000000001'
const simpleProduct = (await db.query(
  'select * from create_inventory_product($1,$2,$3,$4,$5,$6)',
  [simpleProductRequest, 'Test exercise book', 'TEST-BOOK-1', 'Stationery', 'each', false],
)).rows[0]
assert.equal(simpleProduct.created_by, ids.admin)
assert.equal(simpleProduct.stock_unit, 'each')
assert.equal(simpleProduct.tracks_variants, false)
assert.equal(simpleProduct.unit_price, null, 'new products have no assumed selling price')
assert.equal(
  (await db.query('select * from create_inventory_product($1,$2,$3,$4,$5,$6)', [simpleProductRequest, 'Test exercise book', 'TEST-BOOK-1', 'Stationery', 'each', false])).rows[0].id,
  simpleProduct.id,
  'retrying product creation with the same request returns one product',
)
await rejects(
  () => db.query('select * from create_inventory_product($1,$2,$3,$4,$5,$6)', [simpleProductRequest, 'Different product', null, null, 'each', false]),
  /already used/,
)
const variantProduct = (await db.query(
  'select * from create_inventory_product($1,$2,$3,$4,$5,$6)',
  ['65000000-0000-4000-8000-000000000002', 'Test school shirt', null, 'Uniforms', 'each', true],
)).rows[0]
const shirtVariant = (await db.query(
  'select * from add_inventory_product_variant($1,$2,$3,$4)',
  ['65000000-0000-4000-8000-000000000003', variantProduct.id, 'Size 10', 'TEST-SHIRT-10'],
)).rows[0]
assert.equal(shirtVariant.product_id, variantProduct.id)
assert.equal(
  (await db.query('select * from add_inventory_product_variant($1,$2,$3,$4)', ['65000000-0000-4000-8000-000000000003', variantProduct.id, 'Size 10', 'TEST-SHIRT-10'])).rows[0].id,
  shirtVariant.id,
  'retrying variant creation with the same request returns one variant',
)
await rejects(
  () => db.query('select * from add_inventory_product_variant($1,$2,$3,$4)', ['65000000-0000-4000-8000-000000000004', simpleProduct.id, 'Size 10', null]),
  /one stock balance/,
)
const receiptItems = [
  { product_id: simpleProduct.id, variant_id: null, quantity: '12', unit_cost: '0.50', cost_currency: 'USD' },
  { product_id: variantProduct.id, variant_id: shirtVariant.id, quantity: '6', unit_cost: '8.25', cost_currency: 'USD' },
]
const receiptRequest = '65000000-0000-4000-8000-000000000005'
await rejects(
  () => db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb)', [receiptRequest, 'supplier_delivery', 'Uniform supplier', null, null, JSON.stringify([{ ...receiptItems[0], quantity: '0' }])]),
  /valid product, positive whole quantity/,
)
await rejects(
  () => db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb)', [receiptRequest, 'supplier_delivery', 'Uniform supplier', null, null, JSON.stringify([{ ...receiptItems[0], unit_cost: null, cost_currency: null }])]),
  /known supplier unit cost/,
)
await rejects(
  () => db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb)', ['65000000-0000-4000-8000-000000000008', 'opening_stock', null, null, null, JSON.stringify(receiptItems)]),
  /reason for opening stock/,
)
const receiptId = (await db.query(
  'select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb) as id',
  [receiptRequest, 'supplier_delivery', 'School supplier', 'INV-TEST-1', 'Stage 65 test receipt', JSON.stringify(receiptItems)],
)).rows[0].id
assert.equal((await db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb) as id', [receiptRequest, 'supplier_delivery', 'School supplier', 'INV-TEST-1', 'Stage 65 test receipt', JSON.stringify(receiptItems)])).rows[0].id, receiptId, 'receipt retries do not add stock a second time')
await rejects(
  () => db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb)', [receiptRequest, 'supplier_delivery', 'Different supplier', 'INV-TEST-1', 'Stage 65 test receipt', JSON.stringify(receiptItems)]),
  /already used/,
)
const receiptLines = (await db.query('select * from inventory_stock_receipt_lines where receipt_id=$1 order by product_name_snapshot', [receiptId])).rows
assert.equal(receiptLines.length, 2)
assert.deepEqual(receiptLines.map((line) => [line.product_name_snapshot, line.variant_label_snapshot, line.stock_unit_snapshot, line.quantity_received]), [
  ['Test exercise book', null, 'each', 12],
  ['Test school shirt', 'Size 10', 'each', 6],
])
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1', [simpleProduct.id])).rows[0].sum), 12)
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1 and variant_id=$2', [variantProduct.id, shirtVariant.id])).rows[0].sum), 6)
assert.equal((await db.query("select action from audit_trail where entity_type='inventory_stock_receipt' and entity_id=$1", [receiptId])).rows[0].action, 'received')
await rejects(
  () => db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb)', ['65000000-0000-4000-8000-000000000010', 'supplier_delivery', 'School supplier', null, null, JSON.stringify([receiptItems[0], { product_id: '00000000-0000-4000-8000-000000000099', variant_id: null, quantity: '1', unit_cost: '1.00', cost_currency: 'USD' }])]),
  /selected product is unavailable/,
)
assert.equal(Number((await db.query('select count(*) from inventory_stock_receipts where request_id=$1', ['65000000-0000-4000-8000-000000000010'])).rows[0].count), 0, 'a failed multi-line receipt rolls back its header and earlier lines')
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1', [simpleProduct.id])).rows[0].sum), 12, 'a failed receipt does not partially add stock')
const openingReceiptId = (await db.query(
  'select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb) as id',
  ['65000000-0000-4000-8000-000000000006', 'opening_stock', null, null, 'Opening count verified by school inventory review', JSON.stringify([{ product_id: simpleProduct.id, variant_id: null, quantity: '5', unit_cost: null, cost_currency: null }])],
)).rows[0].id
assert.equal((await db.query('select receipt_kind from inventory_stock_receipts where id=$1', [openingReceiptId])).rows[0].receipt_kind, 'opening_stock')
assert.equal((await db.query('select unit_cost from inventory_stock_receipt_lines where receipt_id=$1', [openingReceiptId])).rows[0].unit_cost, null, 'unknown historic opening cost remains explicitly unknown')
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1', [simpleProduct.id])).rows[0].sum), 17)
await rejects(
  () => db.query('select adjust_inventory_stock($1,$2,$3,$4,$5)', ['66000000-0000-4000-8000-000000000010', simpleProduct.id, null, 0, 'No change']),
  /non-zero whole-number adjustment/,
)
await rejects(
  () => db.query('select adjust_inventory_stock($1,$2,$3,$4,$5)', ['66000000-0000-4000-8000-000000000011', simpleProduct.id, null, 1, 'bad']),
  /reason of 5 to 1000/,
)
const adjustmentRequestId = '66000000-0000-4000-8000-000000000001'
const stockIncrease = (await db.query('select adjust_inventory_stock($1,$2,$3,$4,$5) as result', [adjustmentRequestId, simpleProduct.id, null, 3, 'Physical count found three extra units'])).rows[0].result
assert.equal(Number(stockIncrease.quantity_before), 17)
assert.equal(Number(stockIncrease.quantity_delta), 3)
assert.equal(Number(stockIncrease.quantity_after), 20)
assert.equal((await db.query('select adjust_inventory_stock($1,$2,$3,$4,$5) as result', [adjustmentRequestId, simpleProduct.id, null, 3, 'Physical count found three extra units'])).rows[0].result.id, stockIncrease.id, 'retrying the same adjustment returns its original result without changing stock twice')
await rejects(
  () => db.query('select adjust_inventory_stock($1,$2,$3,$4,$5)', [adjustmentRequestId, simpleProduct.id, null, 2, 'Different adjustment']),
  /already used/,
)
const stockDecrease = (await db.query('select adjust_inventory_stock($1,$2,$3,$4,$5) as result', ['66000000-0000-4000-8000-000000000002', simpleProduct.id, null, -5, 'Counted damaged units and removed them'])).rows[0].result
assert.equal(Number(stockDecrease.quantity_before), 20)
assert.equal(Number(stockDecrease.quantity_after), 15)
await rejects(
  () => db.query('select adjust_inventory_stock($1,$2,$3,$4,$5)', ['66000000-0000-4000-8000-000000000003', simpleProduct.id, null, -99, 'Would reduce stock below zero']),
  /would make stock negative/,
)
const variantAdjustment = (await db.query('select adjust_inventory_stock($1,$2,$3,$4,$5) as result', ['66000000-0000-4000-8000-000000000004', variantProduct.id, shirtVariant.id, -2, 'Two damaged shirts removed after inspection'])).rows[0].result
assert.equal(Number(variantAdjustment.quantity_before), 6)
assert.equal(Number(variantAdjustment.quantity_after), 4)
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1', [simpleProduct.id])).rows[0].sum), 15)
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1 and variant_id=$2', [variantProduct.id, shirtVariant.id])).rows[0].sum), 4)
assert.equal(Number((await db.query("select count(*) from audit_trail where entity_type='inventory_stock_adjustment' and entity_id in (select id from inventory_stock_adjustments)")).rows[0].count), 3)
const productPriceRequest = '67000000-0000-4000-8000-000000000001'
await db.query('select set_inventory_product_price($1,$2,$3,$4)', [productPriceRequest, simpleProduct.id, 1.25, 'USD'])
assert.equal(Number((await db.query('select unit_price from inventory_products where id=$1', [simpleProduct.id])).rows[0].unit_price), 1.25)
await db.query('select set_inventory_product_price($1,$2,$3,$4)', [productPriceRequest, simpleProduct.id, 1.25, 'USD'])
assert.equal((await db.query('select price_currency from inventory_products where id=$1', [simpleProduct.id])).rows[0].price_currency, 'USD', 'price configuration retries return the same product')
await rejects(
  () => db.query('select set_inventory_product_price($1,$2,$3,$4)', [productPriceRequest, simpleProduct.id, 2.00, 'USD']),
  /already used/,
)
await rejects(
  () => db.query('select set_inventory_product_price($1,$2,$3,$4)', ['67000000-0000-4000-8000-000000000002', simpleProduct.id, 0, 'USD']),
  /positive price/,
)
await rejects(
  () => db.query('select set_inventory_product_price($1,$2,$3,$4)', ['67000000-0000-4000-8000-000000000012', simpleProduct.id, 1.234, 'USD']),
  /positive price/,
)
await db.query('select set_inventory_product_price($1,$2,$3,$4)', ['67000000-0000-4000-8000-000000000003', variantProduct.id, 20, 'USD'])
const saleLines = [
  { product_id: simpleProduct.id, variant_id: null, quantity: 2 },
  { product_id: variantProduct.id, variant_id: shirtVariant.id, quantity: 1 },
]
const saleRequest = '67000000-0000-4000-8000-000000000004'
const saleResult = (await db.query('select record_inventory_sale($1,$2::jsonb,$3) as result', [saleRequest, JSON.stringify(saleLines), 'Cash reported by operator'])).rows[0].result
assert.equal(Number(saleResult.total), 22.5)
assert.equal(saleResult.currency, 'USD')
assert.equal(saleResult.lines.length, 2)
assert.equal((await db.query('select record_inventory_sale($1,$2::jsonb,$3) as result', [saleRequest, JSON.stringify(saleLines), 'Cash reported by operator'])).rows[0].result.id, saleResult.id, 'checkout retries return the original receipt without double-deducting stock')
await rejects(
  () => db.query('select record_inventory_sale($1,$2::jsonb,$3)', [saleRequest, JSON.stringify([{ ...saleLines[0], quantity: 3 }]), 'Cash reported by operator']),
  /already used/,
)
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1', [simpleProduct.id])).rows[0].sum), 13)
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1 and variant_id=$2', [variantProduct.id, shirtVariant.id])).rows[0].sum), 3)
const saleRow = (await db.query('select * from inventory_sales where id=$1', [saleResult.id])).rows[0]
assert.equal(Number(saleRow.total), 22.5)
assert.deepEqual((await db.query('select amount,currency,reported_method from inventory_sale_payments where sale_id=$1', [saleResult.id])).rows[0], { amount: '22.50', currency: 'USD', reported_method: 'Cash reported by operator' })
assert.deepEqual((await db.query('select product_name_snapshot,variant_label_snapshot,stock_unit_snapshot,quantity,unit_price,line_total from inventory_sale_lines where sale_id=$1 order by product_name_snapshot', [saleResult.id])).rows.map((line) => [line.product_name_snapshot, line.variant_label_snapshot, line.stock_unit_snapshot, line.quantity, line.unit_price, line.line_total]), [
  ['Test exercise book', null, 'each', 2, '1.25', '2.50'],
  ['Test school shirt', 'Size 10', 'each', 1, '20.00', '20.00'],
])
const saleLineIds = (await db.query('select id,product_id from inventory_sale_lines where sale_id=$1', [saleResult.id])).rows
const bookSaleLineId = saleLineIds.find((line) => line.product_id === simpleProduct.id).id
const shirtSaleLineId = saleLineIds.find((line) => line.product_id === variantProduct.id).id
const firstReturnItems = [{ sale_line_id: bookSaleLineId, quantity: 1, restock: true }]
const firstReturnRequest = '68000000-0000-4000-8000-000000000001'
const firstReturn = (await db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5) as result', [firstReturnRequest, saleResult.id, JSON.stringify(firstReturnItems), 'One unopened book returned to stock', 'Cash reported by operator'])).rows[0].result
assert.equal(Number(firstReturn.refund_total), 1.25)
assert.equal(firstReturn.lines[0].restocked, true)
assert.equal((await db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5) as result', [firstReturnRequest, saleResult.id, JSON.stringify(firstReturnItems), 'One unopened book returned to stock', 'Cash reported by operator'])).rows[0].result.id, firstReturn.id, 'return retry reuses one refund and one stock restoration')
await rejects(
  () => db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5)', [firstReturnRequest, saleResult.id, JSON.stringify([{ ...firstReturnItems[0], restock: false }]), 'Changed return request', 'Cash reported by operator']),
  /already used/,
)
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1', [simpleProduct.id])).rows[0].sum), 14)
const secondReturnItems = [{ sale_line_id: bookSaleLineId, quantity: 1, restock: false }]
await db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5)', ['68000000-0000-4000-8000-000000000002', saleResult.id, JSON.stringify(secondReturnItems), 'Second book was damaged and not restockable', 'Cash reported by operator'])
await rejects(
  () => db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5)', ['68000000-0000-4000-8000-000000000003', saleResult.id, JSON.stringify(secondReturnItems), 'Attempt to return more books than sold', 'Cash']),
  /exceeds the remaining sold quantity/,
)
const shirtReturnItems = [{ sale_line_id: shirtSaleLineId, quantity: 1, restock: true }]
await db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5)', ['68000000-0000-4000-8000-000000000004', saleResult.id, JSON.stringify(shirtReturnItems), 'Size was exchanged and item is saleable', 'Bank transfer reported by operator'])
assert.equal(Number((await db.query('select sum(amount) from inventory_sale_refunds')).rows[0].sum), 22.5, 'refund total reconciles exactly to the returned sold quantities')
assert.equal(Number((await db.query('select sum(quantity_delta) from inventory_stock_movements where product_id=$1 and variant_id=$2', [variantProduct.id, shirtVariant.id])).rows[0].sum), 4, 'only the return explicitly marked for restocking restores inventory')
assert.equal(Number((await db.query('select sum(quantity) from inventory_sale_return_lines where sale_line_id=$1 and restocked=false', [bookSaleLineId])).rows[0].sum), 1)
assert.equal(Number((await db.query("select count(*) from audit_trail where entity_type='inventory_sale_return' and action='returned'")).rows[0].count), 3)
await rejects(
  () => db.query('select record_inventory_sale($1,$2::jsonb,$3)', ['67000000-0000-4000-8000-000000000005', JSON.stringify([{ ...saleLines[0], quantity: 999 }]), 'Cash']),
  /Not enough stock/,
)
await rejects(
  () => db.query('select record_inventory_sale($1,$2::jsonb,$3)', ['67000000-0000-4000-8000-000000000006', JSON.stringify([saleLines[0], saleLines[0]]), 'Cash']),
  /duplicate product and variant lines/,
)
await db.query('select set_inventory_product_price($1,$2,$3,$4)', ['67000000-0000-4000-8000-000000000008', variantProduct.id, 20, 'ZiG'])
await rejects(
  () => db.query('select record_inventory_sale($1,$2::jsonb,$3)', ['67000000-0000-4000-8000-000000000009', JSON.stringify(saleLines), 'Cash']),
  /cannot mix currencies/,
)
assert.equal(Number((await db.query('select count(*) from inventory_sales')).rows[0].count), 1, 'failed checkout attempts leave no partial sale or payment rows')
assert.equal((await db.query("select action from audit_trail where entity_type='inventory_sale' and entity_id=$1", [saleResult.id])).rows[0].action, 'checked_out')
await rejects(
  () => db.query('update inventory_stock_movements set quantity_delta=0 where receipt_line_id=$1', [receiptLines[0].id]),
  /permission denied/,
)
await rejects(
  () => db.query('update inventory_stock_adjustments set reason=$2 where id=$1', [stockIncrease.id, 'Forged correction reason']),
  /permission denied/,
)
await rejects(
  () => db.query('delete from inventory_sales where id=$1', [saleResult.id]),
  /permission denied/,
)
await rejects(
  () => db.query('delete from inventory_sale_returns where id=$1', [firstReturn.id]),
  /permission denied/,
)
await rejects(
  () => db.query('delete from inventory_sale_refunds where return_id=$1', [firstReturn.id]),
  /permission denied/,
)
await rejects(
  () => db.query('update inventory_products set unit_price=0 where id=$1', [simpleProduct.id]),
  /permission denied/,
)
await rejects(
  () => db.query("insert into inventory_stock_movements(product_id,movement_type,quantity_delta,receipt_line_id,actor_id,reason) values($1,'receipt',1,$2,$3,'direct write')", [simpleProduct.id, receiptLines[0].id, ids.admin]),
  /permission denied/,
)
await rejects(
  () => db.query('update inventory_products set name=$2 where id=$1', [simpleProduct.id, 'Forged product name']),
  /permission denied/,
)
await as('teacher')
await rejects(
  () => db.query('select record_inventory_sale_return($1,$2,$3::jsonb,$4,$5)', ['68000000-0000-4000-8000-000000000005', saleResult.id, JSON.stringify(firstReturnItems), 'Unauthorized return', 'Cash']),
  /Main Admin access required/,
)
assert.equal(Number((await db.query('select count(*) from inventory_sale_returns')).rows[0].count), 0, 'other roles cannot read return and refund history')
await rejects(
  () => db.query('select record_inventory_sale($1,$2::jsonb,$3)', ['67000000-0000-4000-8000-000000000010', JSON.stringify(saleLines), 'Cash']),
  /Main Admin access required/,
)
await rejects(
  () => db.query('select set_inventory_product_price($1,$2,$3,$4)', ['67000000-0000-4000-8000-000000000011', simpleProduct.id, 1, 'USD']),
  /Main Admin access required/,
)
assert.equal(Number((await db.query('select count(*) from inventory_sales')).rows[0].count), 0, 'other roles cannot read sale/payment history')
await rejects(
  () => db.query('select adjust_inventory_stock($1,$2,$3,$4,$5)', ['66000000-0000-4000-8000-000000000005', simpleProduct.id, null, 1, 'Unauthorized adjustment']),
  /Main Admin access required/,
)
assert.equal(Number((await db.query('select count(*) from inventory_stock_adjustments')).rows[0].count), 0, 'non-admin roles cannot read stock adjustment history')
await rejects(
  () => db.query('select record_inventory_stock_receipt($1,$2,$3,$4,$5,$6::jsonb)', ['65000000-0000-4000-8000-000000000009', 'supplier_delivery', 'No access', null, null, JSON.stringify(receiptItems)]),
  /Main Admin access required/,
)
await rejects(
  () => db.query('select * from create_inventory_product($1,$2,$3,$4,$5,$6)', ['65000000-0000-4000-8000-000000000007', 'Unauthorized', null, null, 'each', false]),
  /Main Admin access required/,
)
assert.equal(Number((await db.query('select count(*) from inventory_stock_receipts')).rows[0].count), 0, 'other roles cannot read Main Admin stock receipts')
await as('admin')
assert.deepEqual(
  (await db.query("select band_group,count(*)::integer as count from report_grade_bands where campus_id is null group by band_group order by band_group")).rows,
  [{ band_group: 'alevel', count: 7 }, { band_group: 'olevel', count: 5 }, { band_group: 'primary', count: 9 }],
  'the temporary Reliance reference scales are seeded as complete global level groups',
)
assert.deepEqual(
  (await db.query("select report_grade_band_group('ECD A') as junior, report_grade_band_group('Form 4') as olevel, report_grade_band_group('Lower Six') as alevel")).rows[0],
  { junior: 'primary', olevel: 'olevel', alevel: 'alevel' },
  'class levels map to the Junior, O Level and A Level grading groups',
)
assert.deepEqual(
  (await db.query("select report_grade_for_class_percent($1,'Grade 4',84.99) as junior_below, report_grade_for_class_percent($1,'Form 4',74.99) as olevel_below, report_grade_for_class_percent($1,'Upper Six',79.99) as alevel_below", [campus])).rows[0],
  { junior_below: 'Unit 2', olevel_below: 'B', alevel_below: 'B' },
  'database report grading floors fractional averages at each Reliance minimum threshold',
)
const globalPrimaryUpdatedAt = (await db.query("select max(updated_at) as value from report_grade_bands where campus_id is null and band_group='primary'")).rows[0].value
assert.equal(
  (await db.query("select save_report_grade_scale(null,'primary',$1::jsonb,'Review provisional Junior scale',$2) as count", [JSON.stringify(referenceBandsFor('primary')), globalPrimaryUpdatedAt])).rows[0].count,
  9,
  'Main Admin can atomically save a complete reference scale with a review reason',
)
const savedPrimaryUpdatedAt = (await db.query("select max(updated_at) as value from report_grade_bands where campus_id is null and band_group='primary'")).rows[0].value
await rejects(
  () => db.query("select save_report_grade_scale(null,'primary',$1::jsonb,'Try stale scale write',null)", [JSON.stringify(referenceBandsFor('primary'))]),
  /scale changed/,
)
const incompletePrimary = referenceBandsFor('primary').map(band => band.minimum_percent === 77
  ? { ...band, minimum_percent: 78 }
  : band)
await rejects(
  () => db.query("select save_report_grade_scale(null,'primary',$1::jsonb,'Try incomplete scale',$2)", [JSON.stringify(incompletePrimary), savedPrimaryUpdatedAt]),
  /gap or overlap/,
)
const registeredPeriodId = (await db.query(
  "select register_reporting_period($1,2026,'Term 1') as id",
  [campus],
)).rows[0].id
assert.deepEqual(
  (await db.query('select period_status,is_current,revision from reporting_periods where id=$1', [registeredPeriodId])).rows[0],
  { period_status: 'open', is_current: false, revision: 1 },
  'new reporting periods start open with an explicit revision and no current-period assignment',
)
assert.equal(
  (await db.query("select count(*) from reporting_period_events where period_id=$1 and revision=1 and action='registered'", [registeredPeriodId])).rows[0].count,
  1,
  'period registration creates its first audit event',
)
await rejects(
  () => db.query("select register_reporting_period($1,2026,'Term 1')", [campus]),
  /already registered/,
)
await as('teacher')
assert.equal((await db.query('select count(*) from reporting_periods')).rows[0].count, 1,
  'teachers can read the reporting-period status needed to prevent closed-period mark entry')
await rejects(
  () => db.query("select register_reporting_period($1,2027,'Term 1')", [campus]),
  /Administrator access required/,
)
await rejects(
  () => db.query("select review_reporting_period($1,'reopen',1,null,null,'Admin review required')", [registeredPeriodId]),
  /Administrator access required/,
)
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
const firstPayment = (await pay(40)).rows[0]
const retryPayment = (await pay(40)).rows[0]
assert.equal(
  retryPayment.id,
  firstPayment.id,
  'retry returns the original ledger transaction for its request ID',
)
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
  (await db.query("select count(*) from audit_trail where entity_type='fee_transaction'")).rows[0].count,
  1,
)
await db.query(
  "select * from record_fee_payment($1,10,'cash','Unlinked learner test payment',$2)",
  [unrelatedFee, '40000000-0000-4000-8000-000000000001'],
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
  "insert into announcements(campus_id,title,body,published_at,expires_at) values($1,'Draft','hidden',null,null),($1,'Published','visible',now(),null),($1,'Scheduled','future',now()+interval '1 day',null),($1,'Expired','old',now()-interval '2 days',now()-interval '1 day')",
  [campus],
)
const visibleNewsletterId = (await db.query("select id from announcements where title='Published'")).rows[0].id
const hiddenNewsletterId = (await db.query("select id from announcements where title='Draft'")).rows[0].id
await rejects(
  () => db.query("insert into announcements(campus_id,title,body,published_at,expires_at) values($1,'Invalid expiry','hidden',now(),now()-interval '1 second')", [campus]),
  /announcements_expiry_after_publication/,
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
await db.query(
  "insert into learner_records(student_id,kind,event_date,title,score,max_score,academic_year,academic_term) values($1,'academic',current_date,'Unlinked learner result',50,100,2026,'Term 1')",
  [ids.stranger],
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
await db.query(
  "insert into announcement_reads(announcement_id,user_id,read_at) values($1,$2,'2000-01-01T00:00:00Z')",
  [visibleNewsletterId, ids.student],
)
const serverStampedRead = (await db.query(
  'select read_at > $2::timestamptz as stamped_by_server from announcement_reads where announcement_id=$1 and user_id=$3',
  [visibleNewsletterId, '2020-01-01T00:00:00Z', ids.student],
)).rows[0]
assert.equal(serverStampedRead.stamped_by_server, true, 'newsletter acknowledgement time is assigned by the database')
const originalReadAt = (await db.query('select read_at from announcement_reads where announcement_id=$1 and user_id=$2', [visibleNewsletterId, ids.student])).rows[0].read_at
await db.query(
  "insert into announcement_reads(announcement_id,user_id,read_at) values($1,$2,'2000-01-01T00:00:00Z') on conflict(announcement_id,user_id) do nothing",
  [visibleNewsletterId, ids.student],
)
assert.equal((await db.query('select count(*) from announcement_reads where announcement_id=$1 and user_id=$2', [visibleNewsletterId, ids.student])).rows[0].count, 1,
  'a duplicate acknowledgement does not create another receipt')
assert.equal(new Date((await db.query('select read_at from announcement_reads where announcement_id=$1 and user_id=$2', [visibleNewsletterId, ids.student])).rows[0].read_at).getTime(), new Date(originalReadAt).getTime(),
  'a duplicate acknowledgement cannot rewrite the original read time')
await rejects(
  () => db.query('insert into announcement_reads(announcement_id,user_id) values($1,$2)', [hiddenNewsletterId, ids.student]),
  /row-level security|policy/i,
)
await rejects(
  () => db.query('insert into announcement_reads(announcement_id,user_id) values($1,$2)', [visibleNewsletterId, ids.parent]),
  /row-level security|policy/i,
)
assert.equal((await db.query("update announcement_reads set read_at='2000-01-01T00:00:00Z' where announcement_id=$1 and user_id=$2 returning read_at", [visibleNewsletterId, ids.student])).rows.length, 0,
  'users cannot rewrite an existing newsletter acknowledgement')
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
  'student cannot see drafts, scheduled newsletters, or expired newsletters',
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
await db.query('insert into announcement_reads(announcement_id,user_id) values($1,$2)', [visibleNewsletterId, ids.parent])
assert.equal((await db.query('select count(*) from announcement_reads where user_id=$1', [ids.parent])).rows[0].count, 1,
  'a linked parent can acknowledge a newsletter visible to their active role')
assert.equal((await db.query('select * from learner_records')).rows.length, 2)
assert.equal((await db.query('select subject from timetable')).rows.length, 1)
assert.equal(
  (await db.query('select * from profiles where id=$1', [ids.student])).rows
    .length,
  1,
)
assert.equal((await db.query('select * from profiles where id=$1', [ids.stranger])).rows.length, 0,
  'parent profile reads are limited to the explicitly linked learner')
assert.equal((await db.query('select * from learner_records where student_id=$1', [ids.stranger])).rows.length, 0,
  'a parent cannot read another learner record in the same school')
assert.equal((await db.query("select * from announcements where title='Published'")).rows.length, 1,
  'a Parent role can see a published announcement for its linked learner campus')
assert.equal((await db.query("select * from announcements where title='Expired'")).rows.length, 0,
  'parents cannot see an expired newsletter')
assert.equal((await db.query("select * from timetable where subject='Maths'")).rows.length, 1,
  'a Parent role can see the linked learner class timetable')
assert.equal((await db.query('select * from fee_records where student_id=$1', [ids.stranger])).rows.length, 0,
  'a parent cannot read another learner fee record')
assert.equal((await db.query('select * from fee_transactions where fee_record_id=$1', [unrelatedFee])).rows.length, 0,
  'a parent cannot read another learner payment transaction')
await db.query('select * from report_class_ranking($1,2026,$2)', [ids.student, 'Term 1'])
await db.query('select * from report_subject_signatories($1)', [ids.student])
await rejects(
  () => db.query('select * from report_class_ranking($1,2026,$2)', [ids.stranger, 'Term 1']),
  /Not allowed/,
)
await rejects(
  () => db.query('select * from report_subject_signatories($1)', [ids.stranger]),
  /Not allowed/,
)
const seniorCampusForParentRoleTest = (await db.query("select id from campuses where code='senior'")).rows[0].id
await as('admin')
await db.query(
  "select grant_portal_role($1,'teacher',$2,'Parent boundary role test')",
  [ids.parent, seniorCampusForParentRoleTest],
)
await as('parent')
await db.query("select switch_active_portal_role('teacher',$1)", [seniorCampusForParentRoleTest])
assert.equal((await db.query('select * from student_guardians where parent_id=$1', [ids.parent])).rows.length, 0,
  'guardian links disappear outside the active Parent role')
assert.equal((await db.query('select * from profiles where id=$1', [ids.student])).rows.length, 0,
  'linked learner profiles are not exposed through the Parent grant while another role is active')
assert.equal((await db.query('select * from learner_records where student_id=$1', [ids.student])).rows.length, 0,
  'linked learner records are unavailable when the active role is not Parent')
assert.equal((await db.query('select * from fee_records where student_id=$1', [ids.student])).rows.length, 0,
  'linked learner fees are unavailable when the active role is not Parent')
assert.equal((await db.query('select * from fee_transactions')).rows.length, 0,
  'linked learner payment history is unavailable when the active role is not Parent')
assert.equal((await db.query("select * from announcements where title='Published'")).rows.length, 0,
  'parent-linked announcements are unavailable when the active role is not Parent')
assert.equal((await db.query('select * from announcement_reads')).rows.length, 0,
  'newsletter acknowledgements disappear when their audience is no longer visible to the active role')
assert.equal((await db.query("select * from timetable where subject='Maths'")).rows.length, 0,
  'parent-linked timetable is unavailable when the active role is not Parent')
await rejects(
  () => db.query('select * from report_subject_signatories($1)', [ids.student]),
  /Not allowed/,
)
await db.query("select switch_active_portal_role('parent',$1)", [campus])
assert.equal((await db.query('select * from learner_records')).rows.length, 2,
  'switching back to Parent restores only the verified linked learner records')
await as('stranger')
assert.equal((await db.query('select * from learner_records where student_id=$1', [ids.stranger])).rows.length, 1,
  'an unlinked learner can still read their own record')
assert.equal((await db.query('select * from fee_records where student_id=$1', [ids.stranger])).rows.length, 1,
  'an unlinked learner can still read their own fee record')
await as('admin')
const formOne = (await db.query(
  "insert into school_classes(campus_id,class_level) values($1,'Form 1') returning id",
  [campus],
)).rows[0].id
const formTwo = (await db.query(
  "insert into school_classes(campus_id,class_level) values($1,'Form 2') returning id",
  [campus],
)).rows[0].id
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
const rolloverBefore = (await db.query(
  'select id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.stranger],
)).rows[0]
const rolloverPreview = (await db.query(
  'select preview_year_rollover($1,null,null,1,2) as result', [campus],
)).rows[0].result
assert.equal(rolloverPreview.total_count, 4, 'read-only rollover preview includes only learners at the selected campus')
assert.equal(rolloverPreview.page_size, 2, 'rollover preview applies a bounded page size')
assert.equal(rolloverPreview.total_pages, 2, 'rollover preview reports additional learner pages')
assert.equal(rolloverPreview.summary.ready_for_decision, 4, 'active learners with recorded campus and class are ready for review')
assert.equal(rolloverPreview.rows.length, 2, 'rollover preview returns only its requested page')
const streamSearch = (await db.query(
  'select preview_year_rollover($1,$2,null,1,25) as result', [campus, 'Stream B'],
)).rows[0].result
assert.equal(streamSearch.total_count, 1, 'rollover preview search filters by recorded learner information')
assert.equal(streamSearch.rows[0].class_stream, 'B', 'recorded stream is displayed without allocating a new stream')
assert.deepEqual((await db.query(
  'select id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.stranger],
)).rows[0], rolloverBefore, 'rollover readiness preview does not alter the roster')
await correctLearner(ids.stranger, 'Unassigned Learner', 'U001', '', '', 'active')
const incompleteLearnerPreview = (await db.query(
  'select preview_year_rollover($1,$2,null,1,25) as result', [campus, 'Unassigned Learner'],
)).rows[0].result
assert.equal(incompleteLearnerPreview.rows[0].readiness, 'needs_review', 'missing current class is flagged for review')
assert.ok(incompleteLearnerPreview.rows[0].review_reasons.includes('Class / form is not recorded.'),
  'rollover preview explains the missing class reason')
await correctLearner(ids.stranger, 'Unassigned Learner', 'U001', 'Form 2', '', 'inactive')
const inactiveLearnerPreview = (await db.query(
  'select preview_year_rollover($1,$2,null,1,25) as result', [campus, 'Unassigned Learner'],
)).rows[0].result
assert.equal(inactiveLearnerPreview.rows[0].readiness, 'not_currently_active', 'inactive learners are not included as active rollover candidates')
assert.ok(inactiveLearnerPreview.rows[0].review_reasons.some(reason => reason.includes('marked inactive')),
  'inactive learner status is explained in the preview')
await correctLearner(ids.stranger, 'Unassigned Learner', 'U001', 'Form 2', '', 'active')
await as('teacher')
await rejects(
  () => db.query('select preview_year_rollover($1,null,null,1,25)', [campus]),
  /Main administrator access required/,
)
await as('admin')
assert.equal((await db.query("select has_function_privilege('anon','public.preview_year_rollover(uuid,text,text,integer,integer)','EXECUTE') as allowed")).rows[0].allowed,
  false, 'anonymous callers cannot access the rollover readiness preview')
await db.query("update school_classes set capacity=3 where id=$1", [formOne])
await db.query("update school_class_streams set capacity=1 where id=$1", [streamA])
const destinationPreview = (await db.query(
  'select preview_year_rollover_destinations($1) as result', [campus],
)).rows[0].result
const formOneDestination = destinationPreview.find(destination => destination.id === formOne)
const formTwoDestination = destinationPreview.find(destination => destination.class_level === 'Form 2')
assert.equal(formOneDestination.current_count, 2, 'destination preview counts the active roster for each configured class')
assert.equal(formOneDestination.capacity, 3, 'destination preview returns the configured class capacity')
assert.equal(formOneDestination.streams.find(stream => stream.id === streamA).current_count, 1,
  'destination preview counts active learners in a configured stream')
assert.equal(formOneDestination.streams.find(stream => stream.id === streamA).capacity, 1,
  'destination preview preserves the configured stream capacity')
assert.equal(formOneDestination.unmatched_stream_count, 0, 'destination preview reports no unresolved stream assignments when all learners match')
assert.equal(formTwoDestination.streams.length, 0, 'destination preview does not invent streams for a class with no configured streams')
assert.equal(formTwoDestination.capacity, null, 'an unset class capacity remains unknown')
await as('teacher')
await rejects(
  () => db.query('select preview_year_rollover_destinations($1)', [campus]),
  /Main administrator access required/,
)
await as('admin')
assert.equal((await db.query("select has_function_privilege('anon','public.preview_year_rollover_destinations(uuid)','EXECUTE') as allowed")).rows[0].allowed,
  false, 'anonymous callers cannot access rollover destination counts')
const decisionProfileBefore = (await db.query(
  'select id, campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.student],
)).rows[0]
await db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  ids.student, 2026, 2027, 'promote', 'Progression approved after staff review',
  decisionProfileBefore.campus_id, decisionProfileBefore.class_level, decisionProfileBefore.class_stream, decisionProfileBefore.enrollment_status,
])
const savedDecisions = (await db.query(
  'select preview_year_rollover_decisions($1,$2,$3) as result', [[ids.student], 2026, 2027],
)).rows[0].result
assert.equal(savedDecisions.length, 1, 'reviewed rollover decision is listed for its explicit academic-year cycle')
assert.equal(savedDecisions[0].decision, 'promote', 'decision preview returns the recorded per-learner outcome')
assert.equal(savedDecisions[0].current_class_stream, decisionProfileBefore.class_stream,
  'reviewed decision preserves the current unallocated stream snapshot')
assert.deepEqual((await db.query(
  'select id, campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.student],
)).rows[0], decisionProfileBefore, 'recording a rollover decision does not change learner placement or enrolment')
await db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  ids.student, 2026, 2027, 'retain', 'Decision amended after moderation review',
  decisionProfileBefore.campus_id, decisionProfileBefore.class_level, decisionProfileBefore.class_stream, decisionProfileBefore.enrollment_status,
])
assert.equal((await db.query(
  'select preview_year_rollover_decisions($1,$2,$3) as result', [[ids.student], 2026, 2027],
)).rows[0].result[0].decision, 'retain', 'reviewed decision may be amended in place for the same cycle')
assert.equal((await db.query("select count(*)::integer as count from audit_trail where entity_type='year_rollover_decision' and entity_id=$1", [ids.student])).rows[0].count,
  2, 'recording and amending a decision produce separate audit entries')
await rejects(
  () => db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
    ids.student, 2026, 2027, 'promote', 'Stale profile should be rejected', campus, 'Old Class', null, 'active',
  ]),
  /Learner roster changed since review/,
)
await as('teacher')
assert.equal((await db.query('select count(*)::integer as count from year_rollover_decisions')).rows[0].count,
  0, 'teachers cannot read reviewed rollover decisions through direct table access')
await rejects(
  () => db.query('select preview_year_rollover_decisions($1,$2,$3)', [[ids.student], 2026, 2027]),
  /Main administrator access required/,
)
await as('admin')
await rejects(
  () => db.query('select preview_year_rollover_decisions($1,$2,$3)', [[ids.student], 2027, 2027]),
  /valid source and later destination academic year/,
)
assert.equal((await db.query("select has_function_privilege('anon','public.save_year_rollover_decision(uuid,integer,integer,text,text,uuid,text,text,text)','EXECUTE') as allowed")).rows[0].allowed,
  false, 'anonymous callers cannot record rollover decisions')
await db.query('select save_year_rollover_placement($1,$2,$3,$4,$5)', [ids.student, 2026, 2027, formOne, streamA])
const rolloverBatch = (await db.query(
  'select preview_year_rollover_batch($1,$2,$3,1,25) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(rolloverBatch.summary.active_learners, 4, 'batch preview counts the full active campus roster')
assert.equal(rolloverBatch.summary.decisions_recorded, 1, 'batch preview identifies learners with explicit decisions')
const plannedLearner = rolloverBatch.rows.find(row => row.id === ids.student)
assert.equal(plannedLearner.review_status, 'ready_for_review', 'batch preview marks a reviewed valid destination ready for final review')
assert.equal(plannedLearner.destination_class_level, 'Form 1', 'batch preview resolves the configured destination class name')
assert.equal(plannedLearner.destination_stream_name, 'A', 'batch preview resolves the configured destination stream name')
assert.equal(plannedLearner.capacity_status, 'within_capacity', 'batch preview compares the proposed roster with configured stream capacity')
assert.equal(rolloverBatch.summary.capacity_exceeded, 0, 'batch preview summarizes capacity overruns across the cycle')
assert.deepEqual((await db.query(
  'select id, campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.student],
)).rows[0], decisionProfileBefore, 'planning and previewing a batch does not move or alter the learner')
await db.query('select save_year_rollover_placement($1,$2,$3,$4,null)', [ids.student, 2026, 2027, formTwo])
const unknownCapacityBatch = (await db.query(
  'select preview_year_rollover_batch($1,$2,$3,1,25) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(unknownCapacityBatch.rows.find(row => row.id === ids.student).capacity_status, 'unknown',
  'an unset class capacity remains unknown in the batch preview')
await db.query('select save_year_rollover_placement($1,$2,$3,$4,$5)', [ids.student, 2026, 2027, formOne, streamA])
const secondDecisionProfile = (await db.query(
  'select campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.stream_student],
)).rows[0]
await db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  ids.stream_student, 2026, 2027, 'promote', 'Progression approved for next cycle',
  secondDecisionProfile.campus_id, secondDecisionProfile.class_level, secondDecisionProfile.class_stream, secondDecisionProfile.enrollment_status,
])
await db.query('select save_year_rollover_placement($1,$2,$3,$4,$5)', [ids.stream_student, 2026, 2027, formOne, streamA])
const overCapacityBatch = (await db.query(
  'select preview_year_rollover_batch($1,$2,$3,1,25) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(overCapacityBatch.summary.capacity_exceeded, 2, 'batch preview flags every proposed learner whose shared target exceeds capacity')
await rejects(
  () => db.query('select save_year_rollover_placement($1,$2,$3,$4,null)', [ids.student, 2026, 2027, formOne]),
  /Choose a configured destination stream/,
)
await as('teacher')
await rejects(
  () => db.query('select preview_year_rollover_batch($1,$2,$3,1,25)', [2026, 2027, campus]),
  /Main administrator access required/,
)
await rejects(
  () => db.query('select save_year_rollover_placement($1,$2,$3,$4,$5)', [ids.student, 2026, 2027, formOne, streamA]),
  /Main administrator access required/,
)
await as('admin')
await db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  ids.student, 2026, 2027, 'transfer', 'Family transfer approved by administration',
  decisionProfileBefore.campus_id, decisionProfileBefore.class_level, decisionProfileBefore.class_stream, decisionProfileBefore.enrollment_status,
])
assert.deepEqual((await db.query(
  'select destination_class_id, destination_stream_id from year_rollover_decisions where learner_id=$1', [ids.student],
)).rows[0], { destination_class_id: null, destination_stream_id: null },
'changing to Transfer clears an obsolete internal destination proposal')
await db.exec('begin')
async function rolloverRejectsInSavepoint(fn, pattern) {
  await db.exec('savepoint rollover_rejection_check')
  await rejects(fn, pattern)
  await db.exec('rollback to savepoint rollover_rejection_check')
  await db.exec('release savepoint rollover_rejection_check')
}
const rolloverProfileSnapshots = {}
for (const learnerId of [ids.student, ids.stream_student, ids.other_student, ids.stranger]) {
  rolloverProfileSnapshots[learnerId] = (await db.query(
    'select id, full_name, admission_number, campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [learnerId],
  )).rows[0]
}
await db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  ids.other_student, 2026, 2027, 'complete', 'Learner completed the final approved school level',
  rolloverProfileSnapshots[ids.other_student].campus_id, rolloverProfileSnapshots[ids.other_student].class_level,
  rolloverProfileSnapshots[ids.other_student].class_stream, rolloverProfileSnapshots[ids.other_student].enrollment_status,
])
await db.query('select save_year_rollover_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
  ids.stranger, 2026, 2027, 'retain', 'Retention approved after the academic review panel',
  rolloverProfileSnapshots[ids.stranger].campus_id, rolloverProfileSnapshots[ids.stranger].class_level,
  rolloverProfileSnapshots[ids.stranger].class_stream, rolloverProfileSnapshots[ids.stranger].enrollment_status,
])
await db.query('select save_year_rollover_placement($1,$2,$3,$4,null)', [ids.stream_student, 2026, 2027, formTwo])
await db.query('select save_year_rollover_placement($1,$2,$3,$4,null)', [ids.stranger, 2026, 2027, formTwo])
const readyRolloverBatch = (await db.query(
  'select preview_year_rollover_batch($1,$2,$3,1,25) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(readyRolloverBatch.summary.ready_for_review, 4, 'application preflight sees a complete reviewed batch for every active learner')
assert.equal(readyRolloverBatch.summary.capacity_exceeded, 0, 'application preflight blocks no destinations over configured capacity')
assert.ok(readyRolloverBatch.summary.capacity_unknown > 0, 'application preflight records destinations with unknown capacity')
const protectedRolloverHistory = {}
for (const learnerId of Object.keys(rolloverProfileSnapshots)) {
  protectedRolloverHistory[learnerId] = (await db.query(
    `select
      (select count(*)::integer from learner_records where student_id=$1) as records,
      (select count(*)::integer from fee_records where student_id=$1) as fees,
      (select count(*)::integer from student_guardians where student_id=$1) as guardians`, [learnerId],
  )).rows[0]
}
const preflightProfileSnapshot = (await db.query(
  'select id, full_name, admission_number, campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.student],
)).rows[0]
await rolloverRejectsInSavepoint(
  () => db.query('select apply_year_rollover_batch($1,$2,$3,$4,$5,$6)', [2026, 2027, campus, 3, 'APPLY YEAR ROLLOVER 2026 TO 2027', true]),
  /Active roster changed since preview/,
)
await rolloverRejectsInSavepoint(
  () => db.query('select apply_year_rollover_batch($1,$2,$3,$4,$5,$6)', [2026, 2027, campus, 4, 'wrong confirmation', true]),
  /exact rollover confirmation/,
)
await rolloverRejectsInSavepoint(
  () => db.query('select apply_year_rollover_batch($1,$2,$3,$4,$5,$6)', [2026, 2027, campus, 4, 'APPLY YEAR ROLLOVER 2026 TO 2027', false]),
  /capacity is unset/,
)
assert.deepEqual((await db.query(
  'select id, full_name, admission_number, campus_id, class_level, class_stream, enrollment_status from profiles where id=$1', [ids.student],
)).rows[0], preflightProfileSnapshot, 'failed rollover preflight leaves learner placement and enrolment unchanged')
await as('teacher')
await rolloverRejectsInSavepoint(
  () => db.query('select apply_year_rollover_batch($1,$2,$3,$4,$5,$6)', [2026, 2027, campus, 4, 'APPLY YEAR ROLLOVER 2026 TO 2027', true]),
  /Main administrator access required/,
)
await as('admin')
const appliedRollover = (await db.query(
  'select apply_year_rollover_batch($1,$2,$3,$4,$5,$6) as result',
  [2026, 2027, campus, 4, 'APPLY YEAR ROLLOVER 2026 TO 2027', true],
)).rows[0].result
assert.equal(appliedRollover.already_applied, false, 'the first successful execution creates the batch')
assert.equal(appliedRollover.learner_count, 4, 'one transaction applies every active learner in the campus roster')
assert.deepEqual(appliedRollover.decision_counts, { promote: 1, retain: 1, transfer: 1, complete: 1 }, 'the batch reports each applied decision type')
assert.ok(appliedRollover.capacity_unknown_count > 0, 'the run records explicitly acknowledged unknown capacity')
const afterRolloverProfiles = (await db.query(
  'select id, full_name, admission_number, campus_id, class_level, class_stream, enrollment_status from profiles where id=any($1::uuid[]) order by id',
  [Object.keys(rolloverProfileSnapshots)],
)).rows
assert.equal(afterRolloverProfiles.find(row => row.id === ids.student).enrollment_status, 'transferred', 'Transfer changes only enrolment status')
assert.equal(afterRolloverProfiles.find(row => row.id === ids.other_student).enrollment_status, 'graduated', 'Complete records the terminal learner status')
assert.equal(afterRolloverProfiles.find(row => row.id === ids.stream_student).class_level, 'Form 2', 'Promote applies only the configured destination class')
assert.equal(afterRolloverProfiles.find(row => row.id === ids.stranger).class_level, 'Form 2', 'Retain applies its explicitly reviewed placement')
for (const learnerId of Object.keys(rolloverProfileSnapshots)) {
  const after = afterRolloverProfiles.find(row => row.id === learnerId)
  assert.equal(after.id, rolloverProfileSnapshots[learnerId].id, 'rollover preserves learner identity')
  assert.equal(after.full_name, rolloverProfileSnapshots[learnerId].full_name, 'rollover preserves the learner name')
  assert.equal(after.admission_number, rolloverProfileSnapshots[learnerId].admission_number, 'rollover preserves admission number')
  assert.deepEqual((await db.query(
    `select
      (select count(*)::integer from learner_records where student_id=$1) as records,
      (select count(*)::integer from fee_records where student_id=$1) as fees,
      (select count(*)::integer from student_guardians where student_id=$1) as guardians`, [learnerId],
  )).rows[0], protectedRolloverHistory[learnerId], 'rollover preserves linked marks/records, fee history and guardian links')
}
assert.equal((await db.query(
  "select count(*)::integer as count from audit_trail where entity_type='year_rollover' and action='applied'",
)).rows[0].count, 4, 'each changed learner has an audit event')
assert.equal((await db.query(
  "select count(*)::integer as count from audit_trail where entity_type='year_rollover_batch' and action='applied'",
)).rows[0].count, 1, 'the batch has a single summary audit event')
await db.exec('reset role')
await rolloverRejectsInSavepoint(
  () => db.query('update year_rollover_decisions set reason=reason || $2 where learner_id=$1', [ids.student, ' amended']),
  /decision was applied and is locked/,
)
await db.exec('set role authenticated')
const statusAfterRollover = (await db.query(
  'select year_rollover_batch_run_status($1,$2,$3) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(statusAfterRollover.status, 'applied', 'the applied batch can be verified by cycle and campus')
const reversalPreview = (await db.query(
  'select preview_year_rollover_batch_reversal($1,$2,$3) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(reversalPreview.can_reverse, true, 'an unchanged applied batch is eligible for reversal')
assert.equal(reversalPreview.eligible_count, 4, 'reversal preview checks every learner in the applied batch')
assert.equal(reversalPreview.blocked_count, 0, 'the initial reversal preview has no changed learner placements')
await as('teacher')
await rolloverRejectsInSavepoint(
  () => db.query('select preview_year_rollover_batch_reversal($1,$2,$3)', [2026, 2027, campus]),
  /Main administrator access required/,
)
await as('admin')
await rolloverRejectsInSavepoint(
  () => db.query('select reverse_year_rollover_batch($1,$2,$3,$4,$5,$6)',
    [2026, 2027, campus, 4, 'short', 'REVERSE YEAR ROLLOVER 2026 TO 2027']),
  /reversal reason between 10 and 500 characters/,
)
await rolloverRejectsInSavepoint(
  () => db.query('select reverse_year_rollover_batch($1,$2,$3,$4,$5,$6)',
    [2026, 2027, campus, 4, 'Approved correction after review', 'wrong confirmation']),
  /exact reversal confirmation/,
)
await db.exec('reset role')
await db.query('update profiles set class_level=$2 where id=$1', [ids.stranger, 'Form 9'])
await db.exec('set role authenticated')
const changedReversalPreview = (await db.query(
  'select preview_year_rollover_batch_reversal($1,$2,$3) as result', [2026, 2027, campus],
)).rows[0].result
assert.equal(changedReversalPreview.can_reverse, false, 'a learner changed after rollover makes the whole reversal ineligible')
assert.equal(changedReversalPreview.blocked_count, 1, 'the preview identifies how many learner placements changed')
await rolloverRejectsInSavepoint(
  () => db.query('select reverse_year_rollover_batch($1,$2,$3,$4,$5,$6)',
    [2026, 2027, campus, 4, 'Approved correction after review', 'REVERSE YEAR ROLLOVER 2026 TO 2027']),
  /changed after rollover/,
)
await db.exec('reset role')
await db.query('update profiles set class_level=$2 where id=$1', [ids.stranger, 'Form 2'])
await db.exec('set role authenticated')
const reversedRollover = (await db.query(
  'select reverse_year_rollover_batch($1,$2,$3,$4,$5,$6) as result',
  [2026, 2027, campus, 4, 'Approved correction after review', 'REVERSE YEAR ROLLOVER 2026 TO 2027'],
)).rows[0].result
assert.equal(reversedRollover.already_reversed, false, 'eligible reversal records one completed reversal')
assert.equal(reversedRollover.learner_count, 4, 'one reversal restores every learner from the batch')
const restoredProfiles = (await db.query(
  'select id, full_name, admission_number, campus_id, class_level, class_stream, enrollment_status from profiles where id=any($1::uuid[]) order by id',
  [Object.keys(rolloverProfileSnapshots)],
)).rows
assert.deepEqual(restoredProfiles, Object.values(rolloverProfileSnapshots).sort((left, right) => left.id.localeCompare(right.id)),
  'reversal restores the original learner placement and enrolment snapshots exactly')
for (const learnerId of Object.keys(rolloverProfileSnapshots)) {
  assert.deepEqual((await db.query(
    `select
      (select count(*)::integer from learner_records where student_id=$1) as records,
      (select count(*)::integer from fee_records where student_id=$1) as fees,
      (select count(*)::integer from student_guardians where student_id=$1) as guardians`, [learnerId],
  )).rows[0], protectedRolloverHistory[learnerId], 'reversal also preserves records, fees and guardian links')
}
assert.equal((await db.query(
  "select count(*)::integer as count from audit_trail where entity_type='year_rollover' and action='reversed'",
)).rows[0].count, 4, 'each restored learner receives a separate reversal audit event')
assert.equal((await db.query(
  "select count(*)::integer as count from audit_trail where entity_type='year_rollover_batch' and action='reversed'",
)).rows[0].count, 1, 'the reversal has one batch-level audit event')
assert.equal((await db.query(
  'select year_rollover_batch_run_status($1,$2,$3) as result', [2026, 2027, campus],
)).rows[0].result.status, 'reversed', 'batch status preserves both apply and reversal lifecycle state')
const repeatedReversal = (await db.query(
  'select reverse_year_rollover_batch($1,$2,$3,$4,$5,$6) as result',
  [2026, 2027, campus, 4, 'Approved correction after review', 'REVERSE YEAR ROLLOVER 2026 TO 2027'],
)).rows[0].result
assert.equal(repeatedReversal.already_reversed, true, 'repeating reversal returns the existing result without restoring learners twice')
assert.equal((await db.query(
  "select count(*)::integer as count from audit_trail where entity_type='year_rollover_batch' and action='reversed'",
)).rows[0].count, 1, 'idempotent reversal does not duplicate batch audit events')
const repeatedRollover = (await db.query(
  'select apply_year_rollover_batch($1,$2,$3,$4,$5,$6) as result',
  [2026, 2027, campus, 4, 'APPLY YEAR ROLLOVER 2026 TO 2027', true],
)).rows[0].result
assert.equal(repeatedRollover.already_applied, true, 'repeating the same cycle returns the existing run without reprocessing learners')
assert.equal((await db.query(
  "select count(*)::integer as count from audit_trail where entity_type='year_rollover_batch' and action='applied'",
)).rows[0].count, 1, 'an idempotent retry does not add duplicate batch audit events')
await db.exec('rollback')
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
await db.exec('reset role')
const libraryPeriod = (await db.query(
  "insert into reporting_periods(campus_id,academic_year,academic_term,period_status,is_current) values($1,2099,'Term 1','open',true) returning id",
  [campus],
)).rows[0].id
await as('teacher')
const teacherScienceAllocation = (await db.query(
  "select id from teacher_class_assignments where teacher_id=$1 and campus_id=$2 and subject='Science'",
  [ids.teacher, campus],
)).rows[0].id
assert.deepEqual(
  (await db.query('select teacher_learning_current_period($1) as period', [campus])).rows[0].period,
  { id: libraryPeriod, campus_id: campus, academic_year: 2099, academic_term: 'Term 1' },
  'teacher current-period lookup exposes only the active campus reporting-period identity',
)
const learningResourceId = (await db.query(
  "select create_teacher_learning_resource($1,'Science revision','Revision notes for the current topic') as id",
  [teacherScienceAllocation],
)).rows[0].id
assert.equal((await db.query('select state,academic_year,academic_term,class_stream from learning_resources where id=$1', [learningResourceId])).rows[0].state, 'draft')
assert.equal((await db.query('select class_stream from learning_resources where id=$1', [learningResourceId])).rows[0].class_stream, null,
  'a whole-class allocation snapshots null stream without inventing a stream')
await db.exec('reset role')
const unscopedTeacherAllocation = (await db.query(
  "select id from teacher_class_assignments where teacher_id=$1 and subject is null limit 1", [ids.stream_teacher],
)).rows[0].id
await as('teacher')
await rejects(
  () => db.query("select create_teacher_learning_resource($1,'Wrong scope','')", [unscopedTeacherAllocation]),
  /current subject allocation/,
)
await db.exec('reset role')
const otherCampusAllocation = (await db.query(
  "select id from teacher_class_assignments where teacher_id=$1 and campus_id=$2 and subject='Biology'",
  [ids.teacher, seniorCampus],
)).rows[0].id
await as('teacher')
await rejects(
  () => db.query("select create_teacher_learning_resource($1,'Wrong campus','')", [otherCampusAllocation]),
  /current subject allocation/,
)
const reservedLibraryFile = (await db.query(
  "select reserve_teacher_learning_file($1,$2,'topic notes.pdf','pdf','application/pdf',2048) as result",
  ['70000000-0000-4000-8000-000000000001', learningResourceId],
)).rows[0].result
assert.equal((await db.query(
  "select reserve_teacher_learning_file($1,$2,'topic notes.pdf','pdf','application/pdf',2048) as result",
  ['70000000-0000-4000-8000-000000000001', learningResourceId],
)).rows[0].result.id, reservedLibraryFile.id, 'repeating the same file reservation returns its original immutable path')
await rejects(
  () => db.query("select reserve_teacher_learning_file($1,$2,'changed.pdf','pdf','application/pdf',2048)", [
    '70000000-0000-4000-8000-000000000001', learningResourceId,
  ]),
  /already used/,
)
await rejects(
  () => db.query("select reserve_teacher_learning_file($1,$2,'archive.zip','zip','application/zip',2048)", [
    '70000000-0000-4000-8000-000000000002', learningResourceId,
  ]),
  /check constraint/,
)
await rejects(
  () => db.query("select set_teacher_learning_resource_state($1,'published')", [learningResourceId]),
  /Upload and finalize/,
)
await rejects(
  () => db.query("insert into storage.objects(bucket_id,name,metadata) values('learning-library',$1,$2::jsonb)", [
    'unreserved/forbidden.pdf',
    JSON.stringify({ size: 4096, mimetype: 'application/pdf' }),
  ]),
  /row-level security/,
)
await db.query(
  "insert into storage.objects(bucket_id,name,metadata) values('learning-library',$1,$2::jsonb)",
  [reservedLibraryFile.object_path, JSON.stringify({ size: 4096, mimetype: 'application/pdf' })],
)
await rejects(
  () => db.query('select finalize_teacher_learning_file($1)', [reservedLibraryFile.id]),
  /does not match/,
)
await db.exec('reset role')
await db.query("update storage.objects set metadata=$2::jsonb where bucket_id='learning-library' and name=$1", [
  reservedLibraryFile.object_path,
  JSON.stringify({ size: 2048, mimetype: 'application/pdf' }),
])
await as('teacher')
assert.equal((await db.query('select finalize_teacher_learning_file($1) as result', [reservedLibraryFile.id])).rows[0].result.active, true)
const replacementLibraryFile = (await db.query(
  "select reserve_teacher_learning_file($1,$2,'topic slides.pptx','pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',4096) as result",
  ['70000000-0000-4000-8000-000000000003', learningResourceId],
)).rows[0].result
await db.query(
  "insert into storage.objects(bucket_id,name,metadata) values('learning-library',$1,$2::jsonb)",
  [replacementLibraryFile.object_path, JSON.stringify({ size: 4096, mimetype: replacementLibraryFile.mime_type })],
)
assert.equal((await db.query('select finalize_teacher_learning_file($1) as result', [replacementLibraryFile.id])).rows[0].result.active, true)
assert.equal((await db.query('select active from learning_resource_files where id=$1', [reservedLibraryFile.id])).rows[0].active, false,
  'a replacement becomes active only after verification while the earlier finalized file remains in history')
const closedPeriodDraftId = (await db.query(
  "select create_teacher_learning_resource($1,'Period close draft','') as id", [teacherScienceAllocation],
)).rows[0].id
await db.query("select update_teacher_learning_resource($1,'Edited period draft','Teacher edit is recorded')", [closedPeriodDraftId])
assert.equal((await db.query('select title from learning_resources where id=$1', [closedPeriodDraftId])).rows[0].title,
  'Edited period draft', 'current allocations can edit a draft while its reporting period is open')
await db.query("select set_teacher_learning_resource_state($1,'published')", [learningResourceId])
assert.equal((await db.query('select state from learning_resources where id=$1', [learningResourceId])).rows[0].state, 'published')
await rejects(
  () => db.query('update learning_resources set title=$2 where id=$1', [learningResourceId, 'Direct write']),
  /row-level security|permission denied/,
)
await rejects(
  () => db.query("delete from storage.objects where bucket_id='learning-library' and name=$1", [reservedLibraryFile.object_path]),
  /row-level security|permission denied/,
)
await rejects(
  () => db.query('select update_teacher_learning_resource($1,$2,$3)', [learningResourceId, 'Published edits denied', '']),
  /current teaching allocation/,
)
await rejects(
  () => db.query("select reserve_teacher_learning_file($1,$2,'late.pdf','pdf','application/pdf',100)", [
    '70000000-0000-4000-8000-000000000004', learningResourceId,
  ]),
  /current teaching allocation/,
)
await as('student')
assert.equal((await db.query('select count(*)::integer as count from learning_resources')).rows[0].count, 0,
  'student accounts cannot read teacher learning resources')
assert.equal((await db.query("select count(*)::integer as count from storage.objects where bucket_id='learning-library'")).rows[0].count, 0,
  'a legacy broad Storage policy cannot expose learning-library objects to students')
await as('stream_teacher')
assert.equal((await db.query('select count(*)::integer as count from learning_resources')).rows[0].count, 0,
  'teachers cannot read another teacher’s library resources, even in the same campus')
assert.equal((await db.query("select count(*)::integer as count from storage.objects where bucket_id='learning-library'")).rows[0].count, 0,
  'a broad Storage policy cannot expose another teacher’s private files')
await db.exec('reset role')
await db.query("update profiles set role='student',campus_id=$2,class_level=$3,class_stream=$4,enrollment_status='active' where id=$1", [
  ids.student, campus, 'Form 1', null,
])
await db.query("update profiles set role='student',campus_id=$2,class_level=$3,class_stream=$4,enrollment_status='active' where id=$1", [
  ids.stream_student, campus, 'Form 1', 'B',
])
await db.query("insert into student_guardians(student_id,parent_id) values($1,$2) on conflict do nothing", [ids.stream_student, ids.parent])
const englishAllocation = (await db.query(
  "select id from teacher_class_assignments where teacher_id=$1 and campus_id=$2 and subject='English'",
  [ids.subject_teacher, campus],
)).rows[0].id
await as('subject_teacher')
const streamAResourceId = (await db.query(
  "select create_teacher_learning_resource($1,'Stream A practice','For learners assigned to stream A') as id", [englishAllocation],
)).rows[0].id
const streamAFile = (await db.query(
  "select reserve_teacher_learning_file($1,$2,'stream-a.png','png','image/png',512) as result",
  ['80000000-0000-4000-8000-000000000001', streamAResourceId],
)).rows[0].result
await db.query(
  "insert into storage.objects(bucket_id,name,metadata) values('learning-library',$1,$2::jsonb)",
  [streamAFile.object_path, JSON.stringify({ size: 512, mimetype: 'image/png' })],
)
await db.query('select finalize_teacher_learning_file($1)', [streamAFile.id])
await db.query("select set_teacher_learning_resource_state($1,'published')", [streamAResourceId])
await as('parent')
assert.equal((await db.query('select count(*)::integer as count from learning_resources where id=$1', [learningResourceId])).rows[0].count, 1,
  'a verified parent can read a published resource matching a currently enrolled linked learner')
assert.equal((await db.query('select count(*)::integer as count from learning_resources where id=$1', [streamAResourceId])).rows[0].count, 0,
  'parent access does not infer a subject allocation: a stream B or null-stream learner cannot read stream A resources')
assert.equal((await db.query('select count(*)::integer as count from learning_resource_files where resource_id=$1', [learningResourceId])).rows[0].count, 1,
  'parents see only the active finalized file metadata, not replaced file history')
assert.equal((await db.query("select count(*)::integer as count from storage.objects where bucket_id='learning-library'")).rows[0].count, 1,
  'parents can access only the active private object for their eligible published resources')
await db.exec('reset role')
await db.query('update profiles set campus_id=$1 where id in ($2,$3)', [seniorCampus, ids.student, ids.stream_student])
await as('parent')
assert.equal((await db.query('select count(*)::integer as count from learning_resources where id=$1', [learningResourceId])).rows[0].count, 0,
  'matching class labels in another campus do not grant parent access')
await db.exec('reset role')
await db.query('update profiles set campus_id=$1 where id in ($2,$3)', [campus, ids.student, ids.stream_student])
await db.query('update profiles set enrollment_status=\'inactive\' where id in ($1,$2)', [ids.student, ids.stream_student])
await as('parent')
assert.equal((await db.query('select count(*)::integer as count from learning_resources where id=$1', [learningResourceId])).rows[0].count, 0,
  'ending all linked learners’ active enrollment immediately removes resource access')
await db.exec('reset role')
await db.query('update profiles set enrollment_status=\'active\' where id in ($1,$2)', [ids.student, ids.stream_student])
await db.query('delete from student_guardians where parent_id=$1', [ids.parent])
await as('parent')
assert.equal((await db.query('select count(*)::integer as count from learning_resources where id=$1', [learningResourceId])).rows[0].count, 0,
  'removing the verified guardian link immediately removes parent resource access')
await db.exec('reset role')
await db.query('insert into student_guardians(student_id,parent_id) values($1,$2),($3,$2)', [ids.student, ids.parent, ids.stream_student])
await as('teacher')
await db.query("select set_teacher_learning_resource_state($1,'archived')", [learningResourceId])
await as('parent')
assert.equal((await db.query('select count(*)::integer as count from learning_resources where id=$1', [learningResourceId])).rows[0].count, 0,
  'archiving a teacher resource immediately removes it from parent reads')
await db.exec('reset role')
await db.query("update profiles set class_stream='A' where id=$1", [ids.student])
await db.query('delete from student_guardians where student_id=$1 and parent_id=$2', [ids.stream_student, ids.parent])
await as('teacher')
await db.exec('reset role')
await db.query("update reporting_periods set period_status='closed' where id=$1", [libraryPeriod])
await as('teacher')
await rejects(
  () => db.query("select update_teacher_learning_resource($1,'Closed period edit','')", [closedPeriodDraftId]),
  /reporting period is closed/,
)
await db.exec('reset role')
await db.query("update reporting_periods set period_status='open' where id=$1", [libraryPeriod])
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
await db.query("select record_bulk_coursework_marks('Quiz 1','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 40 }])])
assert.equal(
  (await db.query("select assessment_type from learner_records where student_id=$1 and title='Quiz 1' and assessment_type='coursework'", [ids.stream_student])).rows[0].assessment_type,
  'coursework',
  'the Coursework RPC records a separately classified score for an assigned learner',
)
await rejects(
  () => db.query("select record_bulk_coursework_marks('Out of scope coursework','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.other_student, score: 40 }])]),
  /Subject is not allocated/,
)
await rejects(
  () => db.query("select record_bulk_marks('Quiz 1','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 75 }])]),
  /already exist for this assessment/,
)
await rejects(
  () => db.query("select record_bulk_marks('Duplicate batch','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([
    { student_id: ids.stream_student, score: 75 },
    { student_id: ids.stream_student, score: 80 },
  ])]),
  /appears more than once/,
)
await rejects(
  () => db.query("select record_bulk_marks('Missing score','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student }])]),
  /valid learner ID and a numeric mark/,
)
await rejects(
  () => db.query("select record_bulk_marks('Future assessment','Science',current_date + 1,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 75 }])]),
  /must be today or earlier and match the academic year/,
)
await rejects(
  () => db.query("select record_bulk_marks('Wrong year','Science',date '2025-12-31',2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 75 }])]),
  /must be today or earlier and match the academic year/,
)
await rejects(
  () => db.query("select record_bulk_marks('Invalid term','Science',current_date,2026,'Term 4',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 75 }])]),
  /valid academic term/,
)
assert.equal(
  (await db.query("select subject from learner_records where student_id=$1 and title='Quiz 1'", [ids.stream_student])).rows[0].subject,
  'Science',
  'Markbook persists subject separately from the assessment title',
)
await db.query(
  "insert into learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term) values($1,'academic',current_date,'Direct scoped mark','Science',70,100,2026,'Term 1')",
  [ids.stream_student],
)
await rejects(
  () => db.query(
    "insert into learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term) values($1,'academic',current_date,'Direct out-of-class mark','Science',70,100,2026,'Term 1')",
    [ids.other_student],
  ),
  /row-level security/,
)
await rejects(
  () => db.query("select record_bulk_marks('Cross-class batch','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([
    { student_id: ids.student, score: 70 },
    { student_id: ids.other_student, score: 70 },
  ])]),
  /Subject is not allocated/,
)
assert.equal((await db.query("select count(*) from learner_records where title='Cross-class batch'")).rows[0].count, 0,
  'a mixed-scope bulk call rolls back every mark when one learner is outside the assignment')
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
  () => db.query(
    "insert into learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term) values($1,'academic',current_date,'Direct wrong subject','Science',70,100,2026,'Term 1')",
    [ids.student],
  ),
  /row-level security/,
)
await rejects(
  () => db.query(
    "insert into learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term) values($1,'academic',current_date,'Direct wrong campus','English',70,100,2026,'Term 1')",
    [seniorLearnerId],
  ),
  /row-level security/,
)
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
assert.equal(
  (await db.query("select close_reporting_period($1,1,'Marks reviewed and term results checked') as revision", [registeredPeriodId])).rows[0].revision,
  2,
  'closing a period advances its expected revision',
)
assert.deepEqual(
  (await db.query('select period_status,revision from reporting_periods where id=$1', [registeredPeriodId])).rows[0],
  { period_status: 'closed', revision: 2 },
  'reviewed close changes the registry state to closed',
)
assert.equal(
  (await db.query("select reason from reporting_period_events where period_id=$1 and revision=2 and action='closed'", [registeredPeriodId])).rows[0].reason,
  'Marks reviewed and term results checked',
  'close reason is preserved in the append-only event history',
)
assert.equal(
  (await db.query("select count(*) from audit_trail where entity_type='reporting_period' and entity_id=$1 and action='closed'", [registeredPeriodId])).rows[0].count,
  1,
  'period close is recorded in the activity audit trail',
)
await rejects(
  () => db.query("select close_reporting_period($1,1,'Marks reviewed and term results checked')", [registeredPeriodId]),
  /period changed/,
)
await rejects(
  () => db.query("select close_reporting_period($1,2,'short')", [registeredPeriodId]),
  /at least 8 characters/,
)
await rejects(
  () => db.query("select record_bulk_coursework_marks('Attempt after close','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 50 }])]),
  /reporting period is closed/,
)
await rejects(
  () => db.query("insert into learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term,assessment_type) values($1,'academic',current_date,'Direct after close','Science',70,100,2026,'Term 1','markbook')", [ids.stream_student]),
  /reporting period is closed/,
)
assert.equal(
  (await db.query("select review_reporting_period($1,'reopen',2,null,null,'Verified corrections are required') as revision", [registeredPeriodId])).rows[0].revision,
  3,
  'reviewed reopen advances the period revision',
)
assert.deepEqual(
  (await db.query('select period_status,revision from reporting_periods where id=$1', [registeredPeriodId])).rows[0],
  { period_status: 'open', revision: 3 },
  'reviewed reopen changes a closed period back to open',
)
assert.equal(
  (await db.query("select reason from reporting_period_events where period_id=$1 and revision=3 and action='reopened'", [registeredPeriodId])).rows[0].reason,
  'Verified corrections are required',
  'reopen reason is kept in the event history',
)
const nextCurrentPeriodId = (await db.query(
  "select register_reporting_period($1,2026,'Term 2') as id", [campus],
)).rows[0].id
await rejects(
  () => db.query("select review_reporting_period($1,'make_current',1,null,null,'short')", [nextCurrentPeriodId]),
  /at least 8 characters/,
)
const initialCurrent = (await db.query(
  'select id,revision from reporting_periods where campus_id=$1 and is_current', [campus],
)).rows[0] || null
await db.query(
  "select review_reporting_period($1,'make_current',3,$2,$3,'Initial term selection reviewed by school leadership')",
  [registeredPeriodId, initialCurrent?.id ?? null, initialCurrent?.revision ?? null],
)
const previousCurrent = (await db.query(
  'select id,revision from reporting_periods where campus_id=$1 and is_current', [campus],
)).rows[0]
assert.equal(
  (await db.query("select review_reporting_period($1,'make_current',1,$2,$3,'Term transition reviewed by school leadership') as revision", [nextCurrentPeriodId, previousCurrent?.id ?? null, previousCurrent?.revision ?? null])).rows[0].revision,
  2,
  'making a different period current advances its revision',
)
assert.deepEqual(
  (await db.query('select is_current,revision from reporting_periods where id=$1', [registeredPeriodId])).rows[0],
  { is_current: false, revision: previousCurrent.id === registeredPeriodId ? 5 : 4 },
  'switching current period clears the previous selection and advances its revision',
)
assert.deepEqual(
  (await db.query('select is_current,revision from reporting_periods where id=$1', [nextCurrentPeriodId])).rows[0],
  { is_current: true, revision: 2 },
  'the selected open period becomes current with its own revision',
)
assert.equal(
  (await db.query("select count(*) from reporting_period_events where action in ('made_current','made_not_current') and reason='Term transition reviewed by school leadership'", [])).rows[0].count,
  2,
  'both sides of the current-period switch have reasoned events',
)
assert.equal(
  (await db.query("select count(*) from audit_trail where entity_type='reporting_period' and action in ('made_current','made_not_current') and detail->>'reason'='Term transition reviewed by school leadership'", [])).rows[0].count,
  2,
  'both sides of the current-period switch are in the activity audit trail',
)
const staleCurrentTargetId = (await db.query(
  "select register_reporting_period($1,2026,'Term 3') as id", [campus],
)).rows[0].id
await rejects(
  () => db.query("select review_reporting_period($1,'make_current',1,$2,1,'Repeat stale term transition')", [staleCurrentTargetId, registeredPeriodId]),
  /current reporting period changed/,
)
const reopenedPeriodRevision = (await db.query(
  'select revision from reporting_periods where id=$1', [registeredPeriodId],
)).rows[0].revision
assert.equal(
  (await db.query("select close_reporting_period($1,$2,'Final close after reviewed term transition') as revision", [registeredPeriodId, reopenedPeriodRevision])).rows[0].revision,
  reopenedPeriodRevision + 1,
  'period can be closed again after review changes',
)
await as('admin')
await rejects(
  () => db.query(
    "insert into report_publications(campus_id,academic_year,academic_term,published_at,published_by) values($1,2099,'Term 1',now(),$2)",
    [campus, ids.admin],
  ),
  /Every learner must have at least one academic mark before publishing reports/,
)
assert.equal(
  (await db.query("select count(*) from report_publications where campus_id=$1 and academic_year=2099 and academic_term='Term 1'", [campus])).rows[0].count,
  0,
  'a report release with no period marks leaves no publication row behind',
)
await rejects(
  () => db.query(
    "insert into report_publications(campus_id,academic_year,academic_term,published_at,published_by) values($1,2026,'Term 1',now(),$2)",
    [campus, ids.admin],
  ),
  /Set class teacher and head of school approval names before publishing reports/,
)
await db.query(
  "insert into report_term_settings(campus_id,academic_year,academic_term,class_teacher_name,head_of_school_name,updated_by) values($1,2026,'Term 1','Class Teacher','Head of School',$2)",
  [campus, ids.admin],
)
await db.exec('reset role; begin; delete from report_grade_bands where campus_id is null and band_group=\'olevel\'')
await rejects(
  () => db.query(
    "insert into report_publications(campus_id,academic_year,academic_term,published_at,published_by) values($1,2026,'Term 1',now(),$2)",
    [campus, ids.admin],
  ),
  /Configure grade bands for every class level before publishing reports/,
)
await db.exec('rollback; set role authenticated')
assert.equal(
  (await db.query("select count(*) from report_grade_bands where campus_id is null and band_group='olevel'", [])).rows[0].count,
  5,
  'the isolated grade-band failure fixture rolls back before the valid release test',
)
const published = (await db.query(
  "insert into report_publications(campus_id,academic_year,academic_term,published_at,published_by) values($1,2026,'Term 1',now(),$2) returning id,published_by",
  [campus, ids.parent],
)).rows[0]
const publicationId = published.id
assert.equal(published.published_by, ids.admin, 'the database attributes release to the signed-in administrator, not the client-supplied author')
const publicationAudit = (await db.query(
  "select actor_id,action,detail from audit_trail where entity_type='report_publication' and entity_id=$1",
  [publicationId],
)).rows[0]
assert.deepEqual(publicationAudit, {
  actor_id: ids.admin,
  action: 'published',
  detail: { academic_year: 2026, academic_term: 'Term 1' },
}, 'release audit records the actual publisher and exact academic period')
const releaseAnnouncement = (await db.query(
  "select campus_id,author_id,audience_roles,title from announcements where title='Academic reports published · 2026 · Term 1'",
)).rows[0]
assert.deepEqual(releaseAnnouncement, {
  campus_id: campus,
  author_id: ids.admin,
  audience_roles: ['student', 'parent'],
  title: 'Academic reports published · 2026 · Term 1',
}, 'release announcement carries the same campus, publisher, period, and learner/parent audience')
await rejects(
  () => db.query('update report_release_snapshots set average_percent=0 where publication_id=$1 and student_id=$2', [publicationId, ids.stream_student]),
  /permission denied/,
)
await rejects(
  () => db.query('delete from report_release_snapshots where publication_id=$1 and student_id=$2', [publicationId, ids.stream_student]),
  /permission denied/,
)
await rejects(
  () => db.query('delete from report_publications where id=$1', [publicationId]),
  /publication with issued learner snapshots cannot be deleted/,
)
await rejects(
  () => db.query('update report_publications set published_by=$2 where id=$1', [publicationId, ids.parent]),
  /publisher cannot be changed while a report is published/,
)
await rejects(
  () => db.query('update report_publications set academic_year=2027 where id=$1', [publicationId]),
  /period cannot be changed on a published report/,
)
assert.equal(
  (await db.query('select period_status from reporting_periods where id=$1', [registeredPeriodId])).rows[0].period_status,
  'closed',
  'publishing report snapshots does not change the separate closed-period status',
)
const markbookAverage = (await db.query(
  "select round(avg(score / max_score * 100), 2) as value from learner_records where student_id=$1 and kind='academic' and assessment_type='markbook' and academic_year=2026 and academic_term='Term 1'",
  [ids.stream_student],
)).rows[0].value
const frozen = (await db.query(
  'select * from report_release_snapshots where publication_id=$1 and student_id=$2',
  [publicationId, ids.stream_student],
)).rows[0]
assert.equal(frozen.integrity_version, 2, 'new report snapshots use the identity-aware fingerprint version')
assert.equal(frozen.identity_context_recorded, true, 'new report snapshots mark release-time identity as captured')
assert.equal(frozen.captured_learner_name, 'Stream B Learner', 'issued reports freeze the learner name at release')
assert.equal(frozen.captured_class_level, 'Form 1', 'issued reports freeze the learner class at release')
assert.equal(frozen.captured_class_stream, 'B', 'issued reports freeze the learner stream at release')
assert.equal(frozen.captured_admission_number, 'B001', 'issued reports freeze the admission number at release')
assert.equal(frozen.captured_campus_name, 'Fordridge Junior School', 'issued reports freeze the campus name at release')
const verification = (await db.query(
  'select * from verify_report_snapshot_integrity($1)',
  [frozen.integrity_hash],
)).rows[0]
assert.equal(verification.integrity_valid, true, 'a released snapshot verifies against its calculated fingerprint')
assert.equal(verification.academic_year, frozen.academic_year, 'verification returns the report year')
assert.equal(verification.academic_term, frozen.academic_term, 'verification returns the report term')
assert.equal(verification.campus_name, 'Fordridge Junior School', 'verification returns the report campus without learner data')
assert.equal((await db.query('select * from verify_report_snapshot_integrity($1)', ['a'.repeat(32)])).rows.length, 0,
  'an unknown fingerprint is reported as not found')
await as('teacher')
await rejects(
  () => db.query('select * from verify_report_snapshot_integrity($1)', [frozen.integrity_hash]),
  /Administrator access required/,
)
await as('admin')
await db.query('reset role')
await db.query('update report_release_snapshots set average_percent=average_percent+1 where id=$1', [frozen.id])
await as('admin')
const mismatch = (await db.query(
  'select * from verify_report_snapshot_integrity($1)',
  [frozen.integrity_hash],
)).rows[0]
assert.equal(mismatch.integrity_valid, false, 'changed snapshot content fails fingerprint verification')
assert.notEqual(mismatch.calculated_hash, frozen.integrity_hash, 'the verifier returns the recalculated fingerprint')
assert.equal((await db.query(
  "select count(*) from audit_trail where actor_id=$1 and entity_type='report_snapshot' and entity_id=$2 and action='integrity_mismatch'",
  [ids.admin, frozen.id],
)).rows[0].count, 1, 'a mismatch is recorded in Activity Log')
await db.query('reset role')
await db.query('update report_release_snapshots set average_percent=$2 where id=$1', [frozen.id, frozen.average_percent])
await as('admin')
await db.query('reset role')
await db.query("update report_release_snapshots set captured_class_level='Form 9' where id=$1", [frozen.id])
await as('admin')
assert.equal((await db.query('select * from verify_report_snapshot_integrity($1)', [frozen.integrity_hash])).rows[0].integrity_valid, false,
  'changing the frozen class identity fails the identity-aware fingerprint check')
await db.query('reset role')
await db.query('update report_release_snapshots set captured_class_level=$2 where id=$1', [frozen.id, frozen.captured_class_level])
await as('admin')
await db.query('reset role')
await db.query('update report_release_snapshots set integrity_hash=$2 where id=$1', [frozen.id, 'c'.repeat(32)])
await as('admin')
assert.equal((await db.query('select * from verify_report_snapshot_integrity($1)', [frozen.integrity_hash])).rows[0].integrity_valid, false,
  'a changed stored fingerprint is detected even when snapshot contents remain unchanged')
assert.equal((await db.query(
  "select count(*) from audit_trail where actor_id=$1 and entity_type='report_snapshot' and entity_id=$2 and action='integrity_mismatch'",
  [ids.admin, frozen.id],
)).rows[0].count, 3, 'each integrity mismatch is recorded in Activity Log')
await db.query('reset role')
await db.query('update report_release_snapshots set integrity_hash=$2 where id=$1', [frozen.id, frozen.integrity_hash])
await as('admin')
const legacyHash = (await db.query(`
  select md5(concat_ws('|', publication_id::text, student_id::text, assessments::text,
    coalesce(average_percent::text, ''), coalesce(overall_grade, ''), coalesce(class_rank::text, ''),
    coalesce(class_teacher_name, ''), coalesce(head_of_school_name, ''), released_at::text)) as value
  from report_release_snapshots where id=$1
`, [frozen.id])).rows[0].value
await db.query('reset role')
await db.query(`update report_release_snapshots set
  captured_learner_name=null, captured_admission_number=null, captured_class_level=null,
  captured_class_stream=null, captured_campus_name=null, identity_context_recorded=false,
  integrity_version=1, integrity_hash=$2 where id=$1`, [frozen.id, legacyHash])
await as('admin')
const legacyVerification = (await db.query('select * from verify_report_snapshot_integrity($1)', [legacyHash])).rows[0]
assert.equal(legacyVerification.integrity_valid, true, 'legacy fingerprint v1 continues to verify unchanged')
assert.equal(legacyVerification.campus_name, null, 'legacy verification does not invent release-time campus identity')
await db.query('reset role')
await db.query(`update report_release_snapshots set
  captured_learner_name=$2, captured_admission_number=$3, captured_class_level=$4,
  captured_class_stream=$5, captured_campus_name=$6, identity_context_recorded=$7,
  integrity_version=$8, integrity_hash=$9 where id=$1`, [
  frozen.id, frozen.captured_learner_name, frozen.captured_admission_number, frozen.captured_class_level,
  frozen.captured_class_stream, frozen.captured_campus_name, frozen.identity_context_recorded,
  frozen.integrity_version, frozen.integrity_hash,
])
await as('admin')
assert.equal((await db.query('select * from verify_report_snapshot_integrity($1)', [frozen.integrity_hash])).rows[0].integrity_valid, true,
  'restoring the original snapshot values restores successful verification')
assert.ok(frozen.assessments.some(item => item.title === 'Quiz 1' && item.subject === 'Science'), 'official snapshots preserve the allocated subject')
assert.ok(frozen.assessments.some(item => item.title === 'Quiz 1' && item.assessment_type === 'coursework'), 'official snapshots retain the separate Coursework classification')
assert.equal(frozen.average_percent, markbookAverage, 'coursework remains visible but does not affect an unapproved report average')
assert.equal(frozen.subject_signatories.Science, 'T', 'whole-class subject allocations appear on stream-specific report snapshots')
await rejects(
  () => db.query("select record_bulk_coursework_marks('After publication','Science',current_date,2026,'Term 1',100,$1::jsonb)", [JSON.stringify([{ student_id: ids.stream_student, score: 50 }])]),
  /reporting period is closed|academic period has been published/,
)
await rejects(
  () => db.query("insert into learner_records(student_id,kind,event_date,title,subject,score,max_score,academic_year,academic_term,assessment_type) values($1,'academic',current_date,'Direct late mark','Science',70,100,2026,'Term 1','markbook')", [ids.stream_student]),
  /reporting period is closed|academic period has been published/,
)
await rejects(
  () => db.query("delete from learner_records where student_id=$1 and title='Quiz 1' and assessment_type='coursework'", [ids.stream_student]),
  /reporting period is closed|academic period has been published/,
)
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
  'select * from report_release_snapshots where publication_id=$1 and student_id=$2',
  [publicationId, ids.stream_student],
)).rows[0]
assert.deepEqual(frozenAfterCorrection, frozen, 'correcting the current learner profile leaves the issued report snapshot unchanged')
await correctLearner(ids.student, 'Updated Student', 'F001', 'Form 1', 'A', 'inactive')
await as('student')
assert.deepEqual(
  (await db.query('select learner_portal_access_status() as status')).rows[0].status,
  { allowed: false, status: 'inactive' },
  'an inactive learner is denied the learner portal',
)
assert.equal((await db.query('select * from learner_records')).rows.length, 0, 'inactive learners cannot read their academic or attendance records')
assert.equal((await db.query('select * from fee_records')).rows.length, 0, 'inactive learners cannot read their fee records')
assert.equal((await db.query('select * from fee_transactions')).rows.length, 0, 'inactive learners cannot read payment transactions')
assert.equal((await db.query('select * from report_release_snapshots')).rows.length, 0, 'inactive learners cannot read issued reports')
assert.equal((await db.query('select * from announcements')).rows.length, 0, 'inactive learners cannot read student announcements')
assert.equal((await db.query('select * from timetable')).rows.length, 0, 'inactive learners cannot read their timetable')
await rejects(
  () => db.query('select * from report_class_ranking($1,2026,$2)', [ids.student, 'Term 1']),
  /Not allowed/,
)
await rejects(
  () => db.query('select * from report_subject_signatories($1)', [ids.student]),
  /Not allowed/,
)
await as('parent')
assert.equal((await db.query('select * from learner_records')).rows.length, 3, 'parents retain linked learner academic history after deactivation')
assert.equal((await db.query('select * from fee_records')).rows.length, 2, 'parents retain linked learner financial history after deactivation')
assert.equal((await db.query('select * from fee_transactions')).rows.length, 1, 'parents retain linked learner payment history after deactivation')
assert.ok((await db.query('select * from report_release_snapshots where student_id=$1', [ids.student])).rows.length > 0, 'parents retain access to issued reports after deactivation')
assert.equal((await db.query('select * from report_release_snapshots where student_id=$1', [ids.stranger])).rows.length, 0,
  'parents cannot read a different learner’s released report snapshot')
assert.equal((await db.query('select * from report_publications where campus_id=$1', [campus])).rows.length, 1,
  'a linked Parent can read its campus report publication')
await db.query("select switch_active_portal_role('teacher',$1)", [seniorCampusForParentRoleTest])
assert.equal((await db.query('select * from report_release_snapshots where student_id=$1', [ids.student])).rows.length, 0,
  'parent report snapshots are not exposed under another active role')
assert.equal((await db.query('select * from report_publications where campus_id=$1', [campus])).rows.length, 0,
  'parent-linked campus publications are not exposed under another active role')
await db.query("select switch_active_portal_role('parent',$1)", [campus])
await as('admin')
await correctLearner(ids.student, 'Updated Student', 'F001', 'Form 1', 'A', 'active')
await as('student')
assert.deepEqual(
  (await db.query('select learner_portal_access_status() as status')).rows[0].status,
  { allowed: true, status: 'active' },
  'reactivating a learner restores learner portal access',
)
assert.ok((await db.query('select * from learner_records')).rows.length > 0, 'reactivated learners can read their retained academic history')
assert.ok((await db.query('select * from announcements')).rows.length > 0, 'reactivated learners regain their student announcements')
assert.ok((await db.query('select * from timetable')).rows.length > 0, 'reactivated learners regain their timetable')
await as('admin')
await rejects(
  () => db.query('delete from profiles where id=$1', [ids.student]),
  /permission denied/,
)
await db.exec('reset role')
await rejects(
  () => db.query('delete from auth.users where id=$1', [ids.student]),
  /Learner profiles cannot be deleted/,
)
assert.equal((await db.query('select count(*) from profiles where id=$1', [ids.student])).rows[0].count, 1, 'a cascading auth-user delete cannot remove the learner profile')
assert.ok((await db.query('select count(*) from fee_records where student_id=$1', [ids.student])).rows[0].count > 0, 'learner fees remain after a rejected delete')
assert.ok((await db.query('select count(*) from learner_records where student_id=$1', [ids.student])).rows[0].count > 0, 'learner academic history remains after a rejected delete')
assert.ok((await db.query('select count(*) from report_release_snapshots where student_id=$1', [ids.student])).rows[0].count > 0, 'issued report snapshots remain after a rejected delete')
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
  /permission denied/,
)
await rejects(
  () => db.query("select * from submit_cashbook_expense('61000000-0000-4000-8000-000000000020',$1::jsonb)", [JSON.stringify(cashbookExpensePayload)]),
  /Main Admin access required/,
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
  /permission denied/,
)
await rejects(
  () => db.query("select * from submit_cashbook_expense('61000000-0000-4000-8000-000000000021',$1::jsonb)", [JSON.stringify(cashbookExpensePayload)]),
  /Main Admin access required/,
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
await as('admin')
await db.query("select switch_active_portal_role('admin',null)")
await db.query(
  'select admin_record_parent_recovery_support($1,true)',
  [ids.parent],
)
const recoveryAudit = (await db.query(
  "select actor_id,entity_type,entity_id,action,detail from audit_trail where entity_type='parent_access' and entity_id=$1",
  [ids.parent],
)).rows[0]
assert.equal(recoveryAudit.actor_id, ids.admin)
assert.equal(recoveryAudit.action, 'recovery_guidance_provided')
assert.deepEqual(recoveryAudit.detail, {
  method: 'parent_self_service_sms_reset',
  identity_verified: true,
  reusable_credentials_shared: false,
})
const unlinkedParentId = '00000000-0000-4000-8000-999999999999'
await db.exec('reset role')
await db.query(
  'insert into auth.users(id,raw_user_meta_data) values($1,$2)',
  [unlinkedParentId, JSON.stringify({ full_name: 'Unlinked parent', portal_role: 'parent' })],
)
await as('admin')
await rejects(
  () => db.query('select admin_record_parent_recovery_support($1,true)', [unlinkedParentId]),
  /no verified learner link/,
)
await rejects(
  () => db.query('select admin_record_parent_recovery_support($1,false)', [ids.parent]),
  /Verify the requester/,
)
await as('parent')
await rejects(
  () => db.query('select admin_record_parent_recovery_support($1,true)', [ids.parent]),
  /Main administrator access required/,
)
await as('admin')
assert.equal(
  (await db.query("select has_function_privilege('anon','public.admin_record_parent_recovery_support(uuid,boolean)','EXECUTE') as allowed")).rows[0].allowed,
  false,
  'anonymous callers cannot execute the parent recovery support RPC',
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
await as('admin')
await db.query('update report_publications set published_at=null,published_by=null where id=$1', [publicationId])
const returnedToDraftAudit = (await db.query(
  "select actor_id,action,detail from audit_trail where entity_type='report_publication' and entity_id=$1 and action='returned_to_draft'",
  [publicationId],
)).rows[0]
assert.deepEqual(returnedToDraftAudit, {
  actor_id: ids.admin,
  action: 'returned_to_draft',
  detail: { academic_year: 2026, academic_term: 'Term 1' },
}, 'returning a report to draft records the administrator and period')
assert.equal(
  (await db.query("select count(*) from announcements where title='Academic reports published · 2026 · Term 1' and author_id=$1 and published_at is null", [ids.admin])).rows[0].count,
  1,
  'returning a report to draft hides its matching announcement while preserving the attributed record',
)
await rejects(
  () => db.query('update report_publications set published_at=now(),published_by=$2 where id=$1', [publicationId, ids.admin]),
  /already has issued report snapshots/,
)
const periodRevision = (await db.query('select revision from reporting_periods where id=$1', [registeredPeriodId])).rows[0].revision
await db.query(
  "select review_reporting_period($1,'reopen',$2,null,null,'Verified post-release mark correction')",
  [registeredPeriodId, periodRevision],
)
await db.query(
  "select record_bulk_marks('Post-release correction','Science',current_date,2026,'Term 1',100,$1::jsonb)",
  [JSON.stringify([{ student_id: ids.stream_student, score: 15 }])],
)
const snapshotAfterLaterMark = (await db.query(
  'select * from report_release_snapshots where publication_id=$1 and student_id=$2',
  [publicationId, ids.stream_student],
)).rows[0]
assert.deepEqual(snapshotAfterLaterMark, frozen, 'later marks and profile corrections leave the complete issued snapshot unchanged')
await db.exec('begin')
await as('admin')
const reconcileUsdFee = (await db.query(
  "insert into fee_records(campus_id,student_id,amount,currency,paid_amount,academic_year,academic_term,status) values($1,$2,100,'USD',0,2026,'Term 2','pending') returning id",
  [campus, ids.student],
)).rows[0].id
await db.query('select record_fee_payment($1,20,$2,$3,$4)', [
  reconcileUsdFee, 'cash', 'reconciliation USD example', '50000000-0000-4000-8000-000000000001',
])
const reconcileZigFee = (await db.query(
  "insert into fee_records(campus_id,student_id,amount,currency,paid_amount,academic_year,academic_term,status) values($1,$2,50,'ZiG',0,2026,'Term 2','pending') returning id",
  [campus, ids.other_student],
)).rows[0].id
await db.query('select record_fee_payment($1,10,$2,$3,$4)', [
  reconcileZigFee, 'cash', 'reconciliation ZiG example', '50000000-0000-4000-8000-000000000002',
])
const reconcileMismatchFee = (await db.query(
  "insert into fee_records(campus_id,student_id,amount,currency,paid_amount,academic_year,academic_term,status) values($1,$2,40,'ZiG',5,2026,'Term 2','pending') returning id",
  [campus, ids.stranger],
)).rows[0].id
const _reconcileSeniorFee = (await db.query(
  "insert into fee_records(campus_id,student_id,amount,currency,paid_amount,academic_year,academic_term,status) values($1,$2,70,'USD',0,2025,'Term 2','pending') returning id",
  [seniorCampus, ids.stranger],
)).rows[0].id
const allCampusReconciliation = (await db.query(
  'select preview_fee_reconciliation(null,null,null) as result',
)).rows[0].result
const juniorPeriodReconciliation = (await db.query(
  'select preview_fee_reconciliation($1,$2,$3) as result', [campus, 2026, 'Term 2'],
)).rows[0].result
assert.equal(juniorPeriodReconciliation.record_count, 3, 'reconciliation filters by selected campus and academic period')
assert.deepEqual(juniorPeriodReconciliation.periods.map(period => period.currency).sort(), ['USD', 'ZiG'],
  'finance totals remain separated by their recorded currency')
assert.equal(juniorPeriodReconciliation.periods.find(period => period.currency === 'USD').charges, 100,
  'USD charges are totaled without adding ZiG records')
assert.equal(juniorPeriodReconciliation.periods.find(period => period.currency === 'ZiG').charges, 90,
  'ZiG charges include only ZiG-denominated fees')
assert.ok(juniorPeriodReconciliation.anomalies.some(item => item.fee_record_id === reconcileMismatchFee && item.anomaly_types.includes('payment_total_mismatch')),
  'a fee-record/transaction total mismatch is listed for review')
assert.ok(allCampusReconciliation.record_count >= juniorPeriodReconciliation.record_count + 1,
  'Main Admin can reconcile all campuses when no campus is selected')
assert.ok(allCampusReconciliation.periods.some(period => period.campus_id === seniorCampus),
  'all-campus summaries retain the campus grouping')
await as('teacher')
await rolloverRejectsInSavepoint(
  () => db.query('select preview_fee_reconciliation(null,null,null)'),
  /Finance reconciliation access required/,
)
await as('admin')
await db.query("select grant_portal_role($1,'accountant',$2,'Synthetic reconciliation scope test')", [unlinkedParentId, campus])
const reconciliationSession = '10000000-0000-4000-8000-000000000003'
await db.exec('reset role')
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [unlinkedParentId])
await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: reconciliationSession })])
await db.exec('set role authenticated')
await db.query("select switch_active_portal_role('accountant',$1)", [campus])
await rolloverRejectsInSavepoint(
  () => db.query('select preview_fee_reconciliation($1,null,null)', [seniorCampus]),
  /limited to your assigned campus/,
)
assert.ok((await db.query('select preview_fee_reconciliation(null,2026,$1) as result', ['Term 2'])).rows[0].result.periods.every(period => period.campus_id === campus),
  'Accountant reconciliation always stays within the assigned campus')
await db.exec('rollback')
await db.close()
console.log(
  'PASS: migrations, Stages 70–74 teacher/parent learning-library allocation, enrollment, campus, stream, Storage and file lifecycle boundaries, newsletter publication/audience/expiry and user-bound acknowledgement, report readiness/release attribution/announcement/audit, atomic payments/retries/rollback, class and subject scope, role membership isolation/grants/revocation/provisioning, active-role parent/child boundaries, teacher profile/record/RPC scope, guardian access, private records and teacher login.',
)
