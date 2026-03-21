// ── Job search shared constants ───────────────────────────────────────────────
// Single source of truth — used by both JobSearchPage and ResumeGeneratorPage.

/** High-level job families shown as preset chips in the Job Family panel. */
export const PRESET_JOB_FAMILIES = [
  { label: 'Software Engineering',      emoji: '💻' },
  { label: 'Data & Analytics',          emoji: '📊' },
  { label: 'Product Management',        emoji: '🗂️' },
  { label: 'Design & UX',               emoji: '🎨' },
  { label: 'DevOps & Cloud',            emoji: '☁️' },
  { label: 'Cybersecurity & IT',        emoji: '🔒' },
  { label: 'AI & Machine Learning',     emoji: '🤖' },
  { label: 'Mobile Development',        emoji: '📱' },
  { label: 'Marketing',                 emoji: '📣' },
  { label: 'Sales & Business Dev',      emoji: '💼' },
  { label: 'Finance & Accounting',      emoji: '💰' },
  { label: 'Human Resources',           emoji: '🤝' },
  { label: 'Operations & Supply Chain', emoji: '⚙️' },
  { label: 'Project Management',        emoji: '📋' },
  { label: 'Customer Success',          emoji: '⭐' },
  { label: 'Legal & Compliance',        emoji: '⚖️' },
  { label: 'Healthcare',                emoji: '🏥' },
  { label: 'Education & Training',      emoji: '🎓' },
]

export const PRESET_CATEGORIES = [
  'Software Engineer',    'Frontend Engineer',     'Backend Engineer',     'Full Stack Engineer',
  'Product Manager',      'Data Scientist',         'Data Analyst',         'Machine Learning Engineer',
  'UX Designer',          'UI Designer',            'DevOps / SRE',         'Cloud Engineer',
  'Marketing Manager',    'Sales Representative',   'Business Analyst',
  'Project Manager',      'Finance Analyst',        'HR Manager',           'Cybersecurity Analyst',
  'Mobile Developer',     'QA Engineer',            'Technical Writer',
]

export const DATE_RANGES = [
  { label: 'Last 24 hrs',  value: '1'   },
  { label: 'Last 3 days',  value: '3'   },
  { label: 'Last 7 days',  value: '7'   },
  { label: 'Last 14 days', value: '14'  },
  { label: 'Last 30 days', value: '30'  },
  { label: 'Last 90 days', value: '90'  },
  { label: 'Last 120 days',value: '120' },
]

export const WORK_TYPE_OPTIONS = [
  { label: 'On-site', value: 'onsite', emoji: '🏢' },
  { label: 'Hybrid',  value: 'hybrid', emoji: '🔀' },
  { label: 'Remote',  value: 'remote', emoji: '🌐' },
]

export const RADIUS_STEPS = [0, 5, 10, 15, 25, 50, 100]

export const STATUS_MAP = {
  pending:   { label: 'Pending',    cls: 'badge-yellow' },
  running:   { label: 'Searching…', cls: 'badge-blue'   },
  completed: { label: 'Done',       cls: 'badge-green'  },
  failed:    { label: 'Failed',     cls: 'badge-red'    },
}

/** How often (ms) the frontend polls the job-task status endpoint. */
export const SEARCH_POLL_INTERVAL_MS = 2500

/** Map a multi-select work-type array → the Indeed remote filter string. */
export const workTypesToRemote = (types) => {
  if (!types.length || types.includes('onsite')) return 'no'      // broad / on-site
  if (types.includes('hybrid'))                  return 'include' // hybrid (±remote)
  return 'only'                                                    // remote-only
}
