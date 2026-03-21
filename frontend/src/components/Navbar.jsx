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
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-brand-700">
          <BriefcaseIcon className="w-6 h-6" />
          <span>{APP_NAME_PRIMARY}<span className="text-brand-500">{APP_NAME_SECONDARY}</span></span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <span className="flex items-center gap-1.5 text-sm text-gray-600">
                <UserCircleIcon className="w-5 h-5 text-brand-500" />
                {user.username}
              </span>
              <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
                <LogOutIcon className="w-4 h-4" /> Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login"  className="btn-secondary text-sm py-1.5 px-4">Log in</Link>
              <Link to="/signup" className="btn-primary  text-sm py-1.5 px-4">Get started</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
        >
          {menuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            {user ? (
              <button onClick={handleLogout} className="btn-secondary w-full justify-center">
                <LogOutIcon className="w-4 h-4" /> Log out
              </button>
            ) : (
              <>
                <Link to="/login"  onClick={() => setMenuOpen(false)} className="btn-secondary w-full justify-center block text-center">Log in</Link>
                <Link to="/signup" onClick={() => setMenuOpen(false)} className="btn-primary  w-full justify-center block text-center">Get started</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
