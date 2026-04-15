'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { bulkInsertIngredients } from '@/lib/actions/ingredients'
import { validateIngredientCost } from '@/lib/validation'
import { ZeroCostWarning } from '@/components/zero-cost-warning'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface StagedIngredient {
  name: string
  sku: string | null
  unit: string | null
  category: string | null
  quantity: number | null
  unit_cost: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UNITS = ['oz', 'lb', 'gal', 'fl_oz', 'g', 'kg', 'ml', 'l', 'each'] as const
const CATEGORIES = ['raw_material', 'packaging', 'label'] as const

function parseIngredientsBlock(text: string): StagedIngredient[] | null {
  const match = text.match(/```ingredients\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed: unknown = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return null
    return parsed.map((item) => {
      const i = item as Record<string, unknown>
      return {
        name: typeof i.name === 'string' ? i.name : String(i.name ?? ''),
        sku: typeof i.sku === 'string' ? i.sku : null,
        unit: typeof i.unit === 'string' ? i.unit : null,
        category: typeof i.category === 'string' ? i.category : null,
        quantity: typeof i.quantity === 'number' ? i.quantity : null,
        unit_cost: typeof i.unit_cost === 'number' ? i.unit_cost : null,
      }
    }).filter((i) => i.name.trim().length > 0)
  } catch {
    return null
  }
}

/** Strip the ```ingredients block from display text */
function stripIngredientsBlock(text: string): string {
  return text.replace(/```ingredients[\s\S]*?```/g, '').trim()
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: `Hi! I'm here to help you set up your ingredient inventory. Tell me about the ingredients you use — for example, "We use habanero peppers, white vinegar, and glass bottles." I'll capture them as you go and you can review everything on the right before saving.`,
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function IngredientCard({
  ingredient,
  index,
  onUpdate,
  onRemove,
}: {
  ingredient: StagedIngredient
  index: number
  onUpdate: (index: number, field: keyof StagedIngredient, value: string | number | null) => void
  onRemove: (index: number) => void
}) {
  const categoryLabel = {
    raw_material: 'Raw Material',
    packaging: 'Packaging',
    label: 'Label',
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <input
          className="flex-1 bg-transparent text-sm font-medium text-white outline-none border-b border-transparent focus:border-teal-500 pb-0.5"
          value={ingredient.name}
          onChange={(e) => onUpdate(index, 'name', e.target.value)}
          placeholder="Ingredient name"
        />
        <button
          onClick={() => onRemove(index)}
          className="text-slate-500 hover:text-red-400 transition-colors text-xs shrink-0 mt-0.5"
          aria-label="Remove ingredient"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Unit</label>
          <select
            value={ingredient.unit ?? ''}
            onChange={(e) => onUpdate(index, 'unit', e.target.value || null)}
            className="w-full rounded bg-slate-700 px-2 py-1 text-xs text-white border border-slate-600 focus:border-teal-500 outline-none"
          >
            <option value="">— unknown —</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Category</label>
          <select
            value={ingredient.category ?? ''}
            onChange={(e) => onUpdate(index, 'category', e.target.value || null)}
            className="w-full rounded bg-slate-700 px-2 py-1 text-xs text-white border border-slate-600 focus:border-teal-500 outline-none"
          >
            <option value="">— unknown —</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Cost / Unit</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={ingredient.unit_cost ?? ''}
            onChange={(e) =>
              onUpdate(index, 'unit_cost', e.target.value ? parseFloat(e.target.value) : null)
            }
            placeholder="0.00"
            className="w-full rounded bg-slate-700 px-2 py-1 text-xs text-white border border-slate-600 focus:border-teal-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">SKU</label>
          <input
            type="text"
            value={ingredient.sku ?? ''}
            onChange={(e) => onUpdate(index, 'sku', e.target.value || null)}
            placeholder="Optional"
            className="w-full rounded bg-slate-700 px-2 py-1 text-xs text-white border border-slate-600 focus:border-teal-500 outline-none"
          />
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatOnboardingPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [staged, setStaged] = useState<StagedIngredient[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMessage: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)

    // Add empty assistant message to stream into
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '' }
    setMessages((prev) => [...prev, assistantPlaceholder])

    try {
      const response = await fetch('/api/ai/onboarding-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })

        // Update last message with streamed content
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: accumulated }
          return next
        })

        // Parse and update staged ingredients
        const parsed = parseIngredientsBlock(accumulated)
        if (parsed) {
          setStaged(parsed)
        }
      }
    } catch (err) {
      console.error('[chat] stream error:', err)
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        }
        return next
      })
    } finally {
      setIsStreaming(false)
    }
  }, [input, messages, isStreaming])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const updateIngredient = (index: number, field: keyof StagedIngredient, value: string | number | null) => {
    setStaged((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const removeIngredient = (index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index))
  }

  const handleEditAsForm = () => {
    sessionStorage.setItem('onboarding_staged_ingredients', JSON.stringify(staged))
    router.push('/dashboard/onboarding/manual')
  }

  const handleSaveAll = async () => {
    if (staged.length === 0) return

    // Block on invalid costs (zero or negative); allow missing costs (warn only)
    const invalidCosts = staged.filter((s) => {
      const result = validateIngredientCost(s.unit_cost)
      return !result.valid
    })
    if (invalidCosts.length > 0) {
      const names = invalidCosts.map((s) => s.name).join(', ')
      setSaveError(`Fix cost errors before saving: ${names}`)
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await bulkInsertIngredients(
        staged.map((s) => ({
          name: s.name,
          sku: s.sku ?? undefined,
          unit: s.unit ?? 'each',
          category: s.category ?? undefined,
          cost_per_unit: s.unit_cost ?? undefined,
        }))
      )
      router.push('/dashboard/ingredients')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const missingCostCount = staged.filter(
    (s) => validateIngredientCost(s.unit_cost).warn
  ).length

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-900">
      {/* ── Left: Chat Panel (60%) ─────────────────────────────────────── */}
      <div className="flex flex-col w-3/5 border-r border-slate-700">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-700 bg-slate-900">
          <h1 className="text-lg font-semibold text-white">AI Ingredient Setup</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Describe your ingredients and I&apos;ll organize them on the right.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg, i) => {
            const displayContent =
              msg.role === 'assistant' ? stripIngredientsBlock(msg.content) : msg.content

            if (msg.role === 'assistant' && !displayContent && i === messages.length - 1 && isStreaming) {
              return (
                <div key={i} className="flex gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">
                    AI
                  </div>
                  <div className="flex-1 bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-300 max-w-prose">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                    </span>
                  </div>
                </div>
              )
            }

            if (!displayContent) return null

            return (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="shrink-0 w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white">
                    AI
                  </div>
                )}
                <div
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm max-w-prose whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white rounded-tr-sm ml-12'
                      : 'bg-slate-800 text-slate-300 rounded-tl-sm mr-12'
                  }`}
                >
                  {displayContent}
                </div>
              </div>
            )
          })}
          <div ref={chatBottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-700 bg-slate-900">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Describe your ingredients… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none rounded-xl bg-slate-800 border border-slate-600 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none disabled:opacity-50 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={isStreaming || !input.trim()}
              className="shrink-0 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 text-sm font-medium transition-colors"
            >
              {isStreaming ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Staging Panel (40%) ────────────────────────────────── */}
      <div className="flex flex-col w-2/5 bg-slate-850">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-700 bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Staged Ingredients</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {staged.length === 0
                  ? 'Ingredients will appear here as we chat.'
                  : `${staged.length} ingredient${staged.length !== 1 ? 's' : ''} ready to save`}
              </p>
            </div>
            {staged.length > 0 && (
              <button
                onClick={handleEditAsForm}
                className="text-xs text-teal-400 hover:text-teal-300 transition-colors underline underline-offset-2"
              >
                Edit as Form
              </button>
            )}
          </div>
        </div>

        {/* Ingredient cards */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {staged.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3 text-2xl">
                🧂
              </div>
              <p className="text-sm text-slate-500">
                Start chatting and I&apos;ll extract your ingredients automatically.
              </p>
            </div>
          ) : (
            staged.map((ingredient, i) => (
              <IngredientCard
                key={i}
                ingredient={ingredient}
                index={i}
                onUpdate={updateIngredient}
                onRemove={removeIngredient}
              />
            ))
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-700 bg-slate-900 space-y-2">
          {missingCostCount > 0 && !saveError && (
            <ZeroCostWarning count={missingCostCount} />
          )}
          {saveError && (
            <p className="text-xs text-red-400 text-center">{saveError}</p>
          )}
          <button
            onClick={handleSaveAll}
            disabled={staged.length === 0 || isSaving}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 text-sm font-semibold transition-colors"
          >
            {isSaving
              ? 'Saving…'
              : staged.length === 0
              ? 'Save All (add ingredients first)'
              : `Save All ${staged.length} Ingredient${staged.length !== 1 ? 's' : ''}`}
          </button>
          <button
            onClick={() => router.push('/dashboard/onboarding')}
            className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
          >
            ← Back to options
          </button>
        </div>
      </div>
    </div>
  )
}
