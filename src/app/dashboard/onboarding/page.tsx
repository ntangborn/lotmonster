'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileText, MessageSquare, UploadCloud, Wrench } from 'lucide-react'
import { setPendingFile } from '@/lib/onboarding-file'

// ── Accepted file types ───────────────────────────────────────────────────────

const ACCEPTED_EXT = ['.csv', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.pdf']
const ACCEPTED_MIME = new Set([
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

function isAccepted(file: File): boolean {
  return (
    ACCEPTED_MIME.has(file.type) ||
    ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext))
  )
}

// ── PathCard ──────────────────────────────────────────────────────────────────
// All three cards share the identical structure, visual weight, and size.
// Nothing marks any card as "recommended" or "default".

interface PathCardProps {
  icon: React.ElementType
  headline: string
  subtext: string
  cta: string
  onClick: () => void
}

function PathCard({ icon: Icon, headline, subtext, cta, onClick }: PathCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full flex-col rounded-2xl border border-white/10 bg-white/5 p-7 text-left',
        'transition-all duration-200',
        'hover:-translate-y-1 hover:border-teal-500/40',
        'hover:shadow-[0_8px_36px_rgba(0,168,150,0.12)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1B2A]',
      ].join(' ')}
    >
      {/* Icon */}
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 transition-colors group-hover:bg-teal-500/20">
        <Icon size={24} className="text-teal-400" />
      </div>

      {/* Copy */}
      <h2 className="mb-2 text-base font-semibold text-white">{headline}</h2>
      <p className="flex-1 text-sm leading-relaxed text-white/45">{subtext}</p>

      {/* CTA link — identical on all three cards */}
      <div className="mt-7 flex items-center gap-1.5 text-sm font-medium text-white/35 transition-colors group-hover:text-teal-400">
        {cta}
        <ArrowRight
          size={14}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragError, setDragError] = useState('')
  const dragCountRef = useRef(0)

  // ── Global document-level drag-drop ──────────────────────────────────────
  // Attaching to document (not a div) means dragging anywhere in the viewport
  // triggers the overlay — even over the browser chrome or empty page area.
  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      // Only activate for file drags, not text selection drags
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      dragCountRef.current++
      setIsDragOver(true)
    }

    function onDragLeave(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      dragCountRef.current--
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0
        setIsDragOver(false)
      }
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    function onDrop(e: DragEvent) {
      e.preventDefault()
      dragCountRef.current = 0
      setIsDragOver(false)
      setDragError('')

      const file = e.dataTransfer?.files[0]
      if (!file) return

      if (!isAccepted(file)) {
        setDragError(
          `"${file.name}" isn't supported. Drop a CSV, XLSX, PDF, JPG, or PNG.`
        )
        return
      }

      // Store in module-level store (sessionStorage can't hold File objects),
      // then navigate. The upload page reads and clears it on mount.
      setPendingFile(file)
      router.push('/dashboard/onboarding/upload')
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)

    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [router])

  const navigateTo = useCallback(
    (path: string) => () => router.push(path),
    [router]
  )

  return (
    <>
      {/* ── Full-screen drop overlay ───────────────────────────────────── */}
      {/* pointer-events-none so it doesn't capture the drop; document handles it */}
      {isDragOver && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/85 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-teal-400/70 bg-teal-500/10 px-20 py-14">
            <UploadCloud size={48} className="text-teal-400" />
            <p className="text-xl font-semibold text-white">
              Drop your file to get started
            </p>
            <p className="text-sm text-white/40">
              {ACCEPTED_EXT.join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Let&apos;s build your first product.
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Pick the way that matches what you&apos;ve got.
          </p>
        </div>

        {/* Three equal-weight cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PathCard
            icon={FileText}
            headline="Upload your recipe"
            subtext="Got a spreadsheet? Drop it here."
            cta="Upload a file"
            onClick={navigateTo('/dashboard/onboarding/upload')}
          />
          <PathCard
            icon={Wrench}
            headline="Build it here"
            subtext="Add ingredients one by one. Takes about 5 minutes."
            cta="Start building"
            onClick={navigateTo('/dashboard/onboarding/manual')}
          />
          <PathCard
            icon={MessageSquare}
            headline="Describe it"
            subtext="Don't have a file? Tell us what you make."
            cta="Start chatting"
            onClick={navigateTo('/dashboard/onboarding/chat')}
          />
        </div>

        {/* Drag hint + error */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/20">
            — or drag a file anywhere on this page —
          </p>
          {dragError && (
            <p className="mt-2 text-xs text-red-400" role="alert">
              {dragError}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
