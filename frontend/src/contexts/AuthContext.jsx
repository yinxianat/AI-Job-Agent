import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import api, { setSessionExpiredHandler } from '../services/api'
import { AUTH_TOKEN_KEY, ALL_SESSION_KEYS, ALL_LOCAL_KEYS } from '../constants/storage'
import { API_ENDPOINTS } from '../constants/api'

const AuthContext = createContext(null)

function clearUserData() {
  ALL_SESSION_KEYS.forEach(key => {
    try { sessionStorage.removeItem(key) } catch (_) {}
  })
  ALL_LOCAL_KEYS.forEach(key => {
    try { localStorage.removeItem(key) } catch (_) {}
  })
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [token, setToken]             = useState(() => localStorage.getItem(AUTH_TOKEN_KEY))
  const [loading, setLoading]         = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Track whether the user was ever successfully authenticated in this session.
  // Used to distinguish "token expired mid-session" (show modal) from
  // "no token on first load" (silent redirect, no modal).
  const wasAuthenticated = useRef(false)

  // Attach token to every request when it changes
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      delete api.defaults.headers.common['Authorization']
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  }, [token])

  // Hydrate current user on mount / token change
  useEffect(() => {
    const hydrate = async () => {
      if (!token) { setLoading(false); return }
      try {
        const { data } = await api.get(API_ENDPOINTS.AUTH_ME)
        setUser(data)
        wasAuthenticated.current = true
      } catch {
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    hydrate()
  }, [token])

  // Register the session-expiry handler with the axios interceptor.
  // Fires only when the user was previously authenticated (avoids false
  // positives during initial hydration of an expired / missing token).
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (wasAuthenticated.current) {
        clearUserData()
        setToken(null)
        setUser(null)
        setSessionExpired(true)
        wasAuthenticated.current = false
      }
    })
    // Clean up on unmount so stale closures don't linger
    return () => setSessionExpiredHandler(null)
  }, [])

  const clearSessionExpired = useCallback(() => setSessionExpired(false), [])

  const login = useCallback(async (email, password) => {
    // Clear any stale session data from a previous user before starting a new session
    clearUserData()
    const { data } = await api.post(API_ENDPOINTS.AUTH_LOGIN, { email, password })
    setToken(data.access_token)
    setUser(data.user)
    wasAuthenticated.current = true
    return data.user
  }, [])

  const signup = useCallback(async (username, email, password) => {
    // Clear any stale session data from a previous user before starting a new session
    clearUserData()
    const { data } = await api.post(API_ENDPOINTS.AUTH_SIGNUP, { username, email, password })
    setToken(data.access_token)
    setUser(data.user)
    wasAuthenticated.current = true
    return data.user
  }, [])

  const logout = useCallback(() => {
    // Clear all ephemeral session data so it doesn't leak to the next user/session
    clearUserData()
    wasAuthenticated.current = false
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      sessionExpired, clearSessionExpired,
      login, signup, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
