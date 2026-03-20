/**
 * LocationMapPicker
 *
 * Interactive Leaflet map for picking a job-search location and radius.
 * • Search box with Nominatim (OpenStreetMap) autocomplete
 * • Click or drag marker to set location
 * • Live shaded circle shows the radius
 * • "Use my location" button (browser geolocation)
 * • Radius stepper / slider synced with the circle
 *
 * Props:
 *   location        {string}  – current location text (controlled)
 *   radius          {number}  – miles (controlled)
 *   onLocationChange(loc)     – called with display string, e.g. "New York, NY"
 *   onRadiusChange(miles)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  SearchIcon, LocateIcon, XCircleIcon, MapPinIcon,
  ChevronUpIcon, ChevronDownIcon,
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────
const RADIUS_STEPS = [0, 5, 10, 15, 25, 50, 100]   // miles
const MILES_TO_M   = 1609.34
const DEFAULT_CENTER = [39.8283, -98.5795]           // geographic center of USA
const DEFAULT_ZOOM   = 4

// ── Nominatim helpers ────────────────────────────────────────────────────────
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`
  const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  return res.ok ? res.json() : []
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
  const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) return null
  const data = await res.json()
  // Build a clean "City, State" string
  const a = data.address || {}
  const city  = a.city || a.town || a.village || a.county || ''
  const state = a.state || ''
  const country = a.country_code?.toUpperCase() || ''
  if (city && state) return `${city}, ${state}`
  if (city)          return country === 'US' ? city : `${city}, ${country}`
  return data.display_name?.split(',').slice(0, 2).join(',').trim() || ''
}

// ── Leaflet icon fix (default icon path broken in bundled apps) ───────────────
function fixLeafletIcons() {
  const L = window.L
  if (!L || L._iconFixed) return
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
  L._iconFixed = true
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LocationMapPicker({ location, radius, onLocationChange, onRadiusChange }) {
  const mapDivRef   = useRef(null)
  const mapRef      = useRef(null)    // Leaflet map instance
  const markerRef   = useRef(null)    // Leaflet marker
  const circleRef   = useRef(null)    // Leaflet circle
  const initedRef   = useRef(false)

  const [query,       setQuery]       = useState(location || '')
  const [suggestions, setSuggestions] = useState([])
  const [searching,   setSearching]   = useState(false)
  const [locating,    setLocating]    = useState(false)
  const suggestTimer  = useRef(null)

  const radiusIdx = RADIUS_STEPS.indexOf(radius) !== -1
    ? RADIUS_STEPS.indexOf(radius)
    : RADIUS_STEPS.findIndex(r => r >= radius) || 4

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (initedRef.current || !mapDivRef.current || !window.L) return
    initedRef.current = true
    fixLeafletIcons()

    const L   = window.L
    const map = L.map(mapDivRef.current, {
      center:  DEFAULT_CENTER,
      zoom:    DEFAULT_ZOOM,
      zoomControl: true,
    })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // Click anywhere on map → place/move marker
    map.on('click', async (e) => {
      const { lat, lng } = e.latlng
      placeMarker(lat, lng)
      const name = await reverseGeocode(lat, lng)
      if (name) {
        onLocationChange(name)
        setQuery(name)
      }
    })

    // If we already have a location, geocode it to place initial marker
    if (location) {
      geocode(location).then(results => {
        if (results.length) {
          const r = results[0]
          placeMarker(parseFloat(r.lat), parseFloat(r.lon), map)
          map.setView([parseFloat(r.lat), parseFloat(r.lon)], 10)
        }
      })
    }

    return () => {
      map.remove()
      mapRef.current  = null
      markerRef.current = null
      circleRef.current = null
      initedRef.current = false
    }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Place/move marker + circle ─────────────────────────────────────────────
  const placeMarker = useCallback((lat, lng, mapInstance) => {
    const L   = window.L
    const map = mapInstance || mapRef.current
    if (!L || !map) return

    const radiusM = (radius || 0) * MILES_TO_M

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map)
      markerRef.current.on('dragend', async () => {
        const p    = markerRef.current.getLatLng()
        updateCircle(p.lat, p.lng)
        const name = await reverseGeocode(p.lat, p.lng)
        if (name) { onLocationChange(name); setQuery(name) }
      })
    }

    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng])
      circleRef.current.setRadius(radiusM || 1000)
    } else {
      circleRef.current = L.circle([lat, lng], {
        radius:      radiusM || 1000,
        color:       '#2563eb',
        fillColor:   '#3b82f6',
        fillOpacity: 0.12,
        weight:      2,
      }).addTo(map)
    }
  }, [radius])   // eslint-disable-line react-hooks/exhaustive-deps

  const updateCircle = (lat, lng) => {
    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng])
    }
  }

  // ── Sync circle radius when prop changes ───────────────────────────────────
  useEffect(() => {
    if (circleRef.current) {
      const r = (radius || 0) * MILES_TO_M
      circleRef.current.setRadius(r || 1000)
    }
  }, [radius])

  // ── Autocomplete ───────────────────────────────────────────────────────────
  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setSuggestions([])
    clearTimeout(suggestTimer.current)
    if (val.trim().length < 2) return
    suggestTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await geocode(val)
        setSuggestions(results.slice(0, 5))
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  const selectSuggestion = (item) => {
    const lat  = parseFloat(item.lat)
    const lng  = parseFloat(item.lon)
    const a    = item.address || {}
    const city = a.city || a.town || a.village || a.county || ''
    const state = a.state || ''
    const cc   = (a.country_code || '').toUpperCase()
    const name = city && state ? `${city}, ${state}`
               : city          ? (cc === 'US' ? city : `${city}, ${cc}`)
               : item.display_name.split(',').slice(0, 2).join(',').trim()

    setQuery(name)
    setSuggestions([])
    onLocationChange(name)

    const map = mapRef.current
    if (map) {
      placeMarker(lat, lng)
      map.setView([lat, lng], 11)
    }
  }

  // ── Browser geolocation ────────────────────────────────────────────────────
  const handleLocate = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords
        const map = mapRef.current
        if (map) {
          placeMarker(lat, lng)
          map.setView([lat, lng], 11)
        }
        const name = await reverseGeocode(lat, lng)
        if (name) { onLocationChange(name); setQuery(name) }
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 8000 }
    )
  }

  // ── Radius controls ────────────────────────────────────────────────────────
  const stepRadius = (dir) => {
    const idx = RADIUS_STEPS.indexOf(radius)
    const next = dir === 'up'
      ? RADIUS_STEPS[Math.min(idx + 1, RADIUS_STEPS.length - 1)]
      : RADIUS_STEPS[Math.max(idx - 1, 0)]
    onRadiusChange(next)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

      {/* Search bar */}
      <div className="px-3 py-2.5 bg-white border-b border-gray-100 relative">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSuggestions([])
              }}
              placeholder="Search city, zip, or address…"
              className="w-full pl-8 pr-6 py-1.5 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setSuggestions([]); onLocationChange('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                <XCircleIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Locate me button */}
          <button
            type="button"
            onClick={handleLocate}
            title="Use my current location"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-brand-600
                       hover:border-brand-400 hover:bg-brand-50 transition-colors shrink-0"
          >
            {locating
              ? <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin block" />
              : <LocateIcon className="w-4 h-4" />
            }
          </button>
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <ul className="absolute left-3 right-3 top-full mt-1 z-[9999] bg-white border border-gray-200
                         rounded-xl shadow-lg overflow-hidden text-sm">
            {suggestions.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-brand-50 hover:text-brand-700
                             flex items-start gap-2 transition-colors border-b border-gray-50 last:border-0"
                >
                  <MapPinIcon className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{item.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div
        ref={mapDivRef}
        style={{ height: 320, width: '100%', cursor: 'crosshair' }}
        className="z-0"
      />

      {/* Radius + tip footer */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <MapPinIcon className="w-3 h-3" />
          Click map or drag pin to set location
        </p>

        {/* Radius stepper */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500 font-medium">Radius</span>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button type="button" onClick={() => stepRadius('down')}
              className="px-2 py-1 hover:bg-gray-100 text-gray-500 transition-colors"
              disabled={radius === 0}>
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-semibold text-brand-700 min-w-[52px] text-center">
              {radius === 0 ? 'Exact' : `${radius} mi`}
            </span>
            <button type="button" onClick={() => stepRadius('up')}
              className="px-2 py-1 hover:bg-gray-100 text-gray-500 transition-colors"
              disabled={radius === 100}>
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
