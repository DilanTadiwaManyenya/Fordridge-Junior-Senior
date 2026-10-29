'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import './fordridge-fees-dashboard.css'
import { workflowError } from './workflow'

const money = (value, currency = 'USD') => {
  const amount = Number(value || 0)
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency || 'Currency not set'} ${amount.toFixed(2)}`
  }
}
const title = (value) =>
  value ? value[0].toUpperCase() + value.slice(1) : 'Pending'
const feeKeys = [
  'fee_olevel_zimsec',
  'fee_olevel_cambridge',
  'fee_alevel_arts',
  'fee_alevel_comm',
  'fee_alevel_comm_sci',
  'fee_alevel_sci_zimsec',
  'fee_alevel_sci_cambridge',
  'fee_sports',
  'fee_development',
  'fee_bus',
]
const newFee = () => ({
  student_id: '',
  form: 'Form 1',
  curriculum: 'ZIMSEC',
  terms_enrolled: '1',
  academic_year: String(new Date().getFullYear()),
  academic_term: 'Term 1',
  due_date: '',
})

export default function FeesDashboard({ profile, user }) {
  const isAdmin = profile?.role === 'admin'
  const isPrincipal = profile?.role === 'principal'
  const isAccountant = profile?.role === 'accountant'
  const canReviewFinance = isAdmin || isPrincipal || isAccountant
  const canRecordPayment = isAdmin || isAccountant
  const canViewCampusLedger = isPrincipal || isAccountant
  const paymentRequest = useRef(null)
  const paymentLock = useRef(false)
  const [pendingPayment, setPendingPayment] = useState(false)
  const [records, setRecords] = useState([]),
    [students, setStudents] = useState([]),
    [settings, setSettings] = useState([]),
    [transactions, setTransactions] = useState([])
  const [reconciliation, setReconciliation] = useState(null)
  const [reconciliationLoading, setReconciliationLoading] = useState(true)
  const [reconciliationError, setReconciliationError] = useState('')
  const [reconciliationFilters, setReconciliationFilters] = useState({ campusId: '', year: '', term: '' })
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null),
    [payment, setPayment] = useState({
      amount: '',
      method: 'bank_transfer',
      reference: '',
    }),
    [createOpen, setCreateOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [draft, setDraft] = useState(newFee)
  const [receipt, setReceipt] = useState(null)
  const loadRecords = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const r = isPrincipal
        ? await supabase.rpc('principal_finance_fee_records')
        : isAccountant
          ? await supabase.rpc('accountant_finance_fee_records')
          : await supabase
            .from('fee_records')
            .select(
              'id,campus_id,amount,paid_amount,currency,due_date,status,payment_reference,academic_year,academic_term,student:profiles!fee_records_student_id_fkey(full_name),campus:campuses!fee_records_campus_id_fkey(name,code)',
            )
            .order('due_date')
      if (r.error) setError(r.error.message)
      else
        setRecords(
          isPrincipal || isAccountant
            ? (r.data || []).map((item) => ({
                ...item,
                student: { full_name: item.student_name },
                campus: { name: item.campus_name, code: item.campus_code },
              }))
            : r.data || [],
        )
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setLoading(false)
    }
  }, [isPrincipal, isAccountant])
  const loadAdmin = useCallback(async () => {
    if (!supabase) return
    try {
      if (isPrincipal || isAccountant) {
        const [fees, ledger] = await Promise.all([
          supabase
            .from('fee_settings')
            .select('setting_key,setting_value')
            .order('setting_key'),
          supabase
            .from('fee_transactions')
            .select('id,fee_record_id,amount,payment_method,reference,created_at')
            .order('created_at', { ascending: false })
            .limit(100),
        ])
        if (fees.error || ledger.error)
          setError(fees.error?.message || ledger.error?.message)
        else {
          setSettings(fees.data || [])
          setTransactions(ledger.data || [])
        }
        return
      }
      if (!isAdmin) return
      const [learners, fees] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name')
          .eq('role', 'student')
          .order('full_name'),
        supabase
          .from('fee_settings')
          .select('setting_key,setting_value')
          .order('setting_key'),
      ])
      if (learners.error || fees.error)
        setError(learners.error?.message || fees.error?.message)
      else {
        setStudents(learners.data || [])
        setSettings(fees.data || [])
      }
    } catch (err) {
      setError(workflowError(err))
    }
  }, [isAdmin, isPrincipal, isAccountant])
  const loadReconciliation = useCallback(async () => {
    if (!supabase || !canReviewFinance) return
    setReconciliationLoading(true)
    setReconciliationError('')
    try {
      const { data, error: queryError } = await supabase.rpc('preview_fee_reconciliation', {
        p_campus_id: isAdmin ? reconciliationFilters.campusId || null : null,
        p_academic_year: reconciliationFilters.year ? Number(reconciliationFilters.year) : null,
        p_academic_term: reconciliationFilters.term || null,
      })
      if (queryError) setReconciliationError(workflowError(queryError))
      else setReconciliation(data)
    } catch (err) {
      setReconciliationError(workflowError(err))
    } finally {
      setReconciliationLoading(false)
    }
  }, [canReviewFinance, isAdmin, reconciliationFilters])
  useEffect(() => {
    loadRecords()
    loadAdmin()
  }, [loadRecords, loadAdmin])
  useEffect(() => { loadReconciliation() }, [loadReconciliation])
  const rows = useMemo(
    () =>
      records.map((r) => {
        const due = Number(r.amount || 0),
          paid = Number(r.paid_amount || 0),
          balance = Math.max(0, due - paid)
        return {
          ...r,
          due,
          paid,
          balance,
          calculatedStatus:
            paid >= due && due > 0
              ? 'paid'
              : balance > 0 &&
                  r.due_date &&
                  new Date(`${r.due_date}T00:00:00`) < new Date()
                ? 'overdue'
                : r.status,
        }
      }),
    [records],
  )
  const shown = rows.filter(
    (r) =>
      (status === 'all' || r.calculatedStatus === status) &&
      `${r.student?.full_name || ''} ${r.campus?.name || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const totalsByCurrency = useMemo(() => {
    const totals = new Map()
    for (const row of rows) {
      const currency = row.currency || 'Unknown'
      const total = totals.get(currency) || { currency, due: 0, paid: 0, outstanding: 0 }
      total.due += row.due
      total.paid += row.paid
      total.outstanding += row.balance
      totals.set(currency, total)
    }
    return [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency))
  }, [rows])
  const reconciliationCampuses = [...new Map(rows.filter(row => row.campus_id).map(row => [row.campus_id, { id: row.campus_id, name: row.campus?.name || 'Campus' }])).values()]
  const reconciliationYears = [...new Set(rows.map(row => row.academic_year).filter(Boolean))].sort((left, right) => right - left)
  const reconciliationTerms = [...new Set(rows.filter(row => !reconciliationFilters.year || String(row.academic_year) === reconciliationFilters.year).map(row => row.academic_term).filter(Boolean))].sort()
  async function recordPayment(e) {
    e.preventDefault()
    if (paymentLock.current) return
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > selected.balance)
      return setError(
        'Enter a payment no greater than the outstanding balance.',
      )
    paymentLock.current = true
    setSaving(true)
    setError('')
    // Preserve the payload and request ID after an uncertain network outcome.
    paymentRequest.current ||= {
      p_fee_id: selected.id,
      p_amount: amount,
      p_method: payment.method,
      p_reference: payment.reference || null,
      p_request_id: crypto.randomUUID(),
    }
    try {
      const result = await supabase.rpc(
        'record_fee_payment',
        paymentRequest.current,
      )
      if (result.error) {
        if (
          ['P0001', '23514', '23502', '22P02', '42501', 'PGRST202'].includes(
            result.error.code,
          )
        )
          paymentRequest.current = null
        throw result.error
      }
      const transaction = result.data
      setReceipt({
        transactionId: transaction.id,
        feeRecordId: transaction.fee_record_id,
        amount: Number(transaction.amount),
        currency: selected.currency || 'USD',
        method: transaction.payment_method,
        reference: transaction.reference,
        recordedAt: transaction.created_at,
        learnerName: selected.student?.full_name || 'Learner record',
      })
      paymentRequest.current = null
      setSelected(null)
      await loadRecords()
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setPendingPayment(!!paymentRequest.current)
      paymentLock.current = false
      setSaving(false)
    }
  }
  async function createRecord(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const r = await supabase.rpc('create_term_fee_record', {
        p_student_id: draft.student_id,
        p_form: draft.form,
        p_curriculum: draft.curriculum,
        p_terms_enrolled: Number(draft.terms_enrolled),
        p_academic_year: Number(draft.academic_year),
        p_academic_term: draft.academic_term,
        p_due_date: draft.due_date || null,
      })
      if (r.error) setError(r.error.message)
      else {
        setDraft(newFee())
        setCreateOpen(false)
        await loadRecords()
      }
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setSaving(false)
    }
  }
  async function saveSettings(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const r = await supabase.from('fee_settings').upsert(
        settings.map((s) => ({
          ...s,
          setting_value: Number(s.setting_value),
          updated_by: user.id,
        })),
        { onConflict: 'setting_key' },
      )
      if (r.error) setError(r.error.message)
      else setSettingsOpen(false)
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setSaving(false)
    }
  }
  if (!isSupabaseConfigured)
    return (
      <section className="fordridge-fees-dashboard">
        <p className="fees-message">
          Fees tracking will be available after Fordridge Supabase is
          configured.
        </p>
      </section>
    )
  const close = (fn) => (
    <button
      type="button"
      className="fees-close"
      onClick={fn}
      disabled={saving || pendingPayment}
      aria-label="Close"
    >
      ×
    </button>
  )
  return (
    <section className="fordridge-fees-dashboard">
      <header className="fees-header">
        <div>
          <p className="fees-eyebrow">Fordridge Junior &amp; Senior School</p>
          <h1>Fees tracking</h1>
          <p>
            {isAdmin
              ? 'Create server-calculated term fees and record verified payments.'
              : isPrincipal
                ? 'Read-only view of your campus fee records and the school fee schedule.'
                : isAccountant
                  ? 'Review your campus fee records and record payments. Charges and reversals require an administrator.'
                : 'View the fee records available to your account.'}
          </p>
        </div>
        <div>
          {isAdmin && (
            <>
              <button
                className="fees-refresh"
                onClick={() => setCreateOpen(true)}
              >
                Create term fee
              </button>
              <button
                className="fees-refresh"
                onClick={() => setSettingsOpen(true)}
              >
                Fee settings
              </button>
            </>
          )}
          <button className="fees-refresh" onClick={loadRecords}>
            Refresh
          </button>
        </div>
      </header>
      {canReviewFinance && (
        <div className="fees-summary">
          {totalsByCurrency.length ? totalsByCurrency.map(total => <div className="fees-currency-summary" key={total.currency}>
            <h2>{total.currency} totals</h2>
            <article><span>Fees billed ({total.currency})</span><strong>{money(total.due, total.currency)}</strong></article>
            <article><span>Payments received ({total.currency})</span><strong>{money(total.paid, total.currency)}</strong></article>
            <article className="fees-outstanding"><span>Outstanding ({total.currency})</span><strong>{money(total.outstanding, total.currency)}</strong></article>
          </div>) : <p className="fees-message">No fee balances to summarize.</p>}
        </div>
      )}
      {receipt && <section className="fees-receipt" aria-labelledby="fees-receipt-heading">
        <div className="fees-receipt-actions"><span className="fees-status paid">Recorded</span><button type="button" className="fees-refresh" onClick={() => window.print()}>Print receipt</button></div>
        <p className="fees-eyebrow">Fordridge Schools · Finance</p>
        <h2 id="fees-receipt-heading">Payment receipt</h2>
        <p className="fees-receipt-lead">Payment recorded for {receipt.learnerName}.</p>
        <dl>
          <div><dt>Amount received</dt><dd>{money(receipt.amount, receipt.currency)}</dd></div>
          <div><dt>Payment method</dt><dd>{title(receipt.method?.replaceAll('_', ' '))}</dd></div>
          <div><dt>Recorded at</dt><dd>{receipt.recordedAt ? new Date(receipt.recordedAt).toLocaleString('en-ZW') : 'Time not returned'}</dd></div>
          <div><dt>Reference</dt><dd>{receipt.reference || 'Not provided'}</dd></div>
          <div><dt>Fee record</dt><dd>{receipt.feeRecordId}</dd></div>
          <div><dt>Ledger transaction ID</dt><dd className="fees-receipt-id">{receipt.transactionId}</dd></div>
        </dl>
        <p className="fees-receipt-note">This receipt is linked to the recorded payment transaction. Keep the transaction ID for finance enquiries.</p>
      </section>}
      {canReviewFinance && <section className="fees-card fees-reconciliation" aria-labelledby="fees-reconciliation-heading">
        <header className="fees-reconciliation-heading">
          <div><h2 id="fees-reconciliation-heading">Balance &amp; currency reconciliation</h2><p>Read-only comparison of fee-record balances with recorded payment transactions. Totals stay grouped by campus, academic period, and the linked fee currency; payment rows do not store a separate currency. No exchange rate is assumed.</p></div>
          <button type="button" className="fees-refresh" onClick={loadReconciliation} disabled={reconciliationLoading}>{reconciliationLoading ? 'Checking…' : 'Refresh reconciliation'}</button>
        </header>
        <div className="fees-controls" aria-label="Reconciliation filters">
          {isAdmin && <label>Campus
            <select value={reconciliationFilters.campusId} onChange={event => setReconciliationFilters(value => ({ ...value, campusId: event.target.value }))}>
              <option value="">All campuses</option>
              {reconciliationCampuses.map(campus => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>}
          <label>Academic year
            <select value={reconciliationFilters.year} onChange={event => setReconciliationFilters(value => ({ ...value, year: event.target.value, term: '' }))}>
              <option value="">All years</option>
              {reconciliationYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label>Academic term
            <select value={reconciliationFilters.term} onChange={event => setReconciliationFilters(value => ({ ...value, term: event.target.value }))}>
              <option value="">All terms</option>
              {reconciliationTerms.map(term => <option key={term} value={term}>{term}</option>)}
            </select>
          </label>
        </div>
        {reconciliationError && <p className="fees-error" role="alert">{reconciliationError}</p>}
        {reconciliationLoading ? <p className="fees-message" role="status">Checking fee and payment totals…</p> : !reconciliationError && <>
          <p className="fees-reconciliation-count" role="status">{reconciliation?.record_count || 0} fee record(s) checked · {reconciliation?.anomaly_count || 0} reconciliation exception(s)</p>
          <div className="fees-table-wrap"><table>
            <thead><tr><th>Campus</th><th>Period</th><th>Currency</th><th>Records</th><th>Charges</th><th>Paid on fee records</th><th>Payments in ledger</th><th>Outstanding</th><th>Exceptions</th></tr></thead>
            <tbody>{(reconciliation?.periods || []).map((period, index) => <tr key={`${period.campus_id}-${period.academic_year}-${period.academic_term}-${period.currency}-${index}`}>
              <td>{period.campus_name}</td>
              <td>{period.academic_year && period.academic_term ? `${period.academic_term} ${period.academic_year}` : 'Period not assigned'}</td>
              <td>{period.currency || 'Not recorded'}</td>
              <td>{period.fee_record_count}</td>
              <td>{money(period.charges, period.currency || 'USD')}</td>
              <td>{money(period.paid_on_fee_records, period.currency || 'USD')}</td>
              <td>{money(period.payments_in_ledger, period.currency || 'USD')}</td>
              <td>{money(period.outstanding, period.currency || 'USD')}</td>
              <td>{period.exception_count}</td>
            </tr>)}</tbody>
          </table></div>
          {!reconciliation?.periods?.length && <p className="fees-message">No fee records match these filters.</p>}
          {reconciliation?.anomaly_count > 0 && <>
            <h3 className="fees-reconciliation-subheading">Records needing review{reconciliation.anomalies_truncated ? ' · first 200 shown' : ''}</h3>
            <div className="fees-table-wrap"><table>
              <thead><tr><th>Learner</th><th>Campus / period</th><th>Currency</th><th>Fee record</th><th>Paid on record</th><th>Payments in ledger</th><th>Issue</th></tr></thead>
              <tbody>{reconciliation.anomalies.map(item => <tr key={item.fee_record_id}>
                <td>{item.student_name || 'Learner record'}</td>
                <td>{item.campus_name} · {item.academic_year && item.academic_term ? `${item.academic_term} ${item.academic_year}` : 'Period not assigned'}</td>
                <td>{item.currency || 'Not recorded'}</td>
                <td>{item.fee_record_id}</td>
                <td>{money(item.paid_on_fee_record, item.currency || 'USD')}</td>
                <td>{money(item.payments_in_ledger, item.currency || 'USD')}</td>
                <td>{item.anomaly_types.map(issue => issue.replaceAll('_', ' ')).join(', ')}</td>
              </tr>)}</tbody>
            </table></div>
          </>}
        </>}
      </section>}
      {canViewCampusLedger && (
        <section className="fees-card" aria-label="Read-only fee schedule">
          <h2>School fee schedule</h2>
          <p>Reference amounts only. Changes require an authorised administrator.</p>
          <div className="fees-table-wrap">
            <table>
              <thead><tr><th>Fee setting</th><th>Amount</th></tr></thead>
              <tbody>
                {settings.filter((item) => feeKeys.includes(item.setting_key)).map((item) => (
                  <tr key={item.setting_key}>
                    <td>{item.setting_key.replaceAll('_', ' ')}</td>
                    <td>{money(item.setting_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {canViewCampusLedger && (
        <section className="fees-card" aria-label="Read-only payment ledger">
          <h2>Recent payments</h2>
          <div className="fees-table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Fee record</th><th>Method</th><th>Reference</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.created_at).toLocaleDateString('en-ZW')}</td>
                    <td>{item.fee_record_id}</td>
                    <td>{item.payment_method.replaceAll('_', ' ')}</td>
                    <td>{item.reference || '—'}</td>
                    <td>{Number(item.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!transactions.length && <p className="fees-message">No payments are available for this campus.</p>}
          </div>
        </section>
      )}
      <section className="fees-card">
        <div className="fees-controls">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search learner or campus"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        {error && <p className="fees-error">{error}</p>}
        {loading ? (
          <p className="fees-message">Loading fee records…</p>
        ) : (
          <div className="fees-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Campus</th>
                  <th>Term</th>
                  <th>Due date</th>
                  <th>Fee due</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  {canRecordPayment && <th />}
                </tr>
              </thead>
              <tbody>
                {shown.length ? (
                  shown.map((r) => (
                    <tr key={r.id}>
                      <td>{r.student?.full_name || 'Learner record'}</td>
                      <td>{r.campus?.name || 'Assigned campus'}</td>
                      <td>
                        {r.academic_term && r.academic_year
                          ? `${r.academic_term} ${r.academic_year}`
                          : '—'}
                      </td>
                      <td>{r.due_date || '—'}</td>
                      <td>{money(r.due, r.currency)}</td>
                      <td>{money(r.paid, r.currency)}</td>
                      <td className={r.balance ? 'balance' : ''}>
                        {money(r.balance, r.currency)}
                      </td>
                      <td>
                        <span className={`fees-status ${r.calculatedStatus}`}>
                          {title(r.calculatedStatus)}
                        </span>
                      </td>
                      {canRecordPayment && (
                        <td>
                          <button
                            className="fees-collect"
                            disabled={!r.balance}
                            onClick={() => {
                              setReceipt(null)
                              setSelected(r)
                              setPayment({
                                amount: String(r.balance),
                                method: 'bank_transfer',
                                reference: '',
                              })
                            }}
                          >
                            Record payment
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canRecordPayment ? 9 : 8} className="fees-message">
                      No fee records match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <div className="fees-modal-backdrop">
          <form className="fees-modal" onSubmit={recordPayment}>
            {close(() => setSelected(null))}
            <p className="fees-eyebrow">Payment collection</p>
            {error && (
              <p role="alert" className="fees-error">
                {error}
              </p>
            )}
            {pendingPayment && !saving && (
              <p>
                Confirmation is pending. Retry to check this same payment before
                starting another.
              </p>
            )}
            <h2>{selected.student?.full_name}</h2>
            <p>
              Outstanding:{' '}
              <strong>{money(selected.balance, selected.currency)}</strong>
            </p>
            <label>
              Amount received
              <input
                disabled={saving || pendingPayment}
                type="number"
                min="0.01"
                max={selected.balance}
                step="0.01"
                value={payment.amount}
                onChange={(e) =>
                  setPayment({ ...payment, amount: e.target.value })
                }
                required
              />
            </label>
            <label>
              Method
              <select
                disabled={saving || pendingPayment}
                value={payment.method}
                onChange={(e) =>
                  setPayment({ ...payment, method: e.target.value })
                }
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile_money">Mobile money</option>
              </select>
            </label>
            <label>
              Reference (optional)
              <input
                disabled={saving || pendingPayment}
                value={payment.reference}
                onChange={(e) =>
                  setPayment({ ...payment, reference: e.target.value })
                }
              />
            </label>
            <button className="fees-submit" disabled={saving}>
              {saving ? 'Saving…' : 'Record payment'}
            </button>
          </form>
        </div>
      )}
      {createOpen && (
        <div className="fees-modal-backdrop">
          <form className="fees-modal" onSubmit={createRecord}>
            {close(() => setCreateOpen(false))}
            <p className="fees-eyebrow">Server-calculated</p>
            <h2>Create term fee</h2>
            <label>
              Learner
              <select
                required
                value={draft.student_id}
                onChange={(e) =>
                  setDraft({ ...draft, student_id: e.target.value })
                }
              >
                <option value="">Select learner</option>
                {students.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Class / stream
              <input
                required
                value={draft.form}
                onChange={(e) => setDraft({ ...draft, form: e.target.value })}
                placeholder="e.g. L6 Sciences"
              />
            </label>
            <label>
              Curriculum
              <select
                value={draft.curriculum}
                onChange={(e) =>
                  setDraft({ ...draft, curriculum: e.target.value })
                }
              >
                <option>ZIMSEC</option>
                <option>Cambridge</option>
              </select>
            </label>
            <label>
              Terms enrolled
              <input
                required
                type="number"
                min="1"
                value={draft.terms_enrolled}
                onChange={(e) =>
                  setDraft({ ...draft, terms_enrolled: e.target.value })
                }
              />
            </label>
            <label>
              Academic year
              <input
                required
                type="number"
                value={draft.academic_year}
                onChange={(e) =>
                  setDraft({ ...draft, academic_year: e.target.value })
                }
              />
            </label>
            <label>
              Term
              <select
                value={draft.academic_term}
                onChange={(e) =>
                  setDraft({ ...draft, academic_term: e.target.value })
                }
              >
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={draft.due_date}
                onChange={(e) =>
                  setDraft({ ...draft, due_date: e.target.value })
                }
              />
            </label>
            <button className="fees-submit" disabled={saving}>
              {saving ? 'Creating…' : 'Calculate and create'}
            </button>
          </form>
        </div>
      )}
      {settingsOpen && (
        <div className="fees-modal-backdrop">
          <form className="fees-modal" onSubmit={saveSettings}>
            {close(() => setSettingsOpen(false))}
            <p className="fees-eyebrow">Administrator only</p>
            <h2>Fee settings</h2>
            {settings
              .filter((s) => feeKeys.includes(s.setting_key))
              .map((s) => (
                <label key={s.setting_key}>
                  {s.setting_key.replaceAll('_', ' ')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={s.setting_value}
                    onChange={(e) =>
                      setSettings(
                        settings.map((x) =>
                          x.setting_key === s.setting_key
                            ? { ...x, setting_value: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            <button className="fees-submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save fees'}
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
