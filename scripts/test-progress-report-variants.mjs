import assert from 'node:assert/strict'
import { referenceBandsFor } from '../src/portal/grade-band-rules.js'
import { progressReportSummary, progressReportVariant } from '../src/portal/progress-report-variants.js'

assert.equal(progressReportVariant('Grade 4').id, 'junior')
assert.equal(progressReportVariant('Form 4').id, 'senior')
assert.equal(progressReportVariant('Upper Six').id, 'sixth_form')
assert.equal(progressReportVariant('Unknown').id, 'general')

const juniorSummary = progressReportSummary([
  { assessment_type: 'markbook', score: 45, max_score: 50 },
  { assessment_type: 'markbook', score: 8, max_score: 10 },
  { assessment_type: 'coursework', score: 0, max_score: 1 },
  { assessment_type: 'markbook', score: null, max_score: null },
], 'Grade 4', referenceBandsFor('primary'), 'junior-campus')
assert.equal(juniorSummary.average, 85)
assert.equal(juniorSummary.gradeBand.grade, 'Unit 1')
assert.equal(juniorSummary.markbookCount, 2)
assert.equal(juniorSummary.courseworkCount, 1)

const seniorSummary = progressReportSummary([
  { assessment_type: 'markbook', score: 74, max_score: 100 },
  { assessment_type: 'coursework', score: 100, max_score: 100 },
], 'Form 3', referenceBandsFor('olevel'), 'senior-campus')
assert.equal(seniorSummary.average, 74)
assert.equal(seniorSummary.gradeBand.grade, 'B')
assert.equal(seniorSummary.courseworkCount, 1)

const sixthFormSummary = progressReportSummary([
  { assessment_type: 'markbook', score: 70, max_score: 100 },
], 'Lower Six', referenceBandsFor('alevel'), 'senior-campus')
assert.equal(sixthFormSummary.gradeBand.grade, 'B')
assert.equal(sixthFormSummary.gradeBand.points, 4)

const noMarkbook = progressReportSummary([
  { assessment_type: 'coursework', score: 35, max_score: 50 },
], 'Lower Six', referenceBandsFor('alevel'), 'senior-campus')
assert.equal(noMarkbook.average, null)
assert.equal(noMarkbook.gradeBand, null)

console.log('PASS: Junior, Senior, Sixth Form and unmapped variants use their class-level scale; markbook averages exclude coursework and incomplete marks.')
