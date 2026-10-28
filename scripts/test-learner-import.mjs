import assert from 'node:assert/strict'
import { parseLearnerImportCsv } from '../src/portal/learnerImportCsv.js'

const header = 'full_name,phone,admission_number,class_level,class_stream'
const parsed = parseLearnerImportCsv(
  `${header}\r\n"Smith, Jane",0787600111,F001,"Form 1","Blue, East"\r\n"O""Brien\nHouse",+263777001122,F002,Form 1,\r\n`,
)
assert.equal(parsed.length, 2)
assert.equal(parsed[0].full_name, 'Smith, Jane')
assert.equal(parsed[0].class_stream, 'Blue, East')
assert.equal(parsed[0].line, 2)
assert.equal(parsed[0].valid, true)
assert.equal(parsed[1].full_name, 'O"Brien\nHouse')
assert.equal(parsed[1].line, 3)

const duplicateRows = parseLearnerImportCsv(
  `${header}\nA,0787600111,F001,Form 1,\nB,+263787600111,F001,Form 2,`,
)
assert.equal(duplicateRows.every((row) => !row.valid), true)
assert.match(duplicateRows[0].issues.join(' '), /Duplicate phone number/)
assert.match(duplicateRows[1].issues.join(' '), /Duplicate admission number/)

const invalidRows = parseLearnerImportCsv(`${header}\n,not-a-phone,F003,Form 1,`)
assert.equal(invalidRows[0].valid, false)
assert.match(invalidRows[0].issues.join(' '), /Full name is required/)
assert.match(invalidRows[0].issues.join(' '), /valid phone number/)

assert.throws(() => parseLearnerImportCsv(`${header}\n"Unclosed,0787600111,F001,Form 1,`), /Unclosed quoted field/)
assert.throws(() => parseLearnerImportCsv('name,phone\nA,0787600111'), /must use these columns/)

console.log('PASS: quoted commas, escaped quotes, multiline fields, row locations, required fields, duplicate values, and malformed CSV rejection.')
