import { Link } from 'react-router-dom'
import { BriefcaseIcon } from 'lucide-react'
import { APP_NAME_PRIMARY, APP_NAME_SECONDARY, APP_COPYRIGHT } from '../constants/app'

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">

          {/* Logo */}
          <Link to="/"
            className="flex items-center gap-2 font-extrabold text-lg text-brand-700
              hover:text-brand-600 active:scale-95 transition-all duration-150">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <BriefcaseIcon className="w-3.5 h-3.5 text-white" />
            </div>
            {APP_NAME_PRIMARY}<span className="text-brand-400">{APP_NAME_SECONDARY}</span>
          </Link>

          {/* Nav links — horizontal scroll on small screens */}
          <nav className="flex gap-1 overflow-x-auto no-scrollbar">
            {[
              { to: '/',         label: 'Home'             },
              { to: '/generate', label: 'Resume Generator' },
              { to: '/resume',   label: 'Resume Tailor'    },
              { to: '/contact',  label: 'Contact'          },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="whitespace-nowrap px-3 py-2 text-sm text-gray-500 font-medium rounded-xl
                  hover:text-gray-900 hover:bg-gray-50 active:scale-95
                  transition-all duration-150 min-h-[40px] flex items-center"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Copyright */}
          <p className="text-xs text-gray-400 text-center sm:text-right">{APP_COPYRIGHT}</p>
        </div>
      </div>
    </footer>
  )
}
