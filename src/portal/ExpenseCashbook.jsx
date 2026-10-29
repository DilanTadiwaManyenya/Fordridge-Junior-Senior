import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import { referenceExpenseCategories } from './income-expense-review'
import './expense-cashbook-review.css'

const pageSize = 500
const requestKinds = ['submit', 'review', 'reverse', 'correct']
const rpcNames = {
  submit: 'submit_cashbook_expense',
  review: 'review_cashbook_expense',
  reverse: 'reverse_cashbook_expense',
  correct: 'correct_cashbook_expense',
}

function schoolDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function expenseDraft(expense = null) {
  return {
    expense_date: expense?.expense_date || schoolDate(),
    category: referenceExpenseCategories.includes(expense?.category) ? expense.category : '',
    description: expense?.description || '',
    amount: expense?.amount == null ? '' : String(expense.amount),
    currency: expense?.currency || 'USD',
    reference: expense?.reference || '',
  }
}

function readSavedRequest(key) {
  try {
    const value = sessionStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return { invalid: true }
  }
}

async function readAllExpenses() {
  const result = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('cashbook_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    result.push(...(data || []))
    if (!data || data.length < pageSize) return result
  }
}

const statusLabels = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  reversed: 'Reversed',
  legacy_unreviewed: 'Legacy · unreviewed',
}

export default function ExpenseCashbook({ profile, user }) {
  const userId = user?.id || 'current-user'
  const isMainAdmin = profile?.role === 'admin'
  const storageKey = useCallback((kind) => `fordridge-cashbook-${kind}-v1-${userId}`, [userId])
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState(null)
  const [review, setReview] = useState(null)
  const [correction, setCorrection] = useState(null)
  const [reversal, setReversal] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [pending, setPending] = useState(() => Object.fromEntries(requestKinds.map((kind) => [kind, readSavedRequest(`fordridge-cashbook-${kind}-v1-${userId}`)])))
  const load = useCallback(async () => {
    if (!isMainAdmin) {
      setLoading(false)
      return
    }
    if (!supabase) {
      setError('Finance service is not configured.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setItems(await readAllExpenses())
    } catch (cause) {
      setError(workflowError(cause))
    } finally {
      setLoading(false)
    }
  }, [isMainAdmin])
  useEffect(() => { load() }, [load])

  const pendingCount = items.filter((item) => item.review_status === 'pending').length
  const approvedCount = items.filter((item) => item.review_status === 'approved').length
  const legacyCount = items.filter((item) => item.review_status === 'legacy_unreviewed').length
  const orderedItems = useMemo(() => items, [items])
  const correctedEntries = useMemo(() => new Map(items.filter((item) => item.correction_of).map((item) => [item.correction_of, item])), [items])

  function storeRequest(kind, request) {
    try {
      sessionStorage.setItem(storageKey(kind), JSON.stringify(request))
      setPending((current) => ({ ...current, [kind]: request }))
      return true
    } catch {
      setError('Enable browser session storage before submitting this finance action.')
      return false
    }
  }

  function clearRequest(kind) {
    try { sessionStorage.removeItem(storageKey(kind)) } catch { /* The completed server result remains authoritative. */ }
    setPending((current) => ({ ...current, [kind]: null }))
  }

  async function runRequest(kind, request) {
    if (running.current || request?.invalid) return
    running.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc(rpcNames[kind], request)
      if (rpcError) {
        if (['22023', '42501', 'P0001'].includes(rpcError.code)) clearRequest(kind)
        throw rpcError
      }
      clearRequest(kind)
      setDraft(null)
      setReview(null)
      setCorrection(null)
      setReversal(null)
      setNotice(kind === 'submit'
        ? `Expense submitted for review${data?.id ? ` · ${data.id}` : ''}.`
        : kind === 'review'
          ? `Expense ${data?.review_status || 'reviewed'}.`
          : kind === 'correct'
            ? `Original expense reversed; replacement ${data?.replacement?.review_status || 'submitted'} for review.`
            : 'Expense reversed. No cash refund or transfer was performed.')
      await load()
    } catch (cause) {
      setError(workflowError(cause))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  function newRequest(kind, fields) {
    const request = { ...fields, p_request_id: crypto.randomUUID() }
    return storeRequest(kind, request) ? runRequest(kind, request) : undefined
  }

  async function submitExpense(event) {
    event.preventDefault()
    if (!draft || busy || Object.values(pending).some(Boolean)) return
    const request = {
      p_request_id: crypto.randomUUID(),
      p_expense: { ...draft, amount: Number(draft.amount), reference: draft.reference.trim() || null },
    }
    if (storeRequest('submit', request)) await runRequest('submit', request)
  }

  async function submitReview(event) {
    event.preventDefault()
    if (!review || review.reason.trim().length < 5) return
    await newRequest('review', {
      p_expense_id: review.expense.id,
      p_decision: review.decision,
      p_reason: review.reason.trim(),
    })
  }

  async function submitReversal(event) {
    event.preventDefault()
    if (!reversal || reversal.reason.trim().length < 5) return
    await newRequest('reverse', {
      p_expense_id: reversal.id,
      p_reason: reversal.reason.trim(),
    })
  }

  async function submitCorrection(event) {
    event.preventDefault()
    if (!correction || correction.reason.trim().length < 5) return
    const request = {
      p_expense_id: correction.expense.id,
      p_expense: { ...correction.draft, amount: Number(correction.draft.amount), reference: correction.draft.reference.trim() || null },
      p_reason: correction.reason.trim(),
      p_request_id: crypto.randomUUID(),
    }
    if (storeRequest('correct', request)) await runRequest('correct', request)
  }

  if (!isMainAdmin) {
    return <section className="expense-cashbook"><h1>Expenses &amp; Cashbook</h1><p role="alert">Main Admin access is required. Fordridge expense records do not yet have campus attribution.</p></section>
  }

  return <section className="expense-cashbook expense-cashbook-review" aria-labelledby="expense-cashbook-title">
    <header className="workflow-heading"><div><p className="eyebrow">Finance management</p><h1 id="expense-cashbook-title">Expenses &amp; Cashbook</h1><p className="progress-report-note">Submit expenses for review. Corrections preserve the original and create a linked replacement.</p></div><button className="primary-action" type="button" onClick={() => { setDraft(expenseDraft()); setError(''); setNotice('') }} disabled={busy || Object.values(pending).some(Boolean)}>+ Record expense</button></header>
    <aside className="cashbook-review-notice">Historical entries are marked Legacy · unreviewed because earlier versions did not store approval decisions. Campus attribution is still unavailable; Principal and Accountant access remains disabled.</aside>
    {notice && <p className="workflow-success" role="status">{notice}</p>}
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {Object.entries(pending).filter(([, request]) => request).map(([kind, request]) => <section className="cashbook-recovery" key={kind} aria-label={`${kind} recovery`}>
      <div><h2>{request.invalid ? 'Finance recovery needs assistance' : `${kind[0].toUpperCase()}${kind.slice(1)} awaiting confirmation`}</h2><p>{request.invalid ? 'Saved recovery data could not be read. Ask Main Admin to reconcile this action before making another entry.' : 'The previous response was not confirmed. Retry this same saved request before starting another action.'}</p></div>
      {!request.invalid && <button type="button" disabled={busy} onClick={() => runRequest(kind, request)}>Retry saved {kind}</button>}
    </section>)}
    <div className="portal-summary-grid cashbook-review-summary">
      <article><span>Awaiting review</span><strong>{pendingCount}</strong><small>New submissions need a decision.</small></article>
      <article><span>Approved entries</span><strong>{approvedCount}</strong><small>Included as approved expenses.</small></article>
      <article><span>Legacy unreviewed</span><strong>{legacyCount}</strong><small>Not assumed to be approved.</small></article>
    </div>
    {draft && <form className="workflow-panel workflow-form cashbook-entry-form" onSubmit={submitExpense}>
      <h2>Submit an expense</h2><p>Submitted entries begin as Pending review. Use the school receipt or invoice reference where available.</p>
      <label>Date<input required type="date" value={draft.expense_date} onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} /></label>
      <label>Category<select required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="">Choose a category</option>{referenceExpenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Amount<input required min="0.01" max="9999999999.99" step="0.01" type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
      <label>Currency<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}><option>USD</option><option>ZiG</option></select></label>
      <label className="workflow-wide">Description<textarea required maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Reference (optional)<input maxLength={200} value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} /></label>
      <div className="workflow-actions"><button className="primary-action" disabled={busy || Object.values(pending).some(Boolean)}>{busy ? 'Submitting…' : 'Submit for review'}</button><button type="button" onClick={() => setDraft(null)} disabled={busy}>Cancel</button></div>
    </form>}
    {review && <form className="workflow-panel cashbook-decision-form" aria-label={`${review.decision} expense review`} onSubmit={submitReview}>
      <h2>{review.decision === 'approved' ? 'Approve expense' : 'Reject expense'}</h2><p>{review.expense.category} · {review.expense.currency} {Number(review.expense.amount).toFixed(2)} · {review.expense.description}</p>
      <label>Review reason<textarea required minLength={5} maxLength={1000} value={review.reason} onChange={(event) => setReview({ ...review, reason: event.target.value })} /></label>
      <div className="workflow-actions"><button className="primary-action" disabled={busy || review.reason.trim().length < 5}>{busy ? 'Saving review…' : `Confirm ${review.decision}`}</button><button type="button" onClick={() => setReview(null)} disabled={busy}>Cancel</button></div>
    </form>}
    {reversal && <form className="workflow-panel cashbook-decision-form" aria-label="Reverse expense" onSubmit={submitReversal}>
      <h2>Reverse expense</h2><p>The original entry and audit history remain. This records a ledger correction only; it does not refund or transfer cash.</p>
      <label>Reason for reversal<textarea required minLength={5} maxLength={1000} value={reversal.reason} onChange={(event) => setReversal({ ...reversal, reason: event.target.value })} /></label>
      <div className="workflow-actions"><button className="primary-action" disabled={busy || reversal.reason.trim().length < 5}>{busy ? 'Reversing…' : 'Confirm reversal'}</button><button type="button" onClick={() => setReversal(null)} disabled={busy}>Cancel</button></div>
    </form>}
    {correction && <form className="workflow-panel workflow-form cashbook-correction-form" aria-label={`Correct expense ${correction.expense.id}`} onSubmit={submitCorrection}>
      <h2>Correct and replace expense</h2><p>The original will be reversed and retained; the replacement is submitted as Pending review. This does not refund or transfer cash.</p>
      <label>Date<input required type="date" value={correction.draft.expense_date} onChange={(event) => setCorrection({ ...correction, draft: { ...correction.draft, expense_date: event.target.value } })} /></label>
      <label>Category<select required value={correction.draft.category} onChange={(event) => setCorrection({ ...correction, draft: { ...correction.draft, category: event.target.value } })}><option value="">Choose a category</option>{referenceExpenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Amount<input required min="0.01" max="9999999999.99" step="0.01" type="number" value={correction.draft.amount} onChange={(event) => setCorrection({ ...correction, draft: { ...correction.draft, amount: event.target.value } })} /></label>
      <label>Currency<select value={correction.draft.currency} onChange={(event) => setCorrection({ ...correction, draft: { ...correction.draft, currency: event.target.value } })}><option>USD</option><option>ZiG</option></select></label>
      <label className="workflow-wide">Description<textarea required maxLength={2000} value={correction.draft.description} onChange={(event) => setCorrection({ ...correction, draft: { ...correction.draft, description: event.target.value } })} /></label>
      <label>Reference (optional)<input maxLength={200} value={correction.draft.reference} onChange={(event) => setCorrection({ ...correction, draft: { ...correction.draft, reference: event.target.value } })} /></label>
      <label className="workflow-wide">Reason for correction<textarea required minLength={5} maxLength={1000} value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} /></label>
      <div className="workflow-actions"><button className="primary-action" disabled={busy || correction.reason.trim().length < 5}>{busy ? 'Correcting…' : 'Reverse original and submit replacement'}</button><button type="button" onClick={() => setCorrection(null)} disabled={busy}>Cancel</button></div>
    </form>}
    <section className="workflow-panel cashbook-ledger-panel" aria-label="Cashbook entries">
      <div className="cashbook-ledger-heading"><div><h2>Cashbook entries</h2><p>Every decision is attributed to the Main Admin and recorded in the expense event history.</p></div><button type="button" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></div>
      {loading ? <p role="status">Loading cashbook entries…</p> : <div className="workflow-scroll"><table className="workflow-table"><thead><tr><th>Date</th><th>Category / description</th><th>Amount</th><th>Status</th><th>Review / correction</th><th>Actions</th></tr></thead>
        <tbody>{orderedItems.map((item) => <tr key={item.id}>
          <td>{item.expense_date}</td>
          <td><strong>{item.category}</strong><small>{item.description}</small>{item.correction_of && <small>Correction of {item.correction_of}</small>}{item.review_reason && <small>Review: {item.review_reason}</small>}{item.reversal_reason && <small>Reversal: {item.reversal_reason}</small>}</td>
          <td>{item.currency} {Number(item.amount).toFixed(2)}</td>
          <td><span className={`cashbook-status ${item.review_status}`}>{statusLabels[item.review_status] || item.review_status}</span>{item.reviewed_at && <small>Reviewed {new Date(item.reviewed_at).toLocaleString('en-ZW')}</small>}{item.reversed_at && <small>Reversed {new Date(item.reversed_at).toLocaleString('en-ZW')}</small>}</td>
          <td>{item.reviewed_by ? `Reviewed by ${item.reviewed_by}` : item.review_status === 'legacy_unreviewed' ? 'Historical decision not recorded' : '—'}{correctedEntries.get(item.id) && <small>Replacement {correctedEntries.get(item.id).id}</small>}</td>
          <td className="cashbook-row-actions">
            {['pending','legacy_unreviewed'].includes(item.review_status) && <><button type="button" disabled={busy || Object.values(pending).some(Boolean)} onClick={() => setReview({ expense: item, decision: 'approved', reason: '' })}>Approve</button><button type="button" disabled={busy || Object.values(pending).some(Boolean)} onClick={() => setReview({ expense: item, decision: 'rejected', reason: '' })}>Reject</button></>}
            {['approved','legacy_unreviewed'].includes(item.review_status) && <><button type="button" disabled={busy || Object.values(pending).some(Boolean)} onClick={() => setCorrection({ expense: item, draft: expenseDraft(item), reason: '' })}>Correct &amp; replace</button><button type="button" disabled={busy || Object.values(pending).some(Boolean)} onClick={() => setReversal({ id: item.id, reason: '' })}>Reverse</button></>}
          </td>
        </tr>)}</tbody></table>{!items.length && <p className="portal-empty-copy">No expenses have been recorded yet.</p>}</div>}
    </section>
  </section>
}
