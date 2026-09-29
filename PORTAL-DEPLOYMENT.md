# Fordridge portal update

These changes are implemented locally. Do not deploy the frontend before applying the database migrations below. The Supabase CLI access check returned HTTP 403 for the account available in this session, so no production database changes or function deployments were performed.

## Deployment order

1. Sign in to Supabase using an account with access to Fordridge project `ufyegiyhnhdvxiagcjpa`.
2. Check the migration history with `supabase migration list --linked`. Apply pending migrations in order; the new files are:
   - `supabase/migrations/20260930090000_portal_workflows.sql`
   - `supabase/migrations/20260930091000_correct_term_tuition_lookup.sql`
   Use `supabase db push --linked`, after reviewing its pending list, or run these two files in order in the project's SQL editor if all earlier migrations have already been applied. Avoid maintaining two inconsistent migration histories.
3. Deploy account provisioning: `supabase functions deploy create-portal-account --project-ref ufyegiyhnhdvxiagcjpa`. The function verifies the signed-in user's admin profile; its service-role key stays in the Supabase runtime. Never put that key in frontend environment files. Keep JWT verification enabled.
4. Confirm Supabase phone authentication and an SMS provider are configured. Phone verification and password recovery require SMS delivery. Provisioning by an administrator confirms the supplied phone number, so the administrator must verify the account holder's number before creating the account.
5. Commit/push the application changes and deploy the Vercel frontend. Verify the production deployment points to this commit.

## Changes

- Teachers can sign in through the staff portal. Verification-code, password-recovery and change-password screens are available.
- Admins can create learner/teacher/staff accounts, edit school profile details and link existing parent accounts to learners. Public signup cannot select elevated roles.
- Admins can record attendance, academic marks and confidential wellbeing notes. Students and linked parents can read attendance and academic records only. An administrator can edit records they created; other administrators can read them.
- Admins and teachers can publish notices and timetable entries within their permitted campus. Draft notices are hidden from ordinary users. Timetables respect class, stream and audience settings.
- Fee payments are one database transaction, with balance locking and an idempotent request ID for in-page retries. Direct authenticated ledger inserts and fee-balance updates are disabled. Do not reload during an uncertain payment outcome; check the ledger before creating a new payment after a reload.
- Corrected the tuition settings lookup for new ordinary-level term bills. Existing fee records are deliberately unchanged. Audit previously issued bills before deciding whether they need adjustment.
- Fordridge's external Inventory & POS link is retained. No Reliance code or data is changed.

## Verification

Run `npm run build` and `npm run lint`.

Isolated database tests and mocked browser tests use optional local tools, excluded from Git:

```powershell
npm install --prefix .portal-test-tools --no-save --package-lock=false @electric-sql/pglite @playwright/test
node .portal-test-tools/node_modules/playwright/cli.js install chromium
node scripts/test-portal.mjs
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
# In another terminal:
node scripts/test-portal-browser.mjs
```

The database tests apply the complete migration history to a temporary PostgreSQL runtime and exercise permissions, atomic payment writes, retries, rollback, tuition amounts, draft visibility, class scoping and guardian access. Browser tests intercept Supabase requests and never write real school data. They do not prove real SMS delivery, Edge Function deployment or production database access.

After deployment, verify with dedicated school-approved test accounts: teacher login, admin account creation, profile editing, guardian linking, draft/published notice visibility, class timetable visibility, record access by parent/student, and fee payment/receipt consistency. Check mobile layout as each role. Do not use real payments for smoke tests.
