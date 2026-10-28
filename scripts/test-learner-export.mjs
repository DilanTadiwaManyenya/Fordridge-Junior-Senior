import assert from 'node:assert/strict'
import { buildLearnerExportCsv, escapeSpreadsheetCell } from '../src/portal/learnerExportCsv.js'

assert.equal(escapeSpreadsheetCell('00123', true), '"\'00123"')
assert.equal(escapeSpreadsheetCell('=HYPERLINK("https://bad.example")'), '"\'=HYPERLINK(""https://bad.example"")"')
assert.equal(escapeSpreadsheetCell('  +CMD'), '"\'  +CMD"')
assert.equal(escapeSpreadsheetCell('\t=CMD'), '"\'\t=CMD"')
assert.equal(escapeSpreadsheetCell('', true), '""')
assert.equal(escapeSpreadsheetCell('O"Brien, Jane'), '"O""Brien, Jane"')

const csv = buildLearnerExportCsv([
  {
    id: '00000000-0000-4000-8000-000000000001',
    full_name: '=2+2',
    phone_number: '+263787600111',
    admission_number: '00123',
    class_level: 'Form 1',
    class_stream: 'Blue, East',
    enrollment_status: 'active',
    campus: { name: 'Junior School' },
  },
])
assert.equal(csv.startsWith('\uFEFF'), true)
assert.match(csv, /"'00000000-0000-4000-8000-000000000001"/)
assert.match(csv, /"'=2\+2"/)
assert.match(csv, /"'\+263787600111"/)
assert.match(csv, /"'00123"/)
assert.match(csv, /"Blue, East"/)
assert.match(csv, /"Junior School"/)

console.log('PASS: CSV quoting, formula-injection neutralization, and text-preserving learner, phone, and admission IDs.')
