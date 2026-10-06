import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { workflowError } from './workflow'

export default function ReportPublication() {
  const [campuses, setCampuses] = useState([])
  const [publications, setPublications] = useState([])
  const [draft, setDraft] = useState({ campus_id: '', academic_year: String(new Date().getFullYear()), academic_term: 'Term 1' })
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const [campusResult, publicationResult] = await Promise.all([supabase.from('campuses').select('id,name').order('name'), supabase.from('report_publications').select('*,campus:campuses(name)').order('academic_year', { ascending: false })])
    const failed = [campusResult, publicationResult].find(item => item.error)
    if (failed) setError(workflowError(failed.error)); else { setCampuses(campusResult.data || []); setPublications(publicationResult.data || []); setDraft(current => ({ ...current, campus_id: current.campus_id || campusResult.data?.[0]?.id || '' })) }
  }, [])
  useEffect(() => { load() }, [load])
  async function publish(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const user = (await supabase.auth.getUser()).data.user
    const { error: saveError } = await supabase.from('report_publications').upsert({ ...draft, academic_year: Number(draft.academic_year), published_at: new Date().toISOString(), published_by: user?.id }, { onConflict: 'campus_id,academic_year,academic_term' })
    if (saveError) setError(workflowError(saveError)); else { setNotice('Reports are now marked as published for this period.'); await load() }
    setSaving(false)
  }
  async function unpublish(item) {
    setSaving(true); setError(''); setNotice('')
    const { error: saveError } = await supabase.from('report_publications').update({ published_at: null, published_by: null }).eq('id', item.id)
    if (saveError) setError(workflowError(saveError)); else { setNotice('Reports returned to draft.'); await load() }
    setSaving(false)
  }
  return <section><header className="workflow-heading"><div><p className="eyebrow">Formal reports</p><h1>Report release</h1><p className="progress-report-note">Publish only after marks, grade bands and approval names have been checked.</p></div></header>{error && <p className="workflow-error" role="alert">{error}</p>}{notice && <p className="workflow-notice" role="status">{notice}</p>}<form className="workflow-panel workflow-form" onSubmit={publish}><label>Campus<select required value={draft.campus_id} onChange={e => setDraft({ ...draft, campus_id: e.target.value })}>{campuses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Academic year<input required type="number" min="2000" value={draft.academic_year} onChange={e => setDraft({ ...draft, academic_year: e.target.value })} /></label><label>Term<select value={draft.academic_term} onChange={e => setDraft({ ...draft, academic_term: e.target.value })}>{['Term 1','Term 2','Term 3'].map(item => <option key={item}>{item}</option>)}</select></label><div className="workflow-actions workflow-wide"><button className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Publish reports'}</button></div></form><section className="workflow-panel"><h2>Release status</h2>{publications.length ? publications.map(item => <article className="report-release-row" key={item.id}><div><strong>{item.campus?.name} · {item.academic_year} · {item.academic_term}</strong><small>{item.published_at ? `Published ${new Date(item.published_at).toLocaleString()}` : 'Draft'}</small></div><button className="secondary-action" disabled={saving || !item.published_at} onClick={() => unpublish(item)}>Return to draft</button></article>) : <p className="portal-empty-copy">No report period has been published yet.</p>}</section></section>
}
