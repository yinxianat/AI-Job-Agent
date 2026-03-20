import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  BriefcaseIcon, LockIcon, EyeIcon, EyeOffIcon,
  CheckCircleIcon, AlertCircleIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { API_ENDPOINTS } from '../constants/api'

export default function ResetPasswordPage() {
  const [searchParams]          = useSearchParams()
  const navigate                = useNavigate()
  const token                   = searchParams.get('token') || ''

  const [form, setForm]         = useState({ password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [errors, setErrors]     = useState({})
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)

  // If there's no token at all, show an error immediately
  const missingToken = !token

  const validate = () => {
    const e = {}
    if (!form.password)              e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (!form.confirm)               e.confirm  = 'Please confirm your new password'
    else if (form.confirm !== form.password) e.confirm = 'Passwords do not match'
    return e
  }

  const handleSubmit = async (ev) => {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      await api.post(API_ENDPOINTS.AUTH_RESET_PASSWORD, {
        token,
        password: form.password,
      })
      setSuccess(true)
      toast.success('Password updated successfully!')
    } catch (err) {
      const detail = err.response?.data?.detail || err.message
      toast.error(detail)
      setErrors({ submit: detail })
    } finally {
      setLoading(false)
    }
  }

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((er) => ({ ...er, [field]: '', submit: '' }))
  }

  // Password strength indicator
  const strength = (() => {
    const p = form.password
    if (!p)         return { level: 0, label: '',        color: '' }
    if (p.length < 8) return { level: 1, label: 'Too short', color: 'bg-red-400' }
    let score = 0
    if (/[a-z]/.test(p)) score++
    if (/[A-Z]/.test(p)) score++
    if (/[0-9]/.test(p)) score++
    if (/[^a-zA-Z0-9]/.test(p)) score++
    if (score <= 1) return { level: 1, label: 'Weak',   color: 'bg-red-400'    }
    if (score === 2) return { level: 2, label: 'Fair',   color: 'bg-yellow-400' }
    if (score === 3) return { level: 3, label: 'Good',   color: 'bg-blue-400'   }
    return             { level: 4, label: 'Strong', color: 'bg-green-500'  }
  })()

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-4">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
          <p className="mt-1 text-sm text-gray-500">
            Choose a strong password for your JobAgent account.
          </p>
        </div>

        <div className="card shadow-xl">
          <div className="card-body">

            {/* ── Missing / invalid token error ── */}
            {missingToken ? (
              <div className="text-center py-4 space-y-4">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircleIcon className="w-8 h-8 text-red-500" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Invalid reset link</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  This password reset link is missing or malformed.
                  Please request a new one.
                </p>
                <Link
                  to="/forgot-password"
                  className="btn-primary w-full justify-center text-sm block text-center"
                >
                  Request new reset link
                </Link>
              </div>

            ) : success ? (
              /* ── Success state ── */
              <div className="text-center py-4 space-y-4">
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Password updated!</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Your password has been changed successfully.
                  You can now log in with your new password.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="btn-primary w-full justify-center text-sm"
                >
                  Log in now
                </button>
              </div>

            ) : (
              /* ── Reset form ── */
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>

                {/* Global submit error */}
                {errors.submit && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{errors.submit}</span>
                  </div>
                )}

                {/* New password */}
                <div>
                  <label className="label">New password</label>
                  <div className="relative">
                    <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={set('password')}
                      placeholder="At least 8 characters"
                      className={`input pl-10 pr-10 ${errors.password ? 'border-red-400 focus:ring-red-400' : ''}`}
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPass ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Strength meter */}
                  {form.password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1 h-1.5">
                        {[1, 2, 3, 4].map((n) => (
                          <div
                            key={n}
                            className={`flex-1 rounded-full transition-colors ${
                              n <= strength.level ? strength.color : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      {strength.label && (
                        <p className={`text-xs font-medium ${
                          strength.level <= 1 ? 'text-red-500' :
                          strength.level === 2 ? 'text-yellow-600' :
                          strength.level === 3 ? 'text-blue-600' : 'text-green-600'
                        }`}>
                          {strength.label} password
                        </p>
                      )}
                    </div>
                  )}
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="label">Confirm new password</label>
                  <div className="relative">
                    <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showConf ? 'text' : 'password'}
                      value={form.confirm}
                      onChange={set('confirm')}
                      placeholder="Re-enter your password"
                      className={`input pl-10 pr-10 ${errors.confirm ? 'border-red-400 focus:ring-red-400' : ''}`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConf(!showConf)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConf ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Match indicator */}
                  {form.confirm && form.password && !errors.confirm && (
                    <p className={`mt-1 text-xs font-medium flex items-center gap-1 ${
                      form.confirm === form.password ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {form.confirm === form.password
                        ? <><CheckCircleIcon className="w-3 h-3" /> Passwords match</>
                        : '✕ Passwords do not match'
                      }
                    </p>
                  )}
                  {errors.confirm && <p className="mt-1 text-xs text-red-500">{errors.confirm}</p>}
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full justify-center py-3"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Updating…
                    </span>
                  ) : (
                    <><LockIcon className="w-4 h-4" /> Set new password</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        {!success && !missingToken && (
          <p className="mt-6 text-center text-sm text-gray-500">
            Link expired?{' '}
            <Link to="/forgot-password" className="text-brand-600 font-medium hover:underline">
              Request a new one
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
