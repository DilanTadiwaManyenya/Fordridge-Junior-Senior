# Stage 47 — Preserve report release and audit

Status: Implemented and locally verified; production migration pending.

## Delivered

- Added a database trigger that assigns a newly published report to the authenticated administrator, ignoring a client-supplied `published_by` value.
- Prevents changing the recorded publisher while the report remains published.
- Prevents changing campus, academic year, or term while a report is published, preserving its released period identity.
- Clears publisher attribution when a report is returned to draft. Existing audit trigger records the acting administrator and the academic year/term for that transition.
- Withdraws the matching report announcement from active feeds on return-to-draft, retaining its campus, period, and original author record for traceability.
- Verified the release announcement retains the same campus, academic period, authenticated author, and student/parent audience as the publication.
- Confirmed a failed publisher-tampering update does not create a misleading release record.
- Added a mocked browser check that the release workflow sends the signed-in user's ID. No live Supabase calls were made.

## Validation

- `node scripts/test-portal.mjs` — passed the publication attribution, spoof rejection, audit detail, announcement context, and return-to-draft audit checks using isolated PGlite synthetic data.
- `node scripts/test-portal-browser.mjs` with installed Chrome — passed the mocked report-release workflow and full browser regression suite. All backend requests were mocked.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; existing bundle-size warning remains.
- `git diff --check` — passed.

## Release state and next stage

Migration `20261029150000_report_publication_actor.sql` has not been applied to production. The frontend has not been deployed. Stage 48 (protected report snapshots) follows next. Earlier migrations and frontend releases remain subject to the production deployment/approval process.
