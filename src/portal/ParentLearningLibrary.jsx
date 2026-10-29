import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'
import './workflow.css'
import './teacher-learning-library.css'

function matchesLearner(resource, learner) {
  return resource.campus_id === learner.campus_id
    && resource.class_level === learner.class_level
    && (resource.class_stream === null || resource.class_stream === learner.class_stream)
}

export default function ParentLearningLibrary({ user }) {
  const [learners, setLearners] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [resources, setResources] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setLearners([])
    setSelectedId('')
    setResources([])
    setFiles([])
    try {
      const { data: links, error: linkError } = await supabase
        .from('student_guardians')
        .select('student:profiles!student_guardians_student_id_fkey(id,full_name,campus_id,class_level,class_stream,enrollment_status)')
        .eq('parent_id', user.id)
      if (linkError) throw linkError
      const activeLearners = (links || []).map((row) => row.student).filter((row) => row?.enrollment_status === 'active')
      setLearners(activeLearners)
      setSelectedId((current) => activeLearners.some((row) => row.id === current) ? current : activeLearners[0]?.id || '')
      if (!activeLearners.length) {
        setResources([])
        setFiles([])
        return
      }
      const { data: resourceRows, error: resourceError } = await supabase
        .from('learning_resources')
        .select('id,title,description,campus_id,class_level,class_stream,subject,academic_year,academic_term,published_at')
        .eq('state', 'published')
        .order('published_at', { ascending: false })
      if (resourceError) throw resourceError
      const visible = resourceRows || []
      setResources(visible)
      const resourceIds = visible.map((row) => row.id)
      if (resourceIds.length) {
        const { data: fileRows, error: fileError } = await supabase
          .from('learning_resource_files')
          .select('id,resource_id,bucket_id,object_path,original_name,mime_type,size_bytes')
          .in('resource_id', resourceIds)
          .eq('ready', true)
          .eq('active', true)
        if (fileError) throw fileError
        setFiles(fileRows || [])
      } else setFiles([])
    } catch (cause) {
      setError(workflowError(cause))
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => { load() }, [load])

  const learner = useMemo(() => learners.find((row) => row.id === selectedId) || null, [learners, selectedId])
  const learnerResources = useMemo(() => learner ? resources.filter((resource) => matchesLearner(resource, learner)) : [], [resources, learner])
  const fileByResource = useMemo(() => new Map(files.map((file) => [file.resource_id, file])), [files])

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

  return (
    <section className="workflow-panel teacher-learning-library">
      <div className="workflow-heading"><div><p className="eyebrow">Parent workspace</p><h1>Learning library</h1>
        <p>Published learning resources for your currently enrolled, school-linked learner.</p></div></div>
      {error && <><p className="workflow-error" role="alert">{error}</p><button type="button" className="secondary-action" onClick={load}>Try again</button></>}
      {loading ? <p className="workflow-async-state" role="status">Loading linked learner resources…</p> : !learners.length ?
        <p className="workflow-async-state">No currently enrolled learner is linked to this parent account. Contact the school office if this looks wrong.</p> : <>
          {learners.length > 1 ? <label className="parent-learning-learner">Choose learner
            <select aria-label="Choose learner" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {learners.map((row) => <option key={row.id} value={row.id}>{row.full_name || 'Learner'} · {[row.class_level, row.class_stream].filter(Boolean).join(' · ') || 'Class details not recorded'}</option>)}
            </select>
          </label> : learner && <p className="parent-learning-learner">Learner: <strong>{learner.full_name || 'Learner'}</strong> · {[learner.class_level, learner.class_stream].filter(Boolean).join(' · ')}</p>}
          {learnerResources.length ? <div className="workflow-scroll teacher-learning-list">
            {learnerResources.map((resource) => {
              const file = fileByResource.get(resource.id)
              return <article className="teacher-learning-card" key={resource.id}>
                <span className="teacher-learning-state state-published">Published</span>
                <h2>{resource.title}</h2>
                <p>{resource.subject} · {resource.class_level}{resource.class_stream ? ` · ${resource.class_stream}` : ' · all streams'} · {resource.academic_year} · {resource.academic_term}</p>
                {resource.description && <p className="teacher-learning-description">{resource.description}</p>}
                {file ? <div className="teacher-learning-file"><span>{file.original_name} · {(file.size_bytes / 1024 / 1024).toFixed(2)} MiB</span>
                  <button type="button" onClick={() => openFile(file)}>Open private file</button></div> : <p className="teacher-learning-file">The resource file is not currently available.</p>}
              </article>
            })}
          </div> : <p className="workflow-async-state">No published learning resources are available for this learner’s current class yet.</p>}
        </>}
    </section>
  )
}
