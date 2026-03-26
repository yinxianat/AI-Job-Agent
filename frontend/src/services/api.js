import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 60000, // 60s — scraping can be slow
  // NOTE: Do NOT set a global Content-Type here.
  // JSON requests get it via the request interceptor below;
  // FormData requests need the browser to set multipart/form-data + boundary automatically.
})

// ── Request interceptor: set Content-Type for JSON only ───────────────────────
api.interceptors.request.use((config) => {
  // Only set application/json when the body is NOT FormData.
  // For FormData, the browser must set the Content-Type with the correct boundary.
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json'
  }
  return config
})

// ── Session-expiry callback ────────────────────────────────────────────────────
// AuthContext calls setSessionExpiredHandler() once the user is hydrated.
// When a 401 arrives while the user is authenticated the handler fires,
// triggering the session-timeout modal in the UI.
let _onSessionExpired = null
export function setSessionExpiredHandler(fn) {
  _onSessionExpired = fn
}

// ── Response interceptor: surface error messages cleanly ──────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // 401 while a token is attached → session has expired on the server.
    // Notify AuthContext so it can show the timeout modal.
    if (err.response?.status === 401 && _onSessionExpired) {
      _onSessionExpired()
    }

    const detail = err.response?.data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((d) => d.msg).join(', ')
        : err.message || 'Something went wrong'
    return Promise.reject(new Error(message))
  }
)

export default api
