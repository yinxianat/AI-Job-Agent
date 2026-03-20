/**
 * FolderPicker — a modal that lets users visually navigate their local
 * filesystem (via the backend /api/files/browse endpoint) and select
 * a folder as the resume output destination.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  FolderIcon, FolderOpenIcon, ChevronRightIcon, ArrowLeftIcon,
  HomeIcon, XIcon, CheckIcon, FolderPlusIcon, RefreshCwIcon,
  ChevronRightIcon as BreadcrumbSepIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { API_ENDPOINTS } from '../constants/api'

export default function FolderPicker({ isOpen, onClose, onSelect, currentPath = '' }) {
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creating, setCreating]     = useState(false)

  const browse = useCallback(async (path = null) => {
    setLoading(true)
    try {
      const params = path ? { path } : {}
      const { data: res } = await api.get(API_ENDPOINTS.FILES_BROWSE, { params })
      setData(res)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load home dir when modal opens
  useEffect(() => {
    if (isOpen) {
      browse(currentPath || null)
      setNewFolderMode(false)
      setNewFolderName('')
    }
  }, [isOpen])

  const handleSelect = () => {
    if (data?.current_path) {
      onSelect(data.current_path)
      onClose()
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    const newPath = `${data.current_path}/${newFolderName.trim()}`
    setCreating(true)
    try {
      await api.post(`/api/files/mkdir?path=${encodeURIComponent(newPath)}`)
      toast.success(`Folder "${newFolderName}" created`)
      setNewFolderMode(false)
      setNewFolderName('')
      await browse(newPath)   // navigate into the newly created folder
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
           style={{ maxHeight: '80vh' }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FolderOpenIcon className="w-5 h-5 text-brand-500" />
            <h2 className="font-semibold text-gray-900">Choose Output Folder</h2>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Shortcuts bar ── */}
        {data?.shortcuts && (
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex gap-2 flex-wrap">
            {data.shortcuts.map((s) => (
              <button
                key={s.path}
                onClick={() => browse(s.path)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200
                           text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700
                           transition-colors font-medium"
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Breadcrumbs ── */}
        {data?.breadcrumbs && (
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1 overflow-x-auto
                          scrollbar-thin text-sm text-gray-500 flex-shrink-0">
            <button
              onClick={() => browse(null)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
            >
              <HomeIcon className="w-3.5 h-3.5" />
            </button>
            {data.breadcrumbs.map((crumb, i) => (
              <div key={crumb.path} className="flex items-center gap-1 shrink-0">
                <BreadcrumbSepIcon className="w-3 h-3 text-gray-300" />
                <button
                  onClick={() => browse(crumb.path)}
                  className={`px-1.5 py-0.5 rounded hover:bg-brand-50 hover:text-brand-700 transition-colors
                    ${i === data.breadcrumbs.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Directory listing ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : data?.entries?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <FolderIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">This folder is empty</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {/* Back row */}
              {data?.parent_path && (
                <li>
                  <button
                    onClick={() => browse(data.parent_path)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm
                               text-gray-500 hover:bg-gray-100 transition-colors group"
                  >
                    <ArrowLeftIcon className="w-4 h-4 shrink-0" />
                    <span className="font-medium">.. (go up)</span>
                  </button>
                </li>
              )}

              {data?.entries?.map((entry) => (
                <li key={entry.path}>
                  <button
                    onClick={() => browse(entry.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                               hover:bg-brand-50 transition-colors group text-left"
                  >
                    <FolderIcon className="w-4 h-4 text-yellow-400 shrink-0 group-hover:text-yellow-500" />
                    <span className="flex-1 font-medium text-gray-800 truncate">{entry.name}</span>
                    {entry.has_children && (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-400 shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── New folder input ── */}
        {newFolderMode && (
          <div className="px-4 py-3 border-t border-gray-100 bg-brand-50">
            <p className="text-xs text-gray-500 mb-2">New folder inside: <span className="font-mono text-xs">{data?.current_path}</span></p>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName('') }
                }}
                placeholder="New folder name"
                className="input flex-1 text-sm py-2"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creating}
                className="btn-primary text-sm py-2 px-3"
              >
                {creating ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : 'Create'}
              </button>
              <button
                onClick={() => { setNewFolderMode(false); setNewFolderName('') }}
                className="btn-secondary text-sm py-2 px-3"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Footer: current selection + actions ── */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          {/* Current path display */}
          <div className="flex items-center gap-2 mb-3 p-2.5 bg-white rounded-xl border border-gray-200">
            <FolderOpenIcon className="w-4 h-4 text-brand-500 shrink-0" />
            <span className="text-xs font-mono text-gray-700 truncate flex-1 leading-relaxed">
              {data?.current_path || '—'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => { setNewFolderMode(true); setNewFolderName('') }}
              className="btn-secondary text-sm py-2 px-3"
              disabled={!data}
            >
              <FolderPlusIcon className="w-4 h-4" /> New Folder
            </button>

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">
                Cancel
              </button>
              <button
                onClick={handleSelect}
                disabled={!data?.current_path}
                className="btn-primary text-sm py-2 px-5"
              >
                <CheckIcon className="w-4 h-4" /> Select This Folder
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
