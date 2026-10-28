import { parsePhoneNumberFromString } from 'libphonenumber-js'

export const learnerImportColumns = [
  'full_name',
  'phone',
  'admission_number',
  'class_level',
  'class_stream',
]

const maxLearnersPerFile = 500

function parseCsvRows(source) {
  const rows = []
  let cells = []
  let value = ''
  let quoted = false
  let quoteClosed = false
  let line = 1
  let rowLine = 1

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
        quoteClosed = true
      } else {
        value += char
        if (char === '\n') line += 1
        else if (char === '\r' && next !== '\n') line += 1
      }
      continue
    }

    if (quoteClosed && char !== ',' && char !== '\n' && char !== '\r' && !/\s/.test(char))
      throw new Error(`Unexpected character after a closing quote on line ${line}.`)

    if (char === '"') {
      if (quoteClosed || value.trim())
        throw new Error(`Unexpected quote on line ${line}.`)
      value = ''
      quoted = true
    } else if (char === ',') {
      cells.push(value.trim())
      value = ''
      quoteClosed = false
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1
      cells.push(value.trim())
      if (cells.some((cell) => cell.length)) rows.push({ line: rowLine, cells })
      cells = []
      value = ''
      quoteClosed = false
      line += 1
      rowLine = line
    } else if (!quoteClosed || !/\s/.test(char)) {
      value += char
    }
  }

  if (quoted) throw new Error(`Unclosed quoted field starting on line ${rowLine}.`)
  cells.push(value.trim())
  if (cells.some((cell) => cell.length)) rows.push({ line: rowLine, cells })
  return rows
}

export function parseLearnerImportCsv(source) {
  const records = parseCsvRows(String(source).replace(/^\uFEFF/, ''))
  const header = records.shift()?.cells
  if (!header || header.length !== learnerImportColumns.length ||
      learnerImportColumns.some((column, index) => header[index] !== column)) {
    throw new Error(`CSV must use these columns in this order: ${learnerImportColumns.join(', ')}`)
  }
  if (records.length > maxLearnersPerFile)
    throw new Error(`CSV can contain no more than ${maxLearnersPerFile} learner rows.`)

  const rows = records.map(({ line, cells }) => {
    const issues = []
    if (cells.length !== learnerImportColumns.length)
      issues.push(`Expected ${learnerImportColumns.length} columns; found ${cells.length}.`)
    const [full_name = '', phone = '', admission_number = '', class_level = '', class_stream = ''] = cells
    if (!full_name) issues.push('Full name is required.')
    const parsedPhone = parsePhoneNumberFromString(phone, 'ZW')
    const normalized_phone = parsedPhone?.isValid() ? parsedPhone.number : ''
    if (!phone) issues.push('Phone number is required.')
    else if (!normalized_phone)
      issues.push('Enter a valid phone number; local numbers use Zimbabwe as the default country.')
    return {
      line,
      full_name,
      phone,
      normalized_phone,
      admission_number,
      class_level,
      class_stream,
      issues,
    }
  })

  const markDuplicates = (key, normalize, label) => {
    const grouped = new Map()
    for (const row of rows) {
      const value = normalize(row[key])
      if (!value) continue
      grouped.set(value, [...(grouped.get(value) || []), row])
    }
    for (const duplicates of grouped.values()) {
      if (duplicates.length > 1)
        duplicates.forEach((row) => row.issues.push(`Duplicate ${label} in this file.`))
    }
  }
  markDuplicates('normalized_phone', (value) => value, 'phone number')
  markDuplicates('admission_number', (value) => value.toLowerCase(), 'admission number')

  return rows.map((row) => ({ ...row, valid: row.issues.length === 0 }))
}
