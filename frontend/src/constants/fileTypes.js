// ── Accepted MIME types for file upload inputs ────────────────────────────────

/** Resume uploads: PDF, DOCX, DOC */
export const RESUME_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
}

/** Job-log uploads: PDF, DOCX, DOC, XLSX, XLS, TXT, CSV */
export const JOB_LOG_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
}

/** Max file sizes */
export const RESUME_MAX_FILE_SIZE   = 10 * 1024 * 1024   // 10 MB
export const JOB_LOG_MAX_FILE_SIZE  = 20 * 1024 * 1024   // 20 MB

/** Max number of files per dropzone */
export const RESUME_MAX_FILES  = 10
export const JOB_LOG_MAX_FILES = 10
