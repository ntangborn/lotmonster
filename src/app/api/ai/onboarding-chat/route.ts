import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

const SYSTEM_PROMPT = `You are an ingredient extraction assistant helping a CPG manufacturer set up their inventory system.

Your job is to have a friendly, concise conversation to collect their ingredient list. Ask follow-up questions about:
- Units of measurement (oz, lb, gal, fl_oz, g, kg, ml, l, each)
- Whether items are raw materials, packaging, or labels
- Cost per unit when they mention prices
- SKU or item codes if they have them

As soon as the user mentions any ingredients, emit a structured JSON block so the UI can display them. You MUST include a \`\`\`ingredients block in your response whenever you have ingredient data to add or update.

Format:
\`\`\`ingredients
[
  {"name":"Habanero Peppers","sku":null,"unit":"lb","category":"raw_material","quantity":null,"unit_cost":3.20},
  {"name":"Glass 5oz Bottle","sku":"PKG-001","unit":"each","category":"packaging","quantity":null,"unit_cost":0.45}
]
\`\`\`

Rules for the JSON block:
- Include ALL confirmed ingredients every time you emit a block (it replaces the previous list)
- unit must be one of: oz, lb, gal, fl_oz, g, kg, ml, l, each — or null
- category must be one of: raw_material, packaging, label — or null
- quantity and unit_cost are numbers or null
- name is always required
- sku is a string or null

After emitting the JSON block, continue the conversation naturally. Ask about the next ingredient or clarify missing details.

When the user seems done (says "that's all", "done", "save", etc.), confirm the list and tell them to click "Save All" to add everything to their inventory.

Keep responses short and friendly. Never output raw JSON outside of the \`\`\`ingredients block.`

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { messages: { role: 'user' | 'assistant'; content: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  // Stream response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        })

        for await (const chunk of claudeStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        console.error('[onboarding-chat] stream error:', err)
        controller.enqueue(encoder.encode('\n\n[Error: AI response failed. Please try again.]'))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
