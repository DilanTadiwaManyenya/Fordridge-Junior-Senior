'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import './fordridge-fees-dashboard.css'
import { workflowError } from './workflow'

const money = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Number(value || 0),
  )
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
  const paymentRequest = useRef(null)
  const paymentLock = useRef(false)
  const [pendingPayment, setPendingPayment] = useState(false)
  const [records, setRecords] = useState([]),
    [students, setStudents] = useState([]),
    [settings, setSettings] = useState([])
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
  const loadRecords = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const r = await supabase
        .from('fee_records')
        .select(
          'id,campus_id,amount,paid_amount,currency,due_date,status,payment_reference,academic_year,academic_term,student:profiles!fee_records_student_id_fkey(full_name),campus:campuses!fee_records_campus_id_fkey(name,code)',
        )
        .order('due_date')
      if (r.error) setError(r.error.message)
      else setRecords(r.data || [])
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setLoading(false)
    }
  }, [])
  const loadAdmin = useCallback(async () => {
    if (!supabase || !isAdmin) return
    try {
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
  }, [isAdmin])
  useEffect(() => {
    loadRecords()
    loadAdmin()
  }, [loadRecords, loadAdmin])
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
  const totals = rows.reduce(
    (a, r) => ({
      due: a.due + r.due,
      paid: a.paid + r.paid,
      outstanding: a.outstanding + r.balance,
    }),
    { due: 0, paid: 0, outstanding: 0 },
  )
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
      {isAdmin && (
        <div className="fees-summary">
          <article>
            <span>Fees billed</span>
            <strong>{money(totals.due)}</strong>
          </article>
          <article>
            <span>Payments received</span>
            <strong>{money(totals.paid)}</strong>
          </article>
          <article className="fees-outstanding">
            <span>Outstanding</span>
            <strong>{money(totals.outstanding)}</strong>
          </article>
        </div>
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
                  {isAdmin && <th />}
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
                      {isAdmin && (
                        <td>
                          <button
                            className="fees-collect"
                            disabled={!r.balance}
                            onClick={() => {
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
                    <td colSpan={isAdmin ? 9 : 8} className="fees-message">
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
