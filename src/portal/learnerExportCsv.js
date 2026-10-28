const columns = [
  ['id', 'Learner ID', true],
  ['full_name', 'Full name', false],
  ['phone_number', 'Phone number', true],
  ['admission_number', 'Admission number', true],
  ['class_level', 'Class / form', false],
  ['class_stream', 'Stream', false],
  ['enrollment_status', 'Enrolment status', false],
  ['campus_name', 'Campus', false],
]

export function escapeSpreadsheetCell(value, forceText = false) {
  const text = String(value ?? '')
  const firstNonWhitespace = text.trimStart().charAt(0)
  const startsWithFormula = ['=', '+', '@', '-'].includes(firstNonWhitespace)
  const startsWithControl = ['\t', '\r', '\n'].includes(text.charAt(0))
  const safeText = text && (forceText || startsWithFormula || startsWithControl)
    ? `'${text}`
    : text
  return `"${safeText.replaceAll('"', '""')}"`
}

export function buildLearnerExportCsv(learners) {
  const heading = columns.map(([, label]) => escapeSpreadsheetCell(label))
  const rows = learners.map((learner) => {
    const values = {
      ...learner,
      campus_name: learner.campus?.name || '',
    }
    return columns
      .map(([key, , forceText]) => escapeSpreadsheetCell(values[key], forceText))
      .join(',')
  })
  return `\uFEFF${[heading.join(','), ...rows].join('\r\n')}\r\n`
}
