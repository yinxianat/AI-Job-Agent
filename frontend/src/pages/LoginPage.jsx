import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { EyeIcon, EyeOffIcon, BriefcaseIcon, MailIcon, LockIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname || '/generate'

  const [form, setForm]         = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [errors, setErrors]     = useState({})

  const validate = () => {
    const e = {}
    if (!form.email)    e.email    = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address'
    if (!form.password) e.password = 'Password is required'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      await login(form.email, form.password)
      toast.success('Welcome back!')
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((er) => ({ ...er, [field]: '' }))
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
          <h1 className="text-2xl font-extrabold text-gray-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-gray-500">Log in to your JobAgent account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="px-6 py-7">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>

              {/* Email */}
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@example.com"
                    className={`input pl-11 ${errors.email ? 'border-red-300 focus:ring-red-300 bg-red-50' : ''}`}
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1 animate-slide-down">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label !mb-0">Password</label>
                  <Link to="/forgot-password"
                    className="text-xs text-brand-600 font-semibold hover:text-brand-700
                      hover:underline active:scale-95 transition-all duration-150">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="••••••••"
                    className={`input pl-11 pr-12 ${errors.password ? 'border-red-300 focus:ring-red-300 bg-red-50' : ''}`}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8
                      flex items-center justify-center rounded-lg
                      text-gray-400 hover:text-gray-600 hover:bg-gray-100
                      active:scale-90 transition-all duration-150"
                  >
                    {showPass ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1 animate-slide-down">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button type="submit" className="btn-primary w-full py-3.5 text-base mt-1" disabled={loading}>
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Logging in…
                  </>
                ) : 'Log in'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/signup"
            className="text-brand-600 font-bold hover:text-brand-700
              hover:underline active:scale-95 transition-all duration-150">
            Sign up for free
          </Link>
        </p>
      </div>
    </div>
  )
}
