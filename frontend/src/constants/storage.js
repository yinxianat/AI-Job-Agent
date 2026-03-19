// ── LocalStorage keys ─────────────────────────────────────────────────────────
export const AUTH_TOKEN_KEY = 'ja_token'

// ── SessionStorage keys ───────────────────────────────────────────────────────
export const SESSION_KEY_RESUME_FORM   = 'resume_tailor_form'
export const SESSION_KEY_RESUME_RESULT = 'resume_result'

// All session keys — cleared on login / logout to prevent data leakage between users
export const ALL_SESSION_KEYS = [SESSION_KEY_RESUME_FORM, SESSION_KEY_RESUME_RESULT]
