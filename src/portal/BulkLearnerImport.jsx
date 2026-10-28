import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import { learnerImportColumns, parseLearnerImportCsv } from './learnerImportCsv'

const maxFileBytes = 5 * 1024 * 1024

export default function BulkLearnerImport() {
  const [campuses, setCampuses] = useState([])
  const [campus, setCampus] = useState('')
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState([])
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const importLock = useRef(false)

  useEffect(() => {
    let active = true
    supabase
      .from('campuses')
      .select('id,name')
      .order('name')
      .then(({ data, error: requestError }) => {
        if (!active) return
        if (requestError) setError(workflowError(requestError))
        else {
          setCampuses(data || [])
          setCampus(data?.[0]?.id || '')
        }
      })
      .catch((requestError) => {
        if (active) setError(workflowError(requestError))
      })
    return () => {
      active = false
    }
  }, [])

  function readFile(event) {
    const file = event.target.files?.[0]
    setRows([])
    setResults([])
    setError('')
    if (!file) return
    if (file.size > maxFileBytes) {
      setError('Choose a CSV file smaller than 5 MB.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    setReading(true)
    reader.onload = () => {
      try {
        const parsedRows = parseLearnerImportCsv(reader.result)
        if (!parsedRows.length) throw new Error('The CSV has no learner rows.')
        setRows(parsedRows)
      } catch (parseError) {
        setError(workflowError(parseError))
      } finally {
        setReading(false)
      }
    }
    reader.onerror = () => {
      setError('The selected CSV could not be read. Choose the file again.')
      setReading(false)
    }
    reader.readAsText(file)
  }

  async function importRows() {
    if (importLock.current || !campus || password.length < 12 ||
        !rows.length || rows.some((row) => !row.valid) || reading) return
    importLock.current = true
    setBusy(true)
    setError('')
    setResults([])
    const outcome = []
    try {
      for (const row of rows) {
        try {
          const { data, error: requestError } = await supabase.functions.invoke(
            'create-portal-account',
            {
              body: {
                full_name: row.full_name,
                phone: row.normalized_phone,
                admission_number: row.admission_number,
                class_level: row.class_level,
                class_stream: row.class_stream,
                role: 'student',
                campus_id: campus,
                password,
                enrollment_status: 'active',
              },
            },
          )
          outcome.push({
            ...row,
            success: !requestError && !data?.error,
            message: data?.error || requestError?.message || 'Created',
          })
          setResults([...outcome])
        } catch (requestError) {
          outcome.push({
            ...row,
            success: false,
            message: workflowError(requestError),
          })
          setResults([...outcome])
        }
      }
    } finally {
      setBusy(false)
      importLock.current = false
    }
  }

  const validRows = rows.filter((row) => row.valid)
  const invalidRows = rows.length - validRows.length

  return (
    <section>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">Learner management</p>
          <h1>Bulk learner import</h1>
          <p className="progress-report-note">
            Review the CSV before provisioning learner portal accounts. Quoted
            fields can contain commas, quotes, or line breaks.
          </p>
        </div>
      </header>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      <section className="workflow-panel workflow-form">
        <p className="workflow-wide">
          <strong>Required CSV columns:</strong>{' '}
          <code>{learnerImportColumns.join(', ')}</code>
        </p>
        <label className="workflow-wide">
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={readFile} disabled={busy} />
        </label>
        <label>
          Campus
          <select value={campus} onChange={(event) => setCampus(event.target.value)} disabled={busy}>
            <option value="">Select campus</option>
            {campuses.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Shared initial password (minimum 12 characters)
          <input
            type="password"
            minLength="12"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>
        {reading && <p className="workflow-wide" role="status">Reading CSV preview…</p>}
        {rows.length > 0 && (
          <div className="workflow-wide">
            <h2>Learner preview</h2>
            <p role="status">
              {validRows.length} ready · {invalidRows} need{invalidRows === 1 ? 's' : ''} correction.
              {' '}This preview does not create accounts. Existing-account checks run when you confirm the import.
            </p>
            <div className="workflow-scroll">
              <table className="workflow-table">
                <thead>
                  <tr>
                    <th>CSV row</th><th>Name</th><th>Phone to save</th><th>Admission number</th><th>Class / stream</th><th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.full_name || '—'}</td>
                      <td>{row.normalized_phone || row.phone || '—'}</td>
                      <td>{row.admission_number || '—'}</td>
                      <td>{[row.class_level, row.class_stream].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{row.valid ? 'Ready' : row.issues.join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="primary-action"
              type="button"
              disabled={busy || reading || !campus || password.length < 12 || invalidRows > 0}
              onClick={importRows}
            >
              {busy ? `Creating accounts… (${results.length}/${rows.length})` : `Create ${validRows.length} learner account${validRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </section>
      {results.length > 0 && (
        <section className="workflow-panel">
          <h2>Import results</h2>
          {results.map((row) => (
            <p key={row.line} role={row.success ? 'status' : 'alert'}>
              {row.success ? '✓' : '×'} {row.full_name || `CSV row ${row.line}`} — {row.message}
            </p>
          ))}
        </section>
      )}
    </section>
  )
}
