import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefcaseIcon, MailIcon, ArrowLeftIcon, CheckCircleIcon } from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { API_ENDPOINTS } from '../constants/api'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const validate = () => {
    if (!email) return 'Email address is required'
    if (!/\S+@\S+\.\S+/.test(email)) return 'Please enter a valid email address'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true)
    setError('')
    try {
      await api.post(API_ENDPOINTS.AUTH_FORGOT_PASSWORD, { email })
      setSent(true)
    } catch {
      toast.error('Request failed — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center
      bg-gradient-to-br from-brand-50 via-white to-blue-50 px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14
            bg-brand-600 rounded-2xl shadow-lg mb-5
            hover:bg-brand-700 hover:scale-105 transition-all duration-200">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Forgot your password?</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="px-6 py-7">

            {sent ? (
              /* ── Success state ── */
              <div className="text-center py-4 space-y-5">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto animate-pop-in">
                  <CheckCircleIcon className="w-8 h-8 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Check your inbox</h2>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                    If <strong className="text-gray-700">{email}</strong> is registered,
                    you'll receive a password reset link shortly. Check your spam folder too.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">The link expires in 1 hour.</p>
                </div>
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => { setSent(false); setEmail('') }}
                    className="btn-secondary w-full">
                    Send to a different email
                  </button>
                  <Link to="/login" className="btn-primary w-full">
                    Back to log in
                  </Link>
                </div>
              </div>

            ) : (
              /* ── Request form ── */
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label className="label">Email address</label>
                  <div className="relative">
                    <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError('') }}
                      placeholder="you@example.com"
                      className={`input pl-11 ${error ? 'border-red-300 focus:ring-red-300 bg-red-50' : ''}`}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1 animate-slide-down">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      {error}
                    </p>
                  )}
                </div>

                <button type="submit" className="btn-primary w-full py-3.5 text-base" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : 'Send reset link'}
                </button>
              </form>
            )}
          </div>
        </div>

        {!sent && (
          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/login"
              className="inline-flex items-center gap-1 text-brand-600 font-bold
                hover:text-brand-700 hover:underline active:scale-95 transition-all duration-150">
              <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to log in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
