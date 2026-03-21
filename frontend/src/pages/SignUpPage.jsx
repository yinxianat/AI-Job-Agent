import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  EyeIcon, EyeOffIcon, BriefcaseIcon,
  UserIcon, MailIcon, LockIcon, CheckCircleIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLORS = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500']
const STRENGTH_TEXT   = ['', 'text-red-500', 'text-yellow-600', 'text-blue-600', 'text-green-600']

function passwordStrength(pwd) {
  let score = 0
  if (pwd.length >= 8)          score++
  if (/[A-Z]/.test(pwd))        score++
  if (/[0-9]/.test(pwd))        score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  return score
}

const BENEFITS = ['AI Resume Tailor', 'Match Assessment', 'ZIP Export']

export default function SignUpPage() {
  const { signup } = useAuth()
  const navigate   = useNavigate()

  const [form, setForm]         = useState({ username: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [errors, setErrors]     = useState({})

  const strength = passwordStrength(form.password)

  const validate = () => {
    const e = {}
    if (!form.username || form.username.length < 3) e.username = 'Username must be at least 3 characters'
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email is required'
    if (!form.password || form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      await signup(form.username, form.email, form.password)
      toast.success('Account created! Welcome to JobAgent 🎉')
      navigate('/generate')
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

  const fieldCls = (err) =>
    `input ${err ? 'border-red-300 focus:ring-red-300 bg-red-50' : ''}`

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center
      bg-gradient-to-br from-brand-50 via-white to-blue-50 px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14
            bg-brand-600 rounded-2xl shadow-lg mb-5
            hover:bg-brand-700 hover:scale-105 transition-all duration-200">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Create your account</h1>
          <p className="mt-1.5 text-sm text-gray-500">Start your AI-powered job search today</p>
        </div>

        {/* Benefits strip */}
        <div className="flex justify-center gap-3 mb-6 flex-wrap">
          {BENEFITS.map((b) => (
            <div key={b}
              className="flex items-center gap-1 text-xs text-brand-600 font-semibold
                bg-brand-50 px-3 py-1.5 rounded-full border border-brand-100">
              <CheckCircleIcon className="w-3.5 h-3.5" /> {b}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="px-6 py-7">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Username */}
              <div>
                <label className="label">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                  <input type="text" value={form.username} onChange={set('username')}
                    placeholder="johndoe" className={`${fieldCls(errors.username)} pl-11`}
                    autoComplete="username" />
                </div>
                {errors.username && <p className="mt-1.5 text-xs text-red-500 animate-slide-down">{errors.username}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                  <input type="email" value={form.email} onChange={set('email')}
                    placeholder="you@example.com" className={`${fieldCls(errors.email)} pl-11`}
                    autoComplete="email" />
                </div>
                {errors.email && <p className="mt-1.5 text-xs text-red-500 animate-slide-down">{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                  <input type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')}
                    placeholder="Min. 8 characters"
                    className={`${fieldCls(errors.password)} pl-11 pr-12`}
                    autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8
                      flex items-center justify-center rounded-lg
                      text-gray-400 hover:text-gray-600 hover:bg-gray-100
                      active:scale-90 transition-all duration-150">
                    {showPass ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength meter */}
                {form.password && (
                  <div className="mt-2 space-y-1 animate-slide-down">
                    <div className="flex gap-1">
                      {[1,2,3,4].map((i) => (
                        <div key={i}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300
                            ${i <= strength ? STRENGTH_COLORS[strength] : 'bg-gray-100'}`} />
                      ))}
                    </div>
                    <p className={`text-xs font-semibold ${STRENGTH_TEXT[strength]}`}>
                      {STRENGTH_LABELS[strength]}
                    </p>
                  </div>
                )}
                {errors.password && <p className="mt-1.5 text-xs text-red-500 animate-slide-down">{errors.password}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label className="label">Confirm password</label>
                <div className="relative">
                  <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                  <input type="password" value={form.confirm} onChange={set('confirm')}
                    placeholder="Repeat your password"
                    className={`${fieldCls(errors.confirm)} pl-11`}
                    autoComplete="new-password" />
                </div>
                {errors.confirm && <p className="mt-1.5 text-xs text-red-500 animate-slide-down">{errors.confirm}</p>}
              </div>

              {/* Submit */}
              <button type="submit" className="btn-primary w-full py-3.5 text-base mt-2" disabled={loading}>
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : 'Create free account'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login"
            className="text-brand-600 font-bold hover:text-brand-700
              hover:underline active:scale-95 transition-all duration-150">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
