import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import AsyncState from './AsyncState'
import './library-oversight.css'

const PAGE_SIZE = 25

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-ZW') : '—'
}

export default function LibraryOversight() {
  const [rows, setRows] = useState([])
  const [campuses, setCampuses] = useState([])
  const [campusId, setCampusId] = useState('')
  const [state, setState] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [campusResult, libraryResult] = await Promise.all([
      supabase.from('campuses').select('id,name').order('name'),
      supabase.rpc('admin_learning_library_oversight', {
        p_campus_id: campusId || null,
        p_state: state,
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      }),
    ])
    const failed = [campusResult, libraryResult].find((result) => result.error)
    if (failed) setError(workflowError(failed.error))
    else {
      setCampuses(campusResult.data || [])
      setRows(libraryResult.data || [])
      setTotal(Number(libraryResult.data?.[0]?.total_count || 0))
    }
    setLoading(false)
  }, [campusId, state, search, offset])

  useEffect(() => { load() }, [load])

  function updateFilter(setter, value) {
    setter(value)
    setOffset(0)
  }

  return <section className="workflow-panel library-oversight">
    <header className="workflow-heading">
      <div><p className="eyebrow">Administration · Read only</p><h1>Library oversight</h1>
        <p>Review learning-resource scope, publication status, private file readiness, and recorded history. Files and learner data are not opened here.</p>
      </div>
    </header>
    <form className="workflow-form library-oversight-filters" onSubmit={(event) => { event.preventDefault(); updateFilter(setSearch, searchInput.trim()) }}>
      <label>Campus<select value={campusId} onChange={(event) => updateFilter(setCampusId, event.target.value)}>
        <option value="">All campuses</option>
        {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
      </select></label>
      <label>Content status<select value={state} onChange={(event) => updateFilter(setState, event.target.value)}>
        <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
      </select></label>
      <label>Search title, class, subject or teacher<input value={searchInput} maxLength={120} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <button type="submit">Search</button>
    </form>
    <AsyncState loading={loading} error={error} empty={!rows.length} loadingMessage="Loading library oversight…" emptyMessage="No learning resources match these filters." onRetry={load} />
    {!loading && !error && rows.length > 0 && <>
      <p className="library-oversight-count">Showing {offset + 1}–{offset + rows.length} of {total} resources</p>
      <div className="library-oversight-list">
        {rows.map((row) => <article className="library-oversight-card" key={row.resource_id}>
          <header><div><span className={`library-oversight-state state-${row.state}`}>{row.state}</span><h2>{row.title}</h2></div><strong className={`library-file-readiness readiness-${row.file_readiness}`}>{row.file_readiness} file</strong></header>
          <dl>
            <div><dt>Audience</dt><dd>{row.audience_label}</dd></div>
            <div><dt>Subject</dt><dd>{row.subject}</dd></div>
            <div><dt>Teacher</dt><dd>{row.teacher_name || 'Teacher account unavailable'}</dd></div>
            <div><dt>Reporting period</dt><dd>{row.academic_year} · {row.academic_term}</dd></div>
            <div><dt>Private files</dt><dd>{row.finalized_file_count} verified version{row.finalized_file_count === 1 ? '' : 's'} · {row.pending_upload_count} pending</dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(row.updated_at)}</dd></div>
          </dl>
          {row.active_file_name && <p className="library-active-file">Active file: <strong>{row.active_file_name}</strong> · {(Number(row.active_file_size_bytes) / 1024 / 1024).toFixed(2)} MiB</p>}
          <div className="library-oversight-history">
            <details><summary>File history ({row.file_history?.length || 0})</summary>
              {row.file_history?.length ? <ul>{row.file_history.map((file, index) => <li key={`${file.name}-${file.created_at}-${index}`}>
                <strong>{file.name}</strong> · {file.ready ? 'verified' : 'pending'}{file.active ? ' · active' : ''} · {formatDate(file.created_at)}
              </li>)}</ul> : <p>No files have been reserved for this resource.</p>}
            </details>
            <details><summary>Activity history ({row.activity_history?.length || 0})</summary>
              {row.activity_history?.length ? <ul>{row.activity_history.map((event, index) => <li key={`${event.created_at}-${index}`}>
                <strong>{event.action.replaceAll('_', ' ')}</strong> · {event.actor_name || 'Account unavailable'} · {formatDate(event.created_at)}{event.summary ? ` · ${event.summary}` : ''}
              </li>)}</ul> : <p>No activity is recorded yet.</p>}
            </details>
          </div>
        </article>)}
      </div>
      <nav className="library-oversight-pagination" aria-label="Library oversight pages">
        <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>Previous</button>
        <span>Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
        <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + rows.length >= total}>Next</button>
      </nav>
    </>}
  </section>
}
