export const referenceExpenseCategories = [
  'Fuel',
  'Stationery',
  'Repairs',
  'Food',
  'Transport',
  'Utilities',
  'Other',
]

function localDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

export function buildIncomeExpenseEntries({ payments = [], feeRecords = [], expenses = [], campuses = [] }) {
  const feesById = new Map(feeRecords.map((fee) => [fee.id, fee]))
  const campusesById = new Map(campuses.map((campus) => [campus.id, campus]))
  const entries = payments.map((payment) => {
    const fee = feesById.get(payment.fee_record_id) || {}
    const campusId = payment.campus_id || fee.campus_id || null
    const campus = campusesById.get(campusId)
    const period = [fee.academic_term, fee.academic_year].filter(Boolean).join(' · ')
    return {
      id: `fee:${payment.id}`,
      sourceId: payment.id,
      date: localDate(payment.created_at),
      direction: 'income',
      kind: 'Fee collection',
      category: 'Learner fees',
      categoryNeedsReview: false,
      campusId,
      campus: campus ? `${campus.name}${campus.code ? ` · ${campus.code}` : ''}` : 'Unassigned campus',
      period: period || 'Period not recorded',
      currency: fee.currency || 'Unknown',
      amount: Number(payment.amount),
      reference: payment.reference || '',
      description: period ? `Learner fee payment · ${period}` : 'Learner fee payment',
      recordStatus: 'Recorded; settlement not verified',
    }
  })

  for (const expense of expenses) {
    const rawCategory = String(expense.category || '').trim()
    const referenceCategory = referenceExpenseCategories.find((category) => category === rawCategory)
    const reviewStatus = expense.review_status || 'legacy_unreviewed'
    const recordStatus = {
      pending: 'Pending Main Admin review',
      approved: 'Approved',
      rejected: 'Rejected',
      reversed: 'Reversed · no refund implied',
      legacy_unreviewed: 'Legacy · approval status unknown',
    }[reviewStatus] || 'Unknown review status'
    entries.push({
      id: `expense:${expense.id}`,
      sourceId: expense.id,
      date: localDate(expense.expense_date),
      direction: 'expense',
      kind: 'Cashbook expense',
      category: referenceCategory || rawCategory || 'Uncategorised',
      categoryNeedsReview: !referenceCategory,
      campusId: null,
      campus: 'Unassigned / not recorded',
      period: 'Not recorded',
      currency: expense.currency || 'Unknown',
      amount: Number(expense.amount),
      reference: expense.reference || '',
      description: expense.description || '',
      reviewStatus,
      recordStatus,
    })
  }

  return entries.sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id))
}

export function filterIncomeExpenseEntries(entries, filters = {}) {
  const query = (filters.query || '').trim().toLocaleLowerCase()
  return entries.filter((entry) => {
    if (filters.from && entry.date < filters.from) return false
    if (filters.to && entry.date > filters.to) return false
    if (filters.currency && filters.currency !== 'all' && entry.currency !== filters.currency) return false
    if (filters.direction && filters.direction !== 'all' && entry.direction !== filters.direction) return false
    if (filters.category && filters.category !== 'all' && entry.category !== filters.category) return false
    if (filters.campusId === 'unassigned' && entry.campusId) return false
    if (filters.campusId && !['all', 'unassigned'].includes(filters.campusId) && entry.campusId !== filters.campusId) return false
    if (query && ![
      entry.kind,
      entry.category,
      entry.campus,
      entry.period,
      entry.reference,
      entry.description,
      entry.sourceId,
    ].join(' ').toLocaleLowerCase().includes(query)) return false
    return true
  })
}

export function summarizeIncomeExpenseEntries(entries) {
  return entries.reduce((totals, entry) => {
    const currency = entry.currency || 'Unknown'
    const total = totals[currency] ||= { currency, income: 0, expenses: 0, pendingExpenses: 0, legacyUnreviewedExpenses: 0, rejectedExpenses: 0, reversedExpenses: 0, net: 0 }
    if (entry.direction === 'income') total.income += entry.amount
    if (entry.direction === 'expense' && entry.reviewStatus === 'approved') total.expenses += entry.amount
    if (entry.direction === 'expense' && entry.reviewStatus === 'pending') total.pendingExpenses += entry.amount
    if (entry.direction === 'expense' && entry.reviewStatus === 'legacy_unreviewed') total.legacyUnreviewedExpenses += entry.amount
    if (entry.direction === 'expense' && entry.reviewStatus === 'rejected') total.rejectedExpenses += entry.amount
    if (entry.direction === 'expense' && entry.reviewStatus === 'reversed') total.reversedExpenses += entry.amount
    total.net = total.income - total.expenses
    return totals
  }, {})
}

function csvCell(value) {
  let text = String(value ?? '')
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function buildIncomeExpenseCsv(entries) {
  const totals = summarizeIncomeExpenseEntries(entries)
  const rows = [
    ['Fordridge Schools · Income & expenses'],
    ['Basis', 'Recorded fee transactions and cashbook rows; not bank or cash settlement confirmation'],
    ['Currency', 'Currencies are reported separately; no conversion is performed'],
    [],
    ['Currency', 'Recorded collections', 'Approved expenses', 'Pending expenses', 'Legacy unreviewed expenses', 'Rejected expenses', 'Reversed expenses', 'Net recorded movement'],
    ...Object.values(totals).sort((a, b) => a.currency.localeCompare(b.currency)).map((total) => [
      total.currency,
      total.income,
      total.expenses,
      total.pendingExpenses,
      total.legacyUnreviewedExpenses,
      total.rejectedExpenses,
      total.reversedExpenses,
      total.net,
    ]),
    [],
    ['Date', 'Campus', 'Currency', 'Type', 'Category', 'Period', 'Reference', 'Description', 'Recorded status', 'Amount', 'Source ID'],
    ...entries.map((entry) => [
      entry.date,
      entry.campus,
      entry.currency,
      entry.kind,
      entry.category,
      entry.period,
      entry.reference,
      entry.description,
      entry.recordStatus,
      entry.amount,
      entry.sourceId,
    ]),
  ]
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
