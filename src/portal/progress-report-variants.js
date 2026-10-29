import { gradeBandGroupForLevel, gradeForPercent } from './grade-band-rules.js'

const VARIANTS = {
  primary: {
    id: 'junior',
    title: 'Junior progress report',
    context: 'Junior School · recorded learning assessments only. No unconfigured report-card components are inferred.',
    subjectHeading: 'Learning area / assessment',
  },
  olevel: {
    id: 'senior',
    title: 'Senior progress report',
    context: 'Senior School · Markbook scores determine the current average. Course Work is listed separately and excluded.',
    subjectHeading: 'Subject / assessment',
  },
  alevel: {
    id: 'sixth_form',
    title: 'Sixth Form progress report',
    context: 'Sixth Form · provisional A Level grade sequence. Course Work is excluded; no subject weighting or aggregate points are assumed.',
    subjectHeading: 'Subject / assessment',
  },
  general: {
    id: 'general',
    title: 'Academic progress report',
    context: 'This class label is not mapped to a school-level report variant. Review the class label and configured legacy grade bands.',
    subjectHeading: 'Subject / assessment',
  },
}

export function progressReportVariant(classLevel) {
  return VARIANTS[gradeBandGroupForLevel(classLevel) || 'general']
}

export function progressReportSummary(records, classLevel, bands, campusId) {
  const rows = Array.isArray(records) ? records : []
  const markbook = rows.filter(record => record.assessment_type !== 'coursework')
  const percentages = markbook.map(record => {
    const score = Number(record.score)
    const maximum = Number(record.max_score)
    if (record.score == null || record.max_score == null || !Number.isFinite(score)
      || !Number.isFinite(maximum) || maximum <= 0 || score < 0 || score > maximum) return null
    return score / maximum * 100
  }).filter(value => value != null)
  const average = percentages.length
    ? percentages.reduce((total, value) => total + value, 0) / percentages.length
    : null

  return {
    average,
    gradeBand: average == null ? null : gradeForPercent(average, classLevel, bands, campusId),
    markbookCount: percentages.length,
    courseworkCount: rows.filter(record => record.assessment_type === 'coursework').length,
  }
}
