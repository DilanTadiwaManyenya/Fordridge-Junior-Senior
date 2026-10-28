import assert from 'node:assert/strict'
import { chromium } from '../.portal-test-tools/node_modules/playwright/index.mjs'

const launchOptions = { headless: true }
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const browser = await chromium.launch(launchOptions)
const errors = []
const writes = []
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  phone: '263777123456',
}
const student = {
  id: '00000000-0000-4000-8000-000000000002',
  full_name: 'Test Learner',
  role: 'student',
  campus_id: 'campus',
  admission_number: 'F001',
  class_level: 'Form 1',
  class_stream: 'A',
  enrollment_status: 'active',
  campus: { name: 'Junior School' },
}
const payload = Buffer.from(
  JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString('base64url')
const session = {
  access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
  refresh_token: 'test-refresh',
  token_type: 'bearer',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  user,
}
async function pageFor(
  role,
  authenticated = true,
  { viewport = { width: 1365, height: 900 }, hasTouch = false } = {},
) {
  const context = await browser.newContext({
    viewport,
    hasTouch,
  })
  if (authenticated)
    await context.addInitScript(
      (session) =>
        localStorage.setItem(
          'sb-ufyegiyhnhdvxiagcjpa-auth-token',
          JSON.stringify(session),
        ),
      session,
    )
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  let paid = 0,
    failPayment = true,
    activityAttempts = 0,
    activityCanSucceed = false
  await page.exposeFunction('allowActivitySuccess', () => {
    activityCanSucceed = true
  })
  await page.exposeFunction('getActivityAttempts', () => activityAttempts)
  await context.route('https://*.supabase.co/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      method = req.method()
    const body = method === 'GET' ? null : req.postDataJSON()
    const send = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      })
    if (method !== 'GET' && method !== 'OPTIONS') writes.push({ path, body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204 })
    if (path.endsWith('/auth/v1/user')) return send(user)
    if (path.endsWith('/auth/v1/token')) return send(session)
    if (path.endsWith('/auth/v1/verify')) return send(session)
    if (path.includes('/auth/v1/')) return send({})
    if (path.endsWith('/rpc/resolve_active_portal_context'))
      return send({ active_role: role, active_campus_id: null })
    if (path.endsWith('/rpc/switch_active_portal_role'))
      return send({ active_role: body.p_role, active_campus_id: body.p_campus_id })
    if (path.endsWith('/audit_trail')) {
      activityAttempts += 1
      if (!activityCanSucceed)
        return send({ message: 'Temporary activity service failure.' }, 503)
      return send([
        {
          id: 'activity-check',
          entity_type: 'learner_profile',
          action: 'Updated profile',
          detail: null,
          created_at: '2026-10-28T10:00:00Z',
          actor: { full_name: 'Test User' },
          campus: { name: 'Junior School' },
        },
      ])
    }
    if (path.endsWith('/rpc/admin_update_profile')) return send(null)
    if (path.endsWith('/rpc/record_fee_payment')) {
      if (failPayment) {
        failPayment = false
        return route.abort('failed')
      }
      paid = Number(body.p_amount)
      return send({ id: 'transaction', amount: paid })
    }
    if (path.endsWith('/functions/v1/create-portal-account'))
      return send({ id: 'new-account' })
    const single = req.headers().accept?.includes('vnd.pgrst.object')
    if (path.endsWith('/profiles')) {
      if (url.searchParams.get('id'))
        return send({
          ...user,
          full_name: 'Test User',
          role,
          campus_id: null,
          campus: { name: 'Junior School', code: 'junior' },
        })
      if (url.searchParams.get('role')?.includes('parent'))
        return send([
          {
            id: 'parent',
            full_name: 'Test Parent',
            phone_number: '+263777111222',
            role: 'parent',
          },
        ])
      return send([student])
    }
    if (path.endsWith('/campuses'))
      return send([{ id: 'campus', name: 'Junior School', code: 'junior' }])
    if (path.endsWith('/user_role_memberships'))
      return send([
        {
          role,
          campus_id: 'campus',
          is_primary: true,
          campus: { name: 'Junior School', code: 'junior' },
        },
      ])
    if (path.endsWith('/fee_records'))
      return send([
        {
          id: 'fee',
          campus_id: 'campus',
          amount: 100,
          paid_amount: paid,
          currency: 'USD',
          status: 'pending',
          student: { full_name: 'Test Learner' },
          campus: { name: 'Junior School' },
          academic_year: 2026,
          academic_term: 'Term 3',
        },
      ])
    if (path.endsWith('/fee_settings')) return send([])
    if (path.endsWith('/student_guardians')) return send([])
    if (
      ['announcements', 'timetable', 'learner_records', 'teacher_class_assignments'].some((table) =>
        path.endsWith('/' + table),
      )
    )
      return send(
        method === 'GET' ? [] : single ? { id: 'saved' } : [{ id: 'saved' }],
      )
    throw new Error(`Unmocked request: ${method} ${path}`)
  })
  return page
}
try {
  const page = await pageFor('admin')
  await page.goto('http://127.0.0.1:5179/portal/learners')
  assert.equal(
    await page.getByRole('link', { name: 'Back to overview' }).getAttribute('href'),
    '/portal',
    'portal subpages provide a shared return path to the overview',
  )
  const exportButton = page.getByRole('button', { name: 'Export 1 learner as CSV' })
  await exportButton.waitFor()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const learnerDownload = await downloadPromise
  assert.equal(learnerDownload.suggestedFilename(), 'fordridge-learners.csv')
  const learnerStream = await learnerDownload.createReadStream()
  const learnerChunks = []
  for await (const chunk of learnerStream) learnerChunks.push(chunk)
  const learnerCsv = Buffer.concat(learnerChunks).toString('utf8')
  assert.match(learnerCsv, /"'00000000-0000-4000-8000-000000000002"/)
  assert.match(learnerCsv, /"'F001"/)
  await page.getByLabel('Search directory').fill('no matching learner')
  assert.equal(
    await page.getByRole('button', { name: 'Export 0 learners as CSV' }).isDisabled(),
    true,
    'export is disabled when the current directory filter has no rows',
  )
  await page.getByLabel('Search directory').fill('')
  await page.getByRole('button', { name: 'View or edit Test Learner' }).click()
  await page.getByLabel('Full name', { exact: true }).fill('Updated Learner')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Profile saved' }).waitFor()
  assert.equal(
    writes.find((w) => w.path.endsWith('admin_update_profile')).body.p_name,
    'Updated Learner',
  )
  await page.getByRole('button', { name: '+ Add learner' }).click()
  await page.getByLabel('Full name', { exact: true }).fill('New Learner')
  await page.getByLabel(/^Campus/).selectOption('campus')
  await page.getByLabel('Phone number', { exact: true }).fill('0777123456')
  await page
    .getByLabel('Initial password', { exact: true })
    .fill('TestPassword123!')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Profile saved' }).waitFor()
  assert.equal(
    writes.find((w) => w.path.endsWith('create-portal-account')).body.role,
    'student',
  )
  await page.getByRole('link', { name: 'Announcements', exact: true }).click()
  await page.getByRole('button', { name: '+ Write announcement' }).click()
  await page.locator('form.workflow-form select').first().selectOption('campus')
  await page.getByLabel('Title', { exact: true }).fill('School notice')
  await page.getByLabel('Announcement', { exact: true }).fill('A test notice')
  await page.getByLabel('Publication').selectOption('published')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Saved successfully' })
    .waitFor()
  assert.ok(
    writes.find((w) => w.path.endsWith('/announcements')).body.published_at,
  )
  await page.getByRole('link', { name: 'Records', exact: true }).click()
  await page.getByRole('button', { name: '+ Add record' }).click()
  await page.getByLabel(/^Learner/).selectOption(student.id)
  await page.getByRole('button', { name: 'Save record' }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Learner record saved' })
    .waitFor()
  assert.equal(
    writes.find((w) => w.path.endsWith('/learner_records')).body
      .attendance_status,
    'present',
  )
  await page.getByRole('link', { name: 'Timetable', exact: true }).click()
  await page.getByRole('button', { name: '+ Add lesson' }).click()
  await page.locator('form.workflow-form select').first().selectOption('campus')
  await page.getByLabel('Subject', { exact: true }).fill('Mathematics')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Saved successfully' })
    .waitFor()
  assert.equal(
    writes.find((w) => w.path.endsWith('/timetable')).body.subject,
    'Mathematics',
  )
  await page.getByRole('link', { name: 'Bulk learner import', exact: true }).click()
  const accountWritesBeforeImport = writes.filter((write) => write.path.endsWith('create-portal-account')).length
  await page.getByLabel('CSV file').setInputFiles({
    name: 'learners.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('full_name,phone,admission_number,class_level,class_stream\n"Smith, Jane",0787600111,F002,"Form 1","Blue, East"'),
  })
  await page.getByText('Smith, Jane', { exact: true }).waitFor()
  await page.getByLabel('Shared initial password (minimum 12 characters)').fill('TestPassword123!')
  assert.equal(
    writes.filter((write) => write.path.endsWith('create-portal-account')).length,
    accountWritesBeforeImport,
    'the preview does not create accounts before explicit confirmation',
  )
  await page.getByRole('button', { name: 'Create 1 learner account' }).click()
  await page.getByRole('status').filter({ hasText: 'Smith, Jane — Created' }).waitFor()
  const importedAccount = writes.filter((write) => write.path.endsWith('create-portal-account')).at(-1)
  assert.equal(importedAccount.body.full_name, 'Smith, Jane')
  assert.equal(importedAccount.body.phone, '+263787600111')
  assert.equal(importedAccount.body.class_stream, 'Blue, East')
  assert.equal('line' in importedAccount.body, false)
  await page.getByRole('link', { name: 'Activity Log', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Temporary activity service failure.' }).waitFor()
  const attemptsBeforeRetry = await page.evaluate(() => window.getActivityAttempts())
  await page.evaluate(() => window.allowActivitySuccess())
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByText('Updated profile', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.getActivityAttempts()), attemptsBeforeRetry + 1, 'a retry makes one new request and recovers from the failed request')
  await page.getByRole('link', { name: 'Finance', exact: true }).click()
  await page
    .getByRole('button', { name: 'Record payment', exact: true })
    .first()
    .click()
  await page.getByLabel('Amount received').fill('40')
  await page
    .locator('form')
    .getByRole('button', { name: 'Record payment', exact: true })
    .click()
  await page.getByText('Confirmation is pending.', { exact: false }).waitFor()
  assert.equal(await page.getByLabel('Amount received').isDisabled(), true)
  await page
    .locator('form')
    .getByRole('button', { name: 'Record payment', exact: true })
    .click()
  await page.locator('form.fees-modal').waitFor({ state: 'hidden' })
  const payments = writes.filter((w) => w.path.endsWith('record_fee_payment'))
  assert.equal(payments.length, 2)
  assert.deepEqual(payments[0].body, payments[1].body)
  await page.getByRole('link', { name: 'Learners', exact: true }).click()
  await page
    .getByRole('button', { name: 'View or edit Test Learner' })
    .waitFor()
  await page.screenshot({
    path: '.portal-test-tools/portal-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: '.portal-test-tools/portal-mobile.png',
    fullPage: true,
  })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    'page must fit mobile viewport',
  )
  const menuButton = page.getByRole('button', {
    name: 'Open portal navigation',
  })
  assert.equal(await menuButton.isVisible(), true, 'mobile navigation toggle is visible')
  assert.equal(await menuButton.getAttribute('aria-expanded'), 'false')
  await menuButton.focus()
  await page.keyboard.press('Enter')
  assert.equal(
    await page.getByRole('button', { name: 'Close portal navigation' }).getAttribute('aria-expanded'),
    'true',
    'keyboard activation opens the mobile navigation',
  )
  const learnersLink = page.getByRole('link', { name: 'Learners', exact: true })
  assert.match(await learnersLink.getAttribute('class'), /active/)
  await page.keyboard.press('Escape')
  const closedMenuButton = page.getByRole('button', {
    name: 'Open portal navigation',
  })
  assert.equal(await closedMenuButton.getAttribute('aria-expanded'), 'false')
  assert.equal(
    await closedMenuButton.evaluate((element) => document.activeElement === element),
    true,
    'Escape closes the drawer and returns focus to its toggle',
  )

  const touchPage = await pageFor('admin', true, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  })
  await touchPage.goto('http://127.0.0.1:5179/portal/learners')
  await touchPage.getByRole('button', { name: 'Open portal navigation' }).tap()
  assert.equal(
    await touchPage.getByRole('button', { name: 'Close portal navigation' }).getAttribute('aria-expanded'),
    'true',
    'touch activation opens the mobile navigation',
  )
  await touchPage.getByRole('link', { name: 'Overview', exact: true }).tap()
  await touchPage.waitForURL('http://127.0.0.1:5179/portal')
  assert.equal(
    await touchPage.getByRole('button', { name: 'Open portal navigation' }).getAttribute('aria-expanded'),
    'false',
    'touch navigation closes the drawer after route selection',
  )
  assert.equal(
    await touchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'touch navigation remains within a narrow phone viewport',
  )

  const tablet = await pageFor('admin', true, {
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  })
  await tablet.goto('http://127.0.0.1:5179/portal/learners')
  assert.equal(
    await tablet.getByRole('button', { name: 'Open portal navigation' }).isVisible(),
    false,
    'tablet viewport uses the persistent sidebar rather than the phone drawer',
  )
  assert.equal(
    await tablet.getByRole('link', { name: 'Learners', exact: true }).isVisible(),
    true,
  )
  assert.equal(
    await tablet.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'tablet layout does not overflow horizontally',
  )
  const teacher = await pageFor('teacher', false)
  await teacher.goto('http://127.0.0.1:5179/portal/staff/login')
  await teacher.getByLabel('Phone number', { exact: true }).fill('0777123456')
  await teacher.getByLabel('Password', { exact: true }).fill('test123')
  await teacher.getByRole('button', { name: 'Sign in to portal' }).click()
  await teacher.waitForURL('**/portal')
  const recovery = await pageFor('student', false)
  await recovery.goto('http://127.0.0.1:5179/portal/student/login')
  await recovery.getByRole('button', { name: 'Forgot password?' }).click()
  await recovery.getByLabel('Phone number', { exact: true }).fill('0777123456')
  await recovery.getByRole('button', { name: 'Send recovery code' }).click()
  await recovery.getByLabel('SMS verification code').fill('123456')
  await recovery.getByRole('button', { name: 'Verify code', exact: true }).click()
  await recovery.getByRole('heading', { name: 'Choose a new password' }).waitFor()
  await recovery.getByLabel('Password', { exact: true }).fill('Replacement123!')
  await recovery.getByRole('button', { name: 'Save new password' }).click()
  await recovery.getByRole('status').filter({ hasText: 'Password changed' }).waitFor()
  const parent = await pageFor('parent')
  await parent.goto('http://127.0.0.1:5179/portal/learners')
  await parent.waitForURL('**/portal')
  assert.equal(
    await parent.getByRole('link', { name: 'Staff', exact: true }).count(),
    0,
  )
  assert.deepEqual(errors, [])
  console.log(
    'PASS: profile editing, account creation, publishing, records, timetable, payment retry, teacher sign-in, parent route guard, mobile layout; no uncaught browser errors. All backend requests were mocked.',
  )
} catch (error) {
  const p = browser.contexts()[0]?.pages()[0]
  if (p) {
    console.log((await p.locator('body').innerText()).slice(0, 4000))
    await p.screenshot({
      path: '.portal-test-tools/failure.png',
      fullPage: true,
    })
  }
  throw error
} finally {
  await browser.close()
}
