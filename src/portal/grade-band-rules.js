export const GRADE_BAND_GROUPS = [
  { id: 'primary', label: 'Junior · ECD & Primary', applies: 'ECD to Grade 7' },
  { id: 'olevel', label: 'Senior · O Level', applies: 'Form 1 to Form 4' },
  { id: 'alevel', label: 'Senior · A Level', applies: 'Lower Six to Upper Six' },
]

export const RELIANCE_REFERENCE_BANDS = {
  primary: [
    [85, 100, 'Unit 1', 1, 'Excellent'],
    [77, 84, 'Unit 2', 2, 'Very Good'],
    [70, 76, 'Unit 3', 3, 'Good'],
    [60, 69, 'Unit 4', 4, 'Satisfactory'],
    [50, 59, 'Unit 5', 5, 'Fair'],
    [40, 49, 'Unit 6', 6, 'Pass - Lower'],
    [30, 39, 'Unit 7', 7, 'Pass - Low'],
    [20, 29, 'Unit 8', 8, 'Fail'],
    [0, 19, 'Unit 9', 9, 'Fail - Very Low'],
  ],
  olevel: [
    [75, 100, 'A', 5, 'Distinction'],
    [65, 74, 'B', 4, 'Merit'],
    [50, 64, 'C', 3, 'Credit - Pass'],
    [40, 49, 'D', 2, 'Pass'],
    [0, 39, 'E', 1, 'Fair'],
  ],
  alevel: [
    [80, 100, 'A', 5, 'Outstanding'],
    [70, 79, 'B', 4, 'Very Good'],
    [60, 69, 'C', 3, 'Good'],
    [50, 59, 'D', 2, 'Satisfactory'],
    [40, 49, 'E', 1, 'Minimum Pass'],
    [30, 39, 'O', 0, 'Subsidiary Pass'],
    [0, 29, 'F', 0, 'Fail'],
  ],
}

export const referenceBandsFor = (group) => (RELIANCE_REFERENCE_BANDS[group] || []).map(
  ([minimum_percent, maximum_percent, grade, points, descriptor]) => ({
    band_group: group,
    minimum_percent,
    maximum_percent,
    grade,
    points,
    descriptor,
  }),
)

const normalizedLevel = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function gradeBandGroupForLevel(classLevel) {
  const level = normalizedLevel(classLevel)
  if (/^ecd(?:\b|\s)/.test(level) || /^grade\s+/.test(level)) return 'primary'
  if (/^form [1-4]$/.test(level)) return 'olevel'
  if (/^(?:lower|upper) (?:six|sixth)$/.test(level) || /^sixth form$/.test(level) || /^a level(?: [12])?$/.test(level)) return 'alevel'
  return null
}

export function validateGradeScale(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return 'Add at least one grade band.'
  const rows = bands.map((band) => ({
    minimum: Number(band.minimum_percent),
    maximum: Number(band.maximum_percent),
    grade: String(band.grade || '').trim(),
    points: Number(band.points),
    pointsMissing: band.points === '' || band.points == null,
    descriptor: String(band.descriptor || '').trim(),
  })).sort((a, b) => a.minimum - b.minimum)
  if (rows.some((row) => !Number.isInteger(row.minimum) || !Number.isInteger(row.maximum)
    || row.minimum < 0 || row.maximum > 100 || row.minimum > row.maximum
    || !row.grade || !row.descriptor || row.pointsMissing || !Number.isInteger(row.points) || row.points < 0 || row.points > 9))
    return 'Use whole-number ranges from 0 to 100 and enter each grade, point value, and descriptor.'
  if (rows[0].minimum !== 0 || rows.at(-1).maximum !== 100)
    return 'The scale must cover the full 0–100 range.'
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].minimum !== rows[index - 1].maximum + 1)
      return 'The scale has a gap or overlap between score bands.'
  }
  return ''
}

export function gradeForPercent(percent, classLevel, bands, campusId) {
  const score = Number(percent)
  if (!Number.isFinite(score) || score < 0 || score > 100) return null
  const group = gradeBandGroupForLevel(classLevel)
  const relevant = Array.isArray(bands) ? bands : []
  if (group) {
    // Reliance's scales use whole-number minimum thresholds. Flooring makes
    // fractional averages resolve to the same band as those thresholds.
    const thresholdScore = Math.floor(score)
    const grouped = relevant.filter((band) => band.band_group === group)
    const campusBands = grouped.filter((band) => band.campus_id === campusId)
    const applicable = campusBands.length
      ? campusBands
      : grouped.filter((band) => band.campus_id == null)
    const match = applicable.find((band) => thresholdScore >= Number(band.minimum_percent)
      && thresholdScore <= Number(band.maximum_percent))
    if (match) return match
  }
  return relevant.find((band) => band.campus_id === campusId && band.band_group == null
    && score >= Number(band.minimum_percent) && score <= Number(band.maximum_percent)) || null
}
