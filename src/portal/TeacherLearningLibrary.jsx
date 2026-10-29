import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import { learningFileDetails, matchesLearningFileReservation, needsAbandonedUploadReview } from './learning-library-file-workflow'
import './workflow.css'
import './teacher-learning-library.css'

function scopeLabel(row) {
  return `${row.class_level}${row.class_stream ? ` · ${row.class_stream}` : ' · all streams'} · ${row.subject}`
}

export default function TeacherLearningLibrary({ profile }) {
  const [assignments, setAssignments] = useState([])
  const [period, setPeriod] = useState(null)
  const [resources, setResources] = useState([])
  const [files, setFiles] = useState([])
  const [draft, setDraft] = useState({ allocationId: '', title: '', description: '' })
  const [editing, setEditing] = useState(null)
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: allocationRows, error: allocationError } = await supabase
        .from('teacher_class_assignments')
        .select('id,campus_id,class_level,class_stream,subject,assignment_kind')
        .eq('teacher_id', profile.id)
        .eq('campus_id', profile.campus_id)
        .not('subject', 'is', null)
        .order('class_level')
      if (allocationError) throw allocationError
      const valid = (allocationRows || []).filter((row) => row.subject?.trim())
      setAssignments(valid)
      setDraft((value) => valid.some((row) => row.id === value.allocationId)
        ? value
        : { ...value, allocationId: valid[0]?.id || '' })
      const [periodResult, resourceResult] = await Promise.all([
        valid.length
          ? supabase.rpc('teacher_learning_current_period', { p_campus_id: profile.campus_id })
          : Promise.resolve({ data: null, error: null }),
        supabase.from('learning_resources').select('*').eq('teacher_id', profile.id).eq('campus_id', profile.campus_id).order('created_at', { ascending: false }),
      ])
      if (periodResult.error) throw periodResult.error
      if (resourceResult.error) throw resourceResult.error
      setPeriod(periodResult.data)
      setResources(resourceResult.data || [])
      const resourceIds = (resourceResult.data || []).map((row) => row.id)
      if (resourceIds.length) {
        const { data: fileRows, error: fileError } = await supabase
          .from('learning_resource_files').select('*').in('resource_id', resourceIds).order('created_at', { ascending: false })
        if (fileError) throw fileError
        setFiles(fileRows || [])
      } else setFiles([])
    } catch (cause) {
      setError(workflowError(cause))
    } finally {
      setLoading(false)
    }
  }, [profile.id, profile.campus_id])

  useEffect(() => { load() }, [load])

  const allocationMap = useMemo(() => new Map(assignments.map((row) => [row.id, row])), [assignments])
  const fileByResource = useMemo(() => {
    const map = new Map()
    for (const file of files) if (file.active && file.ready) map.set(file.resource_id, file)
    return map
  }, [files])
  const filesByResource = useMemo(() => {
    const map = new Map()
    for (const file of files) map.set(file.resource_id, [...(map.get(file.resource_id) || []), file])
    return map
  }, [files])

  async function saveResource(event) {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    try {
      if (editing) {
        const { error: saveError } = await supabase.rpc('update_teacher_learning_resource', {
          p_resource_id: editing.id, p_title: draft.title, p_description: draft.description,
        })
        if (saveError) throw saveError
        setEditing(null)
        setDraft((value) => ({ ...value, title: '', description: '' }))
        setNotice('Draft saved.')
      } else {
        const { data, error: createError } = await supabase.rpc('create_teacher_learning_resource', {
          p_allocation_id: draft.allocationId, p_title: draft.title, p_description: draft.description,
        })
        if (createError) throw createError
        setNotice('Draft created. Add its file before publishing.')
        setDraft((value) => ({ ...value, title: '', description: '' }))
        await load()
        document.getElementById(`learning-file-${data}`)?.focus()
      }
      await load()
    } catch (cause) { setError(workflowError(cause)) }
    finally { setSaving(false) }
  }

  async function startUpload(resource, file) {
    setError(''); setNotice('')
    try {
      const { extension, mimeType } = learningFileDetails(file)
      setPending({ resourceId: resource.id, file, extension, mimeType, requestId: crypto.randomUUID() })
      setNotice('File selected. Upload it to this draft; a finalized replacement becomes active only after verification.')
    } catch (cause) { setError(cause.message) }
  }

  function resumeUpload(resource, reservation, file) {
    setError(''); setNotice('')
    if (!matchesLearningFileReservation(file, reservation)) {
      setError('Choose the same file name, size, and format as the saved reservation. The existing file was left unchanged.')
      return
    }
    const { extension, mimeType } = learningFileDetails(file)
    setPending({ resourceId: resource.id, file, extension, mimeType, requestId: reservation.request_id })
    setNotice('Saved reservation selected. Resume it to verify the uploaded file or safely retry the upload.')
  }

  async function uploadPending() {
    if (!pending) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { data: reservation, error: reserveError } = await supabase.rpc('reserve_teacher_learning_file', {
        p_request_id: pending.requestId,
        p_resource_id: pending.resourceId,
        p_original_name: pending.file.name,
        p_extension: pending.extension,
        p_mime_type: pending.mimeType,
        p_size_bytes: pending.file.size,
      })
      if (reserveError) throw reserveError
      const { data: alreadyReady, error: finalizeFirstError } = await supabase.rpc('finalize_teacher_learning_file', { p_file_id: reservation.id })
      if (!finalizeFirstError && alreadyReady?.ready) {
        setPending(null); setNotice('File is ready and attached to the draft.'); await load(); return
      }
      const { error: uploadError } = await supabase.storage.from(reservation.bucket_id).upload(reservation.object_path, pending.file, {
        contentType: pending.mimeType, upsert: false,
      })
      if (uploadError) {
        const { data: retryFinalize, error: retryError } = await supabase.rpc('finalize_teacher_learning_file', { p_file_id: reservation.id })
        if (retryError || !retryFinalize?.ready) throw uploadError
      } else {
        const { error: finalizeError } = await supabase.rpc('finalize_teacher_learning_file', { p_file_id: reservation.id })
        if (finalizeError) throw finalizeError
      }
      setPending(null); setNotice('File is ready and attached to the draft.'); await load()
    } catch (cause) { setError(workflowError(cause)) }
    finally { setSaving(false) }
  }

  async function changeState(resource, nextState) {
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: actionError } = await supabase.rpc('set_teacher_learning_resource_state', {
        p_resource_id: resource.id, p_state: nextState,
      })
      if (actionError) throw actionError
      setNotice(nextState === 'published' ? 'Published. Parent reading is a later roadmap stage.' : 'Resource archived.')
      await load()
    } catch (cause) { setError(workflowError(cause)) }
    finally { setSaving(false) }
  }

  async function openFile(file) {
    setError('')
    const tab = window.open('about:blank', '_blank')
    if (!tab) { setError('Allow a new tab to open the private file.'); return }
    tab.opener = null
    try {
      const { data, error: linkError } = await supabase.storage
        .from(file.bucket_id)
        .createSignedUrl(file.object_path, 60)
      if (linkError) throw linkError
      tab.location.href = data.signedUrl
    } catch (cause) {
      tab.close()
      setError(workflowError(cause))
    }
  }

  function editResource(resource) {
    setEditing(resource)
    setDraft({ allocationId: resource.allocation_id || '', title: resource.title, description: resource.description || '' })
  }

  function resetForm() {
    setEditing(null)
    setDraft({ allocationId: assignments[0]?.id || '', title: '', description: '' })
  }

  return (
    <section className="workflow-panel teacher-learning-library">
      <div className="workflow-heading">
        <div><p className="eyebrow">Teacher workspace</p><h1>Learning library</h1>
          <p>Prepare notes and resources for the classes and subjects in your current teaching assignments.</p></div>
      </div>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      {notice && <p className="workflow-notice" role="status">{notice}</p>}
      {loading ? <p className="workflow-async-state" role="status">Loading your learning library…</p> : <>
        {!assignments.length ? <p className="workflow-async-state">No subject allocations are active in this campus. Ask the school office to confirm your assignment.</p> : <>
          {!period ? <p className="workflow-async-state">There is no open current reporting period for this campus. Draft creation is paused.</p> : <>
            <form className="workflow-form teacher-learning-form" onSubmit={saveResource}>
              <label>Assigned class and subject
                <select value={draft.allocationId} onChange={(event) => setDraft({ ...draft, allocationId: event.target.value })} disabled={Boolean(editing)} required>
                  {assignments.map((row) => <option key={row.id} value={row.id}>{scopeLabel(row)}</option>)}
                </select>
              </label>
              <label>Title<input value={draft.title} maxLength={200} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
              <label className="workflow-wide">Teacher notes<textarea value={draft.description} maxLength={10000} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <div className="workflow-actions workflow-wide">
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save draft' : 'Create draft'}</button>
                {editing && <button type="button" onClick={resetForm} disabled={saving}>Cancel editing</button>}
                <span className="teacher-learning-period">Current period: {period.academic_year} · {period.academic_term}</span>
              </div>
            </form>
          </>}
        </>}
        <div className="workflow-scroll teacher-learning-list">
          {resources.length ? resources.map((resource) => {
            const activeFile = fileByResource.get(resource.id)
            const resourceFiles = filesByResource.get(resource.id) || []
            const incompleteFiles = resourceFiles.filter((file) => !file.ready)
            const replacedFiles = resourceFiles.filter((file) => file.ready && !file.active)
            const allocation = allocationMap.get(resource.allocation_id)
            return <article className="teacher-learning-card" key={resource.id}>
              <div className="teacher-learning-card-heading"><div><span className={`teacher-learning-state state-${resource.state}`}>{resource.state}</span>
                <h2>{resource.title}</h2><p>{resource.class_level}{resource.class_stream ? ` · ${resource.class_stream}` : ' · all streams'} · {resource.subject} · {resource.academic_year} · {resource.academic_term}</p></div></div>
              {resource.description && <p className="teacher-learning-description">{resource.description}</p>}
              {activeFile ? <div className="teacher-learning-file"><span>Attached: {activeFile.original_name} · {(activeFile.size_bytes / 1024 / 1024).toFixed(2)} MiB</span><button type="button" onClick={() => openFile(activeFile)}>Open private file</button></div> : <p className="teacher-learning-file">No finalized file attached yet.</p>}
              {replacedFiles.length > 0 && <details className="teacher-learning-history"><summary>Previous finalized files ({replacedFiles.length})</summary>{replacedFiles.map((file) => <p key={file.id}>{file.original_name} · replaced {new Date(file.created_at).toLocaleDateString()}</p>)}</details>}
              {resource.state === 'draft' && <div className="workflow-actions teacher-learning-card-actions">
                <button type="button" onClick={() => editResource(resource)} disabled={saving || !allocation || !period}>Edit draft</button>
                <label className="teacher-learning-file-picker" id={`learning-file-${resource.id}`}>{activeFile ? 'Choose replacement file' : 'Choose file'}
                  <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && startUpload(resource, event.target.files[0])} disabled={saving || !allocation || !period} />
                </label>
                {incompleteFiles.map((file) => <div className="teacher-learning-reservation" key={file.id}>
                  <p>Incomplete upload: <strong>{file.original_name}</strong> · reserved {new Date(file.created_at).toLocaleDateString()}</p>
                  {needsAbandonedUploadReview(file) && <small>This reservation is over 7 days old and needs review. It is retained; the system will not delete it automatically.</small>}
                  <label className="teacher-learning-file-picker">Choose same file to resume
                    <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && resumeUpload(resource, file, event.target.files[0])} disabled={saving || !allocation || !period} />
                  </label>
                </div>)}
                {pending?.resourceId === resource.id && <button type="button" onClick={uploadPending} disabled={saving || !allocation || !period}>{saving ? 'Uploading…' : `Upload ${pending.file.name}`}</button>}
                <button type="button" onClick={() => changeState(resource, 'published')} disabled={saving || !allocation || !period || !activeFile || pending?.resourceId === resource.id}>Publish</button>
                <button type="button" onClick={() => changeState(resource, 'archived')} disabled={saving}>Archive</button>
              </div>}
              {resource.state === 'published' && <div className="workflow-actions teacher-learning-card-actions"><button type="button" onClick={() => changeState(resource, 'archived')} disabled={saving}>Archive</button></div>}
              {!allocation && resource.state !== 'archived' && <small className="teacher-learning-revoked">This allocation is no longer active. Editing and publishing are paused.</small>}
            </article>
          }) : <p className="workflow-async-state">No learning resources yet. Create a draft for one of your assigned subjects.</p>}
        </div>
      </>}
    </section>
  )
}
