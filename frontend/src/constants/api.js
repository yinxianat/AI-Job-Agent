// ── API endpoint paths ────────────────────────────────────────────────────────
// Centralised here so URL changes propagate everywhere automatically.

export const API_ENDPOINTS = {
  // Auth
  AUTH_ME:             '/api/auth/me',
  AUTH_LOGIN:          '/api/auth/login',
  AUTH_SIGNUP:         '/api/auth/signup',
  AUTH_FORGOT_PASSWORD:'/api/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/api/auth/reset-password',

  // Jobs
  JOBS_SEARCH:         '/api/jobs/search',
  JOBS_TASK:           (taskId) => `/api/jobs/task/${taskId}`,
  JOBS_MATCH:          '/api/jobs/match',
  JOBS_EXPORT:         (taskId) => `/api/jobs/export/${taskId}`,

  // Resume tailor
  RESUME_TAILOR:        '/api/resume/tailor',
  RESUME_EXTRACT_TEXT:  '/api/resume/extract-text',
  RESUME_TRACKER:       '/api/resume/tracker',
  RESUME_SAVE_PREVIEW:  '/api/resume/save-preview',
  RESUME_RENDER_PDF:    '/api/resume/render-pdf',
  RESUME_RENDER_DOCX:   '/api/resume/render-docx',

  // Resume generator (batch wizard)
  GENERATOR_SEARCH:         '/api/jobs/search',
  GENERATOR_TASK:           (taskId) => `/api/jobs/task/${taskId}`,
  GENERATOR_RUN:            '/api/resume/batch-start',
  GENERATOR_BATCH_STATUS:   (taskId) => `/api/resume/batch-status/${taskId}`,
  GENERATOR_EXPORT:         (taskId) => `/api/resume/batch-export/${taskId}`,
  GENERATOR_DOWNLOAD_ZIP:   (taskId) => `/api/resume/batch-download-zip/${taskId}`,
  GENERATOR_PARSE_SHEET:    '/api/jobs/parse-spreadsheet',
  GENERATOR_LIST_SHEETS:    '/api/jobs/list-sheets',

  // Contact
  CONTACT_SEND:        '/api/contact/send',

  // File downloads / browser
  FILES_BROWSE:        '/api/files/browse',
  FILES_DOWNLOAD:      (filename) => `/api/files/${filename}`,

  // Health
  HEALTH:              '/api/health',
}
