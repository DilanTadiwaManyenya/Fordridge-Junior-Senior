import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import crest from '../assets/fordridge-crest.jpeg'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import PasswordInput from './PasswordInput'
import PhoneNumberField, { toE164 } from './PhoneNumberField'

const roleTitle = role => role ? `${role[0].toUpperCase()}${role.slice(1)}` : 'Portal'

export default function PortalLogin({ portalRole = 'student', signup = false }) {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [country, setCountry] = useState('ZW')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const canSignUp = signup && ['parent', 'student'].includes(portalRole)

  async function submit(event) {
    event.preventDefault()
    setError('')
    const phoneNumber = toE164(phone, country)
    if (!phoneNumber) {
      setError('Enter a valid phone number for the selected country.')
      return
    }
    if (!isSupabaseConfigured) {
      setError('Portal authentication is not configured yet. Add the Supabase environment values to continue.')
      return
    }
    setLoading(true)
    if (canSignUp) {
      const { error: authError } = await supabase.auth.signUp({
        phone: phoneNumber,
        password,
        options: { data: { full_name: fullName, phone_number: phoneNumber, portal_role: portalRole } },
      })
      setLoading(false)
      if (authError) setError(authError.message)
      else setError('Account created. Complete phone verification if your Supabase project requires it, then sign in.')
      return
    }
    const { data, error: authError } = await supabase.auth.signInWithPassword({ phone: phoneNumber, password })
    if (authError) {
      setLoading(false)
      setError('The phone number or password is incorrect.')
      return
    }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    const allowedRole = portalRole === 'staff' ? ['staff', 'admin'].includes(profile?.role) : profile?.role === portalRole
    if (profileError || !allowedRole) {
      await supabase.auth.signOut()
      setLoading(false)
      setError(`This account is not authorised for the ${roleTitle(portalRole).toLowerCase()} portal.`)
      return
    }
    setLoading(false)
    navigate('/portal')
  }

  const heading = canSignUp ? `Create ${roleTitle(portalRole)} account` : `${roleTitle(portalRole)} sign in`
  return <main className="portal-login"><section className="login-brand"><div className="brand-top"><img src={crest} alt="Fordridge crest" /><span>Fordridge Schools</span></div><div><p className="eyebrow">School portal</p><h1>Welcome to your<br />secure space.</h1><p className="brand-copy">Use your phone number to access Fordridge portal services.</p></div><p className="motto">Learn <i /> Excel <i /> Achieve</p></section><section className="login-panel"><div className="login-card"><Link className="back" to="/portal/login">← Choose portal</Link><h2>{heading}</h2><p className="muted">Zimbabwe (+263) is selected by default.</p><form onSubmit={submit}>{canSignUp && <label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" required /></label>}<PhoneNumberField value={phone} onChange={setPhone} country={country} onCountryChange={setCountry} /><label>Password<PasswordInput id="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={canSignUp ? 'new-password' : 'current-password'} minLength={8} /></label>{error && <p className={error.startsWith('Account created') ? 'setup-note' : 'form-error'}>{error}</p>}<button disabled={loading}>{loading ? 'Please wait…' : canSignUp ? 'Create account' : 'Sign in to portal'}</button></form>{portalRole !== 'staff' && <p className="muted">{canSignUp ? <Link to={`/portal/${portalRole}/login`}>Already have an account? Sign in</Link> : <Link to={`/portal/${portalRole}/signup`}>Need an account? Sign up</Link>}</p>}</div></section></main>
}
