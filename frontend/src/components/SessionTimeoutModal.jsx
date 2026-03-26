import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * SessionTimeoutModal
 *
 * Shown automatically whenever the backend returns a 401 while the user
 * was already authenticated — indicating the JWT has expired server-side.
 *
 * Pressing "Log In" dismisses the modal and navigates to /login.
 * The modal traps focus (accessible) and closes on Escape key.
 */
export default function SessionTimeoutModal() {
  const { sessionExpired, clearSessionExpired } = useAuth()
  const navigate = useNavigate()

  // Close on Escape key
  useEffect(() => {
    if (!sessionExpired) return
    const handler = (e) => {
      if (e.key === 'Escape') handleLogin()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sessionExpired]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sessionExpired) return null

  function handleLogin() {
    clearSessionExpired()
    navigate('/login')
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
    >
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 flex flex-col items-center text-center">

        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h2
          id="session-timeout-title"
          className="text-xl font-bold text-gray-900 mb-2"
        >
          Session Expired
        </h2>

        {/* Body */}
        <p
          id="session-timeout-desc"
          className="text-sm text-gray-500 leading-relaxed mb-7"
        >
          Due to inactivity, your session has timed out.
          <br />
          Please log in again to continue.
        </p>

        {/* CTA */}
        <button
          onClick={handleLogin}
          autoFocus
          className="w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800
                     text-white font-semibold py-2.5 rounded-xl transition-colors
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          Log In
        </button>
      </div>
    </div>
  )
}
