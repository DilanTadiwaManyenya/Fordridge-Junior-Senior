import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import crest from '../assets/fordridge-crest.jpeg'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import PasswordInput from './PasswordInput'
import PhoneNumberField, { toE164 } from './PhoneNumberField'
import { canEnterPortal, workflowError } from './workflow'

export default function PortalLogin({
  portalRole = 'student',
  signup = false,
}) {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(''),
    [phone, setPhone] = useState(''),
    [country, setCountry] = useState('ZW'),
    [password, setPassword] = useState('')
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [step, setStep] = useState('credentials'),
    [token, setToken] = useState(''),
    [verifiedPhone, setVerifiedPhone] = useState('')
  const canSignUp = signup && ['parent', 'student'].includes(portalRole)
  const [recover, setRecover] = useState(false)
  const roleTitle = portalRole[0].toUpperCase() + portalRole.slice(1)
  async function enter(user) {
    const result = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (result.error)
      throw new Error(
        'Signed in, but your school profile could not be loaded. Please retry or contact the school office.',
      )
    if (!canEnterPortal(result.data?.role, portalRole)) {
      await supabase.auth.signOut()
      throw new Error(
        `This account cannot access the ${roleTitle.toLowerCase()} portal. Choose the matching portal.`,
      )
    }
    navigate('/portal')
  }
  async function submit(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    setNotice('')
    setLoading(true)
    try {
      if (!isSupabaseConfigured)
        throw new Error(
          'Portal authentication is not configured yet. Contact the school office.',
        )
      if (step === 'password') {
        const r = await supabase.auth.updateUser({ password })
        if (r.error) throw r.error
        const out = await supabase.auth.signOut()
        if (out.error) throw out.error
        setRecover(false)
        setStep('credentials')
        setPassword('')
        setNotice('Password changed. Sign in with your new password.')
        return
      }
      if (step === 'verify') {
        const r = await supabase.auth.verifyOtp({
          phone: verifiedPhone,
          token: token.trim(),
          type: 'sms',
        })
        if (r.error) throw r.error
        if (recover) {
          setStep('password')
          setPassword('')
          setNotice('Phone verified. Choose a new password.')
        } else await enter(r.data.user)
        return
      }
      const number = toE164(phone, country)
      if (!number)
        throw new Error('Enter a valid phone number for the selected country.')
      if (recover) {
        const r = await supabase.auth.signInWithOtp({
          phone: number,
          options: { shouldCreateUser: false },
        })
        if (r.error) throw r.error
        setVerifiedPhone(number)
        setStep('verify')
        setNotice('Enter the SMS code sent to your registered phone.')
        return
      }
      if (canSignUp) {
        if (!fullName.trim()) throw new Error('Enter your full name.')
        const r = await supabase.auth.signUp({
          phone: number,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone_number: number,
              portal_role: portalRole,
            },
          },
        })
        if (r.error) throw r.error
        if (r.data.session) await enter(r.data.user)
        else {
          setVerifiedPhone(number)
          setStep('verify')
          setNotice('Enter the SMS code to verify your account.')
        }
      } else {
        const r = await supabase.auth.signInWithPassword({
          phone: number,
          password,
        })
        if (r.error)
          throw new Error(
            r.error.code === 'invalid_credentials'
              ? 'The phone number or password is incorrect.'
              : r.error.message,
          )
        await enter(r.data.user)
      }
    } catch (err) {
      setError(workflowError(err))
    } finally {
      setLoading(false)
    }
  }
  async function resend() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const r = recover
        ? await supabase.auth.signInWithOtp({
            phone: verifiedPhone,
            options: { shouldCreateUser: false },
          })
        : await supabase.auth.resend({ type: 'sms', phone: verifiedPhone })
      if (r.error) throw r.error
      setNotice('A new code has been requested. Check your phone.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  const heading =
    step === 'password'
      ? 'Choose a new password'
      : step === 'verify'
        ? 'Verify your phone'
        : recover
          ? 'Reset your password'
          : canSignUp
            ? `Create ${roleTitle.toLowerCase()} account`
            : `${roleTitle} sign in`
  return (
    <main className="portal-login">
      <section className="login-brand">
        <div className="brand-top">
          <img src={crest} alt="Fordridge crest" />
          <span>Fordridge Schools</span>
        </div>
        <div>
          <p className="eyebrow">School portal</p>
          <h1>
            Welcome to your
            <br />
            secure space.
          </h1>
          <p className="brand-copy">
            Use your phone number to access Fordridge portal services.
          </p>
        </div>
        <p className="motto">
          Learn <i /> Excel <i /> Achieve
        </p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <Link className="back" to="/portal/login">
            ← Choose portal
          </Link>
          <h2>{heading}</h2>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="setup-note">
              {notice}
            </p>
          )}
          <form onSubmit={submit}>
            {step === 'credentials' && (
              <>
                {canSignUp && !recover && (
                  <label>
                    Full name
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                )}
                <PhoneNumberField
                  value={phone}
                  onChange={setPhone}
                  country={country}
                  onCountryChange={setCountry}
                />
              </>
            )}
            {step === 'verify' && (
              <label>
                SMS verification code
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
            )}
            {(step === 'password' || (step === 'credentials' && !recover)) && (
              <label>
                {step === 'password' ? 'New password' : 'Password'}
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    canSignUp || step === 'password'
                      ? 'new-password'
                      : 'current-password'
                  }
                  minLength={canSignUp || step === 'password' ? 12 : 1}
                />
              </label>
            )}
            <button disabled={loading}>
              {loading
                ? 'Please wait…'
                : step === 'password'
                  ? 'Save new password'
                  : step === 'verify'
                    ? 'Verify code'
                    : recover
                      ? 'Send recovery code'
                      : canSignUp
                        ? 'Create account'
                        : 'Sign in to portal'}
            </button>
          </form>
          {step === 'verify' && (
            <button type="button" disabled={loading} onClick={resend}>
              Resend code
            </button>
          )}
          {step === 'credentials' && !canSignUp && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setRecover(!recover)
                setError('')
                setNotice('')
              }}
            >
              {recover ? 'Back to password sign in' : 'Forgot password?'}
            </button>
          )}
          {!recover && step === 'credentials' && portalRole !== 'staff' && (
            <p>
              {canSignUp ? (
                <Link to={`/portal/${portalRole}/login`}>
                  Already have an account? Sign in
                </Link>
              ) : (
                <Link to={`/portal/${portalRole}/signup`}>
                  Need an account? Sign up
                </Link>
              )}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
