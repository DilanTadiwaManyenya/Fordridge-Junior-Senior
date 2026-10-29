import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import { canReviewIncomeExpenses } from './navigation'
import {
  buildIncomeExpenseCsv,
  buildIncomeExpenseEntries,
  filterIncomeExpenseEntries,
  referenceExpenseCategories,
  summarizeIncomeExpenseEntries,
} from './income-expense-review'
import './income-expenses.css'

const pageSize = 500
const money = (amount, currency) => {
  if (currency === 'Unknown') return `${Number(amount).toFixed(2)} · currency not recorded`
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`
  }
}

async function readAllRows(makeQuery) {
  const rows = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery().range(start, start + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

function downloadCsv(entries) {
  const url = URL.createObjectURL(new Blob([buildIncomeExpenseCsv(entries)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'fordridge-income-expenses.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function IncomeExpenses({ profile }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [filters, setFilters] = useState({ query: '', direction: 'all', category: 'all', currency: 'all', campusId: 'all', from: '', to: '' })

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        if (!supabase) throw new Error('Finance records are unavailable because the database is not configured.')
        const [payments, feeRecords, expenses, campuses] = await Promise.all([
          readAllRows(() => supabase.from('fee_transactions').select('id,fee_record_id,campus_id,amount,reference,created_at').order('created_at', { ascending: false })),
          readAllRows(() => supabase.from('fee_records').select('id,campus_id,currency,academic_year,academic_term').order('id')),
          readAllRows(() => supabase.from('cashbook_expenses').select('id,expense_date,category,description,amount,currency,reference,review_status,correction_of,reversal_reason,review_reason').order('expense_date', { ascending: false })),
          readAllRows(() => supabase.from('campuses').select('id,name,code').order('name')),
        ])
        if (active) setEntries(buildIncomeExpenseEntries({ payments, feeRecords, expenses, campuses }))
      } catch (cause) {
        if (active) setError(workflowError(cause))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [reload])

  const filtered = useMemo(() => filterIncomeExpenseEntries(entries, filters), [entries, filters])
  const totals = useMemo(() => summarizeIncomeExpenseEntries(filtered), [filtered])
  const currencies = [...new Set(entries.map((entry) => entry.currency))].sort()
  const campuses = [...new Map(entries.filter((entry) => entry.campusId).map((entry) => [entry.campusId, { id: entry.campusId, name: entry.campus }])).values()]
  const categories = [...new Set(['Learner fees', ...referenceExpenseCategories, ...entries.map((entry) => entry.category)])].sort((a, b) => a.localeCompare(b))
  const hasFilters = Boolean(filters.query || filters.from || filters.to || filters.currency !== 'all' || filters.direction !== 'all' || filters.category !== 'all' || filters.campusId !== 'all')

  if (!canReviewIncomeExpenses(profile?.role)) {
    return <section className="income-expenses"><h1>Income &amp; expenses</h1><p role="alert">Main Admin access is required to review the unassigned cashbook records.</p></section>
  }

  return <section className="income-expenses" aria-labelledby="income-expenses-title">
    <header className="income-expenses-header">
      <div><p className="eyebrow">Finance</p><h1 id="income-expenses-title">Income &amp; expenses</h1><p>Review recorded fee collections and cashbook outgoings in separate currencies.</p></div>
      <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </header>
    <aside className="income-expenses-notice">
      These are portal records, not confirmation of bank or cash settlement. Cashbook entries have no campus attribution and remain unassigned. Only approved expenses reduce net recorded movement; legacy, pending, rejected, and reversed amounts are shown separately. POS data is not connected to this view.
    </aside>
    {filters.campusId !== 'all' && filters.campusId !== 'unassigned' && <p className="income-expenses-scope-note" role="note">Campus filtering excludes legacy cashbook expenses because Fordridge has no campus attribution for those rows.</p>}
    <section className="income-expenses-filters" aria-label="Income and expense filters">
      <label>Search<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Category, reference, description…" /></label>
      <label>Type<select value={filters.direction} onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value }))}><option value="all">All records</option><option value="income">Collections</option><option value="expense">Expenses</option></select></label>
      <label>Category<select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="all">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Currency<select value={filters.currency} onChange={(event) => setFilters((current) => ({ ...current, currency: event.target.value }))}><option value="all">All currencies</option>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <label>Campus<select value={filters.campusId} onChange={(event) => setFilters((current) => ({ ...current, campusId: event.target.value }))}><option value="all">All campus records</option><option value="unassigned">Unassigned expenses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
      <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
      <div className="income-expenses-filter-actions">
        <button type="button" onClick={() => downloadCsv(filtered)} disabled={loading || !filtered.length}>Export filtered CSV</button>
        <button type="button" className="secondary" onClick={() => setFilters({ query: '', direction: 'all', category: 'all', currency: 'all', campusId: 'all', from: '', to: '' })} disabled={!hasFilters}>Clear filters</button>
      </div>
    </section>
    {error && <div className="income-expenses-error" role="alert"><p>{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
    {loading ? <p className="income-expenses-state" role="status">Loading recorded finance entries…</p> : <>
      <div className="income-expenses-totals" aria-label="Filtered totals">
        {Object.values(totals).sort((a, b) => a.currency.localeCompare(b.currency)).map((total) => <article key={total.currency}>
          <h2>{total.currency}</h2><dl><div><dt>Recorded collections</dt><dd>{money(total.income, total.currency)}</dd></div><div><dt>Approved expenses</dt><dd>{money(total.expenses, total.currency)}</dd></div><div><dt>Pending review</dt><dd>{money(total.pendingExpenses, total.currency)}</dd></div><div><dt>Legacy unreviewed</dt><dd>{money(total.legacyUnreviewedExpenses, total.currency)}</dd></div><div><dt>Rejected expenses</dt><dd>{money(total.rejectedExpenses, total.currency)}</dd></div><div><dt>Reversed expenses</dt><dd>{money(total.reversedExpenses, total.currency)}</dd></div><div><dt>Net recorded movement</dt><dd>{money(total.net, total.currency)}</dd></div></dl>
        </article>)}
        {!Object.keys(totals).length && <p>No totals match the selected filters.</p>}
      </div>
      <section className="income-expenses-table-card" aria-label="Income and expense records">
        <p className="income-expenses-count">{filtered.length.toLocaleString()} record(s) · totals and CSV use the same filtered rows</p>
        <div className="income-expenses-table-scroll"><table><thead><tr><th>Date</th><th>Campus</th><th>Currency</th><th>Type</th><th>Category</th><th>Period</th><th>Reference / description</th><th>Record status</th><th>Amount</th></tr></thead>
          <tbody>{filtered.map((entry) => <tr key={entry.id}>
            <td>{entry.date || 'Date not recorded'}</td><td>{entry.campus}</td><td>{entry.currency}</td><td>{entry.kind}</td>
            <td>{entry.category}{entry.categoryNeedsReview && <small className="income-expenses-review-tag">Needs category review · original value retained</small>}</td>
            <td>{entry.period}</td><td>{entry.reference || '—'}{entry.description && <small>{entry.description}</small>}</td><td>{entry.recordStatus}</td><td>{money(entry.amount, entry.currency)}</td>
          </tr>)}</tbody>
        </table></div>
        {!filtered.length && <p className="income-expenses-state">No finance records match the selected filters.</p>}
      </section>
    </>}
  </section>
}
