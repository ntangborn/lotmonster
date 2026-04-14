'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, Keyboard, Sparkles } from 'lucide-react'

const ACCEPTED = ['.csv', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.pdf']
const ACCEPTED_MIME = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'application/pdf',
]

function isAccepted(file: File) {
  return ACCEPTED_MIME.includes(file.type) ||
    ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))
}

// ---------------------------------------------------------------------------
// Card A — Upload a File
// ---------------------------------------------------------------------------

function UploadCard() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  function navigate() {
    router.push('/dashboard/onboarding/upload')
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if leaving the drop zone entirely (not entering a child element)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    setError('')

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!isAccepted(file)) {
      setError(`Unsupported file type. Use: ${ACCEPTED.join(', ')}`)
      return
    }

    // Store file reference in sessionStorage so the upload page can pick it up
    sessionStorage.setItem('onboarding_file_name', file.name)
    sessionStorage.setItem('onboarding_file_type', file.type)
    navigate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isAccepted(file)) {
      setError(`Unsupported file type. Use: ${ACCEPTED.join(', ')}`)
      return
    }
    navigate()
  }

  return (
    <div className="group flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-teal-500/40 hover:shadow-[0_8px_32px_rgba(20,184,166,0.1)]">
      {/* Icon */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 transition-colors group-hover:bg-teal-500/20">
        <UploadCloud size={24} className="text-teal-400" />
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">Upload a File</h2>
      <p className="mb-5 text-sm text-white/40">
        CSV, Excel, image, or PDF of your recipe or ingredient list.
      </p>

      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors duration-150
          ${dragging
            ? 'border-teal-400 bg-teal-500/10'
            : 'border-white/15 bg-white/[0.02] hover:border-white/25'
          }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="sr-only"
          onChange={handleFileInput}
        />
        {dragging ? (
          <p className="text-sm font-medium text-teal-300">Drop it!</p>
        ) : (
          <>
            <p className="text-sm text-white/40">Drag &amp; drop here</p>
            <p className="mt-1 text-xs text-white/20">
              {ACCEPTED.join(' · ')}
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {/* Browse button */}
      <button
        onClick={() => inputRef.current?.click()}
        className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-teal-500/50 hover:bg-teal-500/10 hover:text-teal-300"
      >
        Browse files
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card B — Enter Manually
// ---------------------------------------------------------------------------

function ManualCard() {
  const router = useRouter()

  return (
    <div className="group flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-teal-500/40 hover:shadow-[0_8px_32px_rgba(20,184,166,0.1)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 transition-colors group-hover:bg-teal-500/20">
        <Keyboard size={24} className="text-teal-400" />
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">Enter Manually</h2>
      <p className="mb-5 text-sm text-white/40">
        Fill in a form field-by-field. Live cost calculation as you type.
      </p>

      {/* Feature list */}
      <ul className="mb-6 flex-1 space-y-2">
        {[
          'Recipe name + expected yield',
          'Ingredient rows with autocomplete',
          'Bulk price + unit conversion',
          'Live cost-per-unit chain',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-white/40">
            <span className="mt-0.5 shrink-0 text-teal-500">·</span>
            {item}
          </li>
        ))}
      </ul>

      <button
        onClick={() => router.push('/dashboard/onboarding/manual')}
        className="w-full rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
      >
        Get Started
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card C — Chat with AI
// ---------------------------------------------------------------------------

function ChatCard() {
  const router = useRouter()

  return (
    <div className="group flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-teal-500/40 hover:shadow-[0_8px_32px_rgba(20,184,166,0.1)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 transition-colors group-hover:bg-teal-500/20">
        <Sparkles size={24} className="text-teal-400" />
      </div>

      <h2 className="mb-1 text-base font-semibold text-white">Chat with AI</h2>
      <p className="mb-5 text-sm text-white/40">
        Describe your product in plain English. Claude extracts the structured data.
      </p>

      {/* Example prompt */}
      <div className="mb-6 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <p className="text-xs italic leading-relaxed text-white/30">
          &ldquo;I make a habanero hot sauce. It&rsquo;s got habaneros,
          white vinegar, garlic, salt, and lime juice. A batch makes
          about 200 five-ounce bottles.&rdquo;
        </p>
        <p className="mt-2 text-xs text-teal-500/70">
          → Claude extracts ingredients, quantities, yield
        </p>
      </div>

      <button
        onClick={() => router.push('/dashboard/onboarding/chat')}
        className="w-full rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
      >
        Start Chatting
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Add Your First Ingredients</h1>
        <p className="mt-1 text-sm text-white/40">
          Choose how you&rsquo;d like to get started. You can always add more later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UploadCard />
        <ManualCard />
        <ChatCard />
      </div>

      <p className="mt-6 text-center text-xs text-white/20">
        All three paths lead to the same place — a recipe with costed ingredients.
        Pick whatever feels most natural.
      </p>
    </div>
  )
}
