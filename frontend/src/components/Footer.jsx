import { Link } from 'react-router-dom'
import { BriefcaseIcon } from 'lucide-react'
import { APP_NAME_PRIMARY, APP_NAME_SECONDARY, APP_COPYRIGHT } from '../constants/app'

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-brand-700">
            <BriefcaseIcon className="w-5 h-5" />
            {APP_NAME_PRIMARY}<span className="text-brand-500">{APP_NAME_SECONDARY}</span>
          </Link>
          <nav className="flex gap-6 text-sm text-gray-500">
            <Link to="/"        className="hover:text-gray-900 transition-colors">Home</Link>
            <Link to="/jobs"    className="hover:text-gray-900 transition-colors">Job Search</Link>
            <Link to="/resume"  className="hover:text-gray-900 transition-colors">Resume Tailor</Link>
            <Link to="/contact" className="hover:text-gray-900 transition-colors">Contact</Link>
          </nav>
          <p className="text-xs text-gray-400">{APP_COPYRIGHT}</p>
        </div>
      </div>
    </footer>
  )
}
