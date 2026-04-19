'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertCircle,
  ArrowUp,
  Loader2,
  RotateCw,
  Sparkles,
} from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const SUGGESTIONS: string[] = [
  "What's my COGS this month, split by liquid and packaging?",
  'What finished goods expire in the next 30 days?',
  'Which packaging components are low on stock?',
  'How many 16oz bottles of Jalapeño Classic can I sell today?',
  'Trace finished lot JAL16-20260412-001.',
]

export function ChatUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const runRequest = useCallback(async (history: ChatMessage[]) => {
    setError(null)
    setPending(true)
    // Optimistic empty assistant bubble to stream into.
    setMessages([
      ...history,
      { role: 'assistant', content: '', streaming: true },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      if (!res.body) {
        throw new Error('No response body')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages([
          ...history,
          { role: 'assistant', content: accumulated, streaming: true },
        ])
      }

      setMessages([
        ...history,
        { role: 'assistant', content: accumulated, streaming: false },
      ])
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // user-initiated — silent
      } else {
        const msg = e instanceof Error ? e.message : 'Request failed'
        setError(msg)
        // Drop the empty streaming bubble if we never got content.
        setMessages((ms) => {
          const last = ms[ms.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            return ms.slice(0, -1)
          }
          return ms
        })
      }
    } finally {
      setPending(false)
      abortRef.current = null
    }
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || pending) return
      setInput('')
      const nextHistory: ChatMessage[] = [
        ...messages,
        { role: 'user', content: trimmed },
      ]
      await runRequest(nextHistory)
    },
    [messages, pending, runRequest]
  )

  const retry = useCallback(async () => {
    if (pending) return
    // Last user message becomes the tail of the replay history.
    let tail = messages.length - 1
    while (tail >= 0 && messages[tail].role !== 'user') tail--
    if (tail < 0) return
    const history = messages.slice(0, tail + 1)
    await runRequest(history)
  }, [messages, pending, runRequest])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-teal-300" />
          <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
        </div>
        {messages.length > 0 && !pending && (
          <button
            onClick={() => {
              setMessages([])
              setError(null)
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
          >
            New chat
          </button>
        )}
      </div>

      {/* Scrollable message area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-4"
      >
        {messages.length === 0 ? (
          <EmptyState disabled={pending} onPick={send} />
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                showPulse={m.role === 'assistant' && m.streaming === true && !m.content}
              />
            ))}
            {error && <ErrorBubble error={error} onRetry={retry} />}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="mt-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
            rows={2}
            placeholder="Ask about your inventory, costs, expirations, traceability…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white transition-colors hover:bg-teal-400 disabled:bg-white/10 disabled:text-white/40"
            aria-label="Send"
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowUp size={14} />
            )}
          </button>
        </div>
        <p className="mt-1.5 px-2 text-[10px] text-white/30">
          Powered by Claude. Press Enter to send, Shift+Enter for a new line.
        </p>
      </form>
    </div>
  )
}

// ─── Bubbles ────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  showPulse,
}: {
  message: ChatMessage
  showPulse: boolean
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-teal-500/20 px-4 py-2.5 text-sm text-teal-50">
          {message.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/90">
        {showPulse ? <ThreeDotPulse /> : <AssistantMarkdown text={message.content} />}
      </div>
    </div>
  )
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="leading-relaxed" {...props} />,
          strong: (props) => (
            <strong className="font-semibold text-white" {...props} />
          ),
          em: (props) => <em className="text-white/80" {...props} />,
          a: (props) => (
            <a
              className="text-teal-300 underline underline-offset-2 hover:text-teal-200"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          ul: (props) => (
            <ul className="my-1 list-disc space-y-0.5 pl-5" {...props} />
          ),
          ol: (props) => (
            <ol className="my-1 list-decimal space-y-0.5 pl-5" {...props} />
          ),
          li: (props) => <li className="leading-relaxed" {...props} />,
          code: ({ className, ...props }) => {
            const isBlock = /\blanguage-/.test(className ?? '')
            if (isBlock) {
              return (
                <code
                  className="block overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-white/80"
                  {...props}
                />
              )
            }
            return (
              <code
                className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-white"
                {...props}
              />
            )
          },
          pre: (props) => <pre className="my-2" {...props} />,
          table: (props) => (
            <div className="my-2 overflow-x-auto">
              <table
                className="w-full border-collapse text-left text-xs"
                {...props}
              />
            </div>
          ),
          thead: (props) => (
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/50" {...props} />
          ),
          th: (props) => (
            <th
              className="border border-white/10 px-2 py-1 font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td
              className="border border-white/5 px-2 py-1 font-mono text-white/80"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="my-1 border-l-2 border-white/20 pl-3 text-white/70"
              {...props}
            />
          ),
          h1: (props) => (
            <h3 className="mb-1 mt-3 text-base font-semibold text-white" {...props} />
          ),
          h2: (props) => (
            <h4 className="mb-1 mt-2 text-sm font-semibold text-white" {...props} />
          ),
          h3: (props) => (
            <h5 className="mb-1 mt-2 text-sm font-semibold text-white" {...props} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function ThreeDotPulse() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Assistant is thinking">
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50"
        style={{ animationDelay: '180ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50"
        style={{ animationDelay: '360ms' }}
      />
    </div>
  )
}

function ErrorBubble({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[90%] items-start gap-2 rounded-2xl rounded-tl-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="whitespace-pre-wrap">{error}</p>
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20"
          >
            <RotateCw size={11} />
            Retry
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (text: string) => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="rounded-full bg-teal-500/10 p-3">
        <Sparkles size={28} className="text-teal-300" />
      </div>
      <h2 className="text-lg font-semibold text-white">Ask about your inventory</h2>
      <p className="max-w-md text-sm text-white/50">
        I can answer questions about costs, stock, production, sales, and
        traceability — I pull live data, not an old snapshot. Try one:
      </p>
      <div className="mt-2 flex max-w-2xl flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-teal-400/50 hover:bg-teal-500/10 hover:text-teal-200 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
