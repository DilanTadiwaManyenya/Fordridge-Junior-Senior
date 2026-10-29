import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GRADE_BAND_GROUPS,
  gradeBandGroupForLevel,
  gradeForPercent,
  referenceBandsFor,
  validateGradeScale,
} from '../src/portal/grade-band-rules.js'

test('Reliance grade sequence maps Fordridge class levels to Junior, O Level and A Level', () => {
  assert.equal(gradeBandGroupForLevel('ECD A'), 'primary')
  assert.equal(gradeBandGroupForLevel('Grade 7'), 'primary')
  assert.equal(gradeBandGroupForLevel(' form 4 '), 'olevel')
  assert.equal(gradeBandGroupForLevel('Lower Six'), 'alevel')
  assert.equal(gradeBandGroupForLevel('Sixth Form'), 'alevel')
  assert.equal(gradeBandGroupForLevel('unconfirmed class'), null)
  assert.deepEqual(GRADE_BAND_GROUPS.map(group => group.id), ['primary', 'olevel', 'alevel'])
})

test('Junior grade outcomes change at every Reliance minimum threshold', () => {
  const bands = referenceBandsFor('primary')
  const thresholds = [85, 77, 70, 60, 50, 40, 30, 20]
  const expected = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6', 'Unit 7', 'Unit 8', 'Unit 9']
  for (let index = 0; index < thresholds.length; index += 1) {
    assert.equal(gradeForPercent(thresholds[index], 'Grade 4', bands, null).grade, expected[index])
    assert.equal(gradeForPercent(thresholds[index] - 0.01, 'Grade 4', bands, null).grade, expected[index + 1])
  }
  assert.equal(gradeForPercent(19.99, 'ECD A', bands, null).grade, 'Unit 9')
  assert.equal(gradeForPercent(100.01, 'Grade 4', bands, null), null)
})

test('O Level and A Level outcomes use their separate threshold sequences', () => {
  const scales = [...referenceBandsFor('olevel').map(band => ({ ...band, band_group: 'olevel' })),
    ...referenceBandsFor('alevel').map(band => ({ ...band, band_group: 'alevel' }))]
  assert.equal(gradeForPercent(75, 'Form 1', scales, null).grade, 'A')
  assert.equal(gradeForPercent(74.99, 'Form 4', scales, null).grade, 'B')
  assert.equal(gradeForPercent(65, 'Form 2', scales, null).grade, 'B')
  assert.equal(gradeForPercent(64.99, 'Form 3', scales, null).grade, 'C')
  assert.equal(gradeForPercent(80, 'Lower Six', scales, null).grade, 'A')
  assert.equal(gradeForPercent(79.99, 'Upper Six', scales, null).grade, 'B')
  assert.equal(gradeForPercent(30, 'Sixth Form', scales, null).grade, 'O')
  assert.equal(gradeForPercent(29.99, 'Sixth Form', scales, null).grade, 'F')
})

test('campus scales override the global reference while legacy campus ranges remain a fallback', () => {
  const global = referenceBandsFor('olevel').map(band => ({ ...band, band_group: 'olevel', campus_id: null }))
  const override = { campus_id: 'campus-a', band_group: 'olevel', minimum_percent: 0, maximum_percent: 100, grade: 'Local', points: 1, descriptor: 'Campus approved' }
  assert.equal(gradeForPercent(90, 'Form 1', [...global, override], 'campus-a').grade, 'Local')
  assert.equal(gradeForPercent(90, 'Form 1', global, 'campus-b').grade, 'A')
  const legacy = { campus_id: 'campus-a', band_group: null, minimum_percent: 0, maximum_percent: 100, grade: 'Legacy', descriptor: 'Old campus scale' }
  assert.equal(gradeForPercent(90, 'Unconfirmed class', [legacy], 'campus-a').grade, 'Legacy')
})

test('complete scales require a gap-free, non-overlapping 0–100 partition', () => {
  const scale = referenceBandsFor('olevel')
  assert.equal(validateGradeScale(scale), '')
  assert.match(validateGradeScale([...scale, { minimum_percent: 74, maximum_percent: 74, grade: 'Extra', points: 1, descriptor: 'Overlap' }]), /gap or overlap/)
  assert.match(validateGradeScale(scale.slice(0, -1)), /full 0–100/)
  assert.match(validateGradeScale(scale.map(band => ({ ...band, points: null }))), /point value/)
})
