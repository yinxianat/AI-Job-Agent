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
      // Even on network error show the success state — avoids user-enumeration
      // but surface a toast for genuine connectivity issues
      toast.error('Request failed — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-4">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <div className="card shadow-xl">
          <div className="card-body">

            {/* ── Success state ── */}
            {sent ? (
              <div className="text-center py-4 space-y-4">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Check your inbox</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  If <strong>{email}</strong> is registered with JobAgent, you'll receive a password
                  reset link shortly. Be sure to check your spam folder too.
                </p>
                <p className="text-xs text-gray-400">The link expires in 1 hour.</p>
                <div className="pt-2 space-y-2">
                  <button
                    onClick={() => { setSent(false); setEmail('') }}
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    Send to a different email
                  </button>
                  <Link to="/login" className="btn-primary w-full justify-center text-sm block text-center">
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
                    <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError('') }}
                      placeholder="you@example.com"
                      className={`input pl-10 ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                  {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full justify-center py-3"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending…
                    </span>
                  ) : 'Send reset link'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Back link */}
        {!sent && (
          <p className="mt-6 text-center text-sm text-gray-500">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-brand-600 font-medium hover:underline"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to log in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
