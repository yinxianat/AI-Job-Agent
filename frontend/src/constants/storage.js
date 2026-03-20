// ── LocalStorage keys ─────────────────────────────────────────────────────────
export const AUTH_TOKEN_KEY          = 'ja_token'
export const LOCAL_KEY_OUTPUT_FOLDER = 'ja_output_folder'  // last-used output folder path

// ── SessionStorage keys ───────────────────────────────────────────────────────
export const SESSION_KEY_RESUME_FORM   = 'resume_tailor_form'
export const SESSION_KEY_RESUME_RESULT = 'resume_result'

// Cleared on login / logout to prevent data leakage between users
export const ALL_SESSION_KEYS = [SESSION_KEY_RESUME_FORM, SESSION_KEY_RESUME_RESULT]
export const ALL_LOCAL_KEYS   = [LOCAL_KEY_OUTPUT_FOLDER]  // user-specific localStorage (excluding auth token)
