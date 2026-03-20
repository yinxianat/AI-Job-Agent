/**
 * LocationAutocomplete
 *
 * A controlled text input with an inline Nominatim (OpenStreetMap) autocomplete
 * dropdown.  Supports city names, state names, and US zip codes.
 *
 * Props:
 *   value          {string}   – controlled value
 *   onChange(str)             – called when text changes (free typing)
 *   onSelect(str)             – called when a suggestion is picked
 *   placeholder    {string}
 *   className      {string}   – extra classes for the outer wrapper div
 *   inputClassName {string}   – extra classes for the <input>
 *   disabled       {boolean}
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { MapPinIcon, XIcon, Loader2Icon } from 'lucide-react'

// ── Nominatim search ──────────────────────────────────────────────────────────
async function searchNominatim(query) {
  // If it looks like a US zip code, bias toward address search
  const isZip = /^\d{5}(-\d{4})?$/.test(query.trim())
  const params = new URLSearchParams({
    q:               query,
    format:          'json',
    limit:           '7',
    addressdetails:  '1',
    countrycodes:    'us',   // keep suggestions US-focused (remove to allow global)
    ...(isZip ? { postalcode: query.trim() } : {}),
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { 'Accept-Language': 'en' } },
  )
  return res.ok ? res.json() : []
}

// ── Format a Nominatim result into a clean human label ───────────────────────
function formatResult(item) {
  const a = item.address || {}

  // Zip-code result
  const zip     = a.postcode
  const city    = a.city || a.town || a.village || a.suburb || a.county || ''
  const state   = a.state_code || a.state || ''
  const country = (a.country_code || '').toUpperCase()

  if (zip && city && state)   return `${city}, ${state} ${zip}`
  if (zip && city)             return `${zip} – ${city}`
  if (zip)                     return zip
  if (city && state)           return `${city}, ${state}`
  if (city && country && country !== 'US') return `${city}, ${country}`
  if (city)                    return city

  // Fallback: trim to first two segments of display_name
  return (item.display_name || '').split(',').slice(0, 2).join(',').trim()
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LocationAutocomplete({
  value        = '',
  onChange,
  onSelect,
  placeholder  = 'City, state or zip code',
  className    = '',
  inputClassName = '',
  disabled     = false,
}) {
  const [suggestions,  setSuggestions]  = useState([])
  const [loading,      setLoading]      = useState(false)
  const [open,         setOpen]         = useState(false)
  const [activeIdx,    setActiveIdx]    = useState(-1)

  const inputRef     = useRef(null)
  const dropdownRef  = useRef(null)
  const debounceRef  = useRef(null)
  const ignoreBlur   = useRef(false)   // prevents dropdown closing on suggestion click

  // ── Fetch suggestions (debounced 300 ms) ──────────────────────────────────
  const fetchSuggestions = useCallback((q) => {
    clearTimeout(debounceRef.current)
    if (!q || q.trim().length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const raw     = await searchNominatim(q)
        // Deduplicate by label
        const seen    = new Set()
        const unique  = []
        for (const item of raw) {
          const label = formatResult(item)
          if (!seen.has(label)) { seen.add(label); unique.push({ label, item }) }
        }
        setSuggestions(unique)
        setOpen(unique.length > 0)
        setActiveIdx(-1)
      } catch {
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  // ── Input change ──────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const v = e.target.value
    onChange?.(v)
    fetchSuggestions(v)
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (!open || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      pick(suggestions[activeIdx].label)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    }
  }

  // ── Pick a suggestion ─────────────────────────────────────────────────────
  const pick = (label) => {
    onChange?.(label)
    onSelect?.(label)
    setSuggestions([])
    setOpen(false)
    setActiveIdx(-1)
    inputRef.current?.blur()
  }

  // ── Clear button ──────────────────────────────────────────────────────────
  const clear = () => {
    onChange?.('')
    onSelect?.('')
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  // ── Click outside → close ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (
        !inputRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Scroll active item into view ──────────────────────────────────────────
  useEffect(() => {
    if (activeIdx >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-idx]')
      items[activeIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  return (
    <div className={`relative ${className}`}>
      {/* Input */}
      <div className="relative">
        <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length) setOpen(true) }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className={`input pl-9 pr-8 ${inputClassName}`}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
        {/* Right icon: spinner or clear */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
          {loading
            ? <Loader2Icon className="w-3.5 h-3.5 text-gray-400 animate-spin" />
            : value
              ? <button type="button" onMouseDown={() => { ignoreBlur.current = true }} onClick={clear}
                  className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Clear location">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              : null
          }
        </div>
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          ref={dropdownRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg
                     max-h-56 overflow-y-auto py-1 text-sm"
        >
          {suggestions.map(({ label }, idx) => (
            <li
              key={idx}
              data-idx={idx}
              role="option"
              aria-selected={activeIdx === idx}
              onMouseDown={() => { ignoreBlur.current = true }}
              onClick={() => pick(label)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors
                ${activeIdx === idx
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <MapPinIcon className={`w-3.5 h-3.5 shrink-0 ${activeIdx === idx ? 'text-brand-500' : 'text-gray-400'}`} />
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
