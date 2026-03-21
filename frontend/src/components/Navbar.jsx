import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { BriefcaseIcon, MenuIcon, XIcon, UserCircleIcon, LogOutIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { APP_NAME_PRIMARY, APP_NAME_SECONDARY } from '../constants/app'

const navLinks = [
  { to: '/',         label: 'Home',             public: true  },
  { to: '/generate', label: 'Resume Generator', public: false },
  { to: '/resume',   label: 'Resume Tailor',    public: false },
  { to: '/contact',  label: 'Contact',          public: true  },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/')
    setMenuOpen(false)
  }

  const visibleLinks = navLinks.filter((l) => l.public || user)

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* ── Logo ── */}
        <Link
          to="/"
          className="flex items-center gap-2 font-extrabold text-xl text-brand-700
            hover:text-brand-600 active:scale-95 transition-all duration-150"
        >
          <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center
            group-hover:bg-brand-700 transition-colors">
            <BriefcaseIcon className="w-4 h-4 text-white" />
          </div>
          <span>{APP_NAME_PRIMARY}<span className="text-brand-400">{APP_NAME_SECONDARY}</span></span>
        </Link>

        {/* ── Desktop nav ── */}
        <div className="hidden md:flex items-center gap-1 bg-gray-50 rounded-2xl px-1.5 py-1.5">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-white/70 active:scale-95'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* ── Desktop auth ── */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-1.5 text-sm text-gray-600 px-3 py-2
                bg-gray-50 rounded-xl border border-gray-100">
                <UserCircleIcon className="w-4 h-4 text-brand-500" />
                <span className="font-medium">{user.username}</span>
              </div>
              <button onClick={handleLogout} className="btn-ghost text-sm">
                <LogOutIcon className="w-4 h-4" /> Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login"  className="btn-ghost">Log in</Link>
              <Link to="/signup" className="btn-primary py-2.5 text-sm">Get started</Link>
            </>
          )}
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl
            text-gray-600 hover:bg-gray-100 active:scale-90
            transition-all duration-150"
        >
          <span className={`transition-all duration-200 ${menuOpen ? 'rotate-90 opacity-0 absolute' : 'rotate-0 opacity-100'}`}>
            <MenuIcon className="w-5 h-5" />
          </span>
          <span className={`transition-all duration-200 ${menuOpen ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0 absolute'}`}>
            <XIcon className="w-5 h-5" />
          </span>
        </button>
      </nav>

      {/* ── Mobile menu — slide down ── */}
      <div
        style={{
          maxHeight: menuOpen ? '500px' : '0px',
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
        }}
        className="md:hidden border-t border-gray-50 bg-white"
      >
        <div className="px-4 pt-3 pb-5 space-y-1">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-4 py-3.5 rounded-2xl text-sm font-semibold
                 transition-all duration-150 min-h-[52px] ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-50 active:scale-[0.98]'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}

          <div className="pt-3 border-t border-gray-50 space-y-2">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-2xl">
                  <UserCircleIcon className="w-5 h-5 text-brand-500" />
                  <span className="text-sm font-semibold text-gray-700">{user.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-secondary w-full justify-center min-h-[52px]">
                  <LogOutIcon className="w-4 h-4" /> Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="btn-secondary w-full justify-center min-h-[52px]">
                  Log in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="btn-primary w-full justify-center min-h-[52px]">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
