/**
 * POST /api/ai/query
 *
 * Conversational endpoint for the AI assistant (/dashboard/ai). Exposes
 * Claude with the 11 tool_use schemas from src/lib/ai/tools.ts. Does a
 * tool-loop and streams the final text back to the client.
 *
 * Flow:
 *   1. Resolve orgId from the authenticated session.
 *   2. Open a streaming Anthropic request with tools=AI_TOOLS.
 *   3. Forward text deltas to the client as they arrive.
 *   4. When the turn ends with stop_reason='tool_use', execute every
 *      tool_use block via public.execute_ai_query — ALWAYS overriding
 *      params.org_id with the session orgId (never trust Claude's value).
 *   5. Append the assistant turn + tool_result user turn, loop.
 *   6. When stop_reason is anything else, the last turn's text has
 *      already streamed; close the response.
 *
 * No rate limiting yet — add in Part 12 if/when needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  AI_TOOLS,
  AI_TOOL_NAMES,
  type AIToolName,
} from '@/lib/ai/tools'

const SYSTEM_PROMPT = `You are Lotmonster's inventory + operations assistant for a small CPG manufacturer.

You have 11 tools that read live data from their database: production runs, finished-goods lots, raw-ingredient lots, packaging components, sales orders, purchase orders, suppliers. The user's organization is already known — you do NOT need an org id argument (the server injects it). Prefer calling a tool over guessing.

When you call tools, be efficient: call only what you need. If a question can be answered with data already returned, don't call another tool.

After tool calls complete, give a concise, business-friendly answer. Use dollar signs and unit abbreviations (oz, lb, each) where appropriate. Highlight anomalies the operator should act on (expiring stock, low inventory, shortfalls) without being alarmist. If the data shows 0 rows, say so plainly — don't speculate.

When asked for recommendations (e.g. "what should I reorder?"), look at low_stock + supplier_spend + cost history together to propose a concrete list with quantities and preferred suppliers.`

const MAX_TOOL_LOOPS = 8
const MAX_TOKENS = 4096

type InboundMessage = { role: 'user' | 'assistant'; content: string }

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

async function executeTool(
  toolName: string,
  input: unknown,
  orgId: string
): Promise<unknown> {
  if (!(AI_TOOL_NAMES as readonly string[]).includes(toolName)) {
    throw new Error(`unknown_tool: ${toolName}`)
  }
  const admin = createAdminClient()
  const paramsIn = (input ?? {}) as Record<string, unknown>
  // Strip any org_id the model may have hallucinated; ALWAYS inject
  // the session orgId as the authoritative value.
  const { org_id: _ignore, ...rest } = paramsIn
  void _ignore
  const params = { ...rest, org_id: orgId }

  const { data, error } = await admin.rpc('execute_ai_query', {
    p_function_name: toolName as AIToolName,
    p_params: params,
  })
  if (error) {
    throw new Error(error.message)
  }
  return data
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth → orgId
  let orgId: string
  try {
    ({ orgId } = await resolveOrgId())
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: { messages?: InboundMessage[]; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const history: InboundMessage[] = Array.isArray(body.messages)
    ? body.messages.filter(
        (m) =>
          m &&
          typeof m.content === 'string' &&
          (m.role === 'user' || m.role === 'assistant')
      )
    : []
  if (body.message && typeof body.message === 'string') {
    history.push({ role: 'user', content: body.message })
  }
  if (history.length === 0) {
    return NextResponse.json(
      { error: 'messages or message is required' },
      { status: 400 }
    )
  }
  if (history[history.length - 1].role !== 'user') {
    return NextResponse.json(
      { error: 'last message must be from user' },
      { status: 400 }
    )
  }

  // 3. Stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Working message list — we'll push assistant + tool_result turns
      // into this as the loop progresses. `content` is a union of string
      // and block-arrays, so type it loosely for appends.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      try {
        for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
          const turn = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tools: AI_TOOLS as any,
            messages,
          })

          for await (const event of turn) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }

          const finalMsg = await turn.finalMessage()

          if (finalMsg.stop_reason !== 'tool_use') {
            // Final turn — text has already streamed. Done.
            break
          }

          // Tool-use turn: execute each tool_use block.
          const toolResults: ToolResultBlock[] = []
          for (const block of finalMsg.content) {
            if (block.type !== 'tool_use') continue
            try {
              const result = await executeTool(block.name, block.input, orgId)
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result ?? null),
              })
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'tool_failed'
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ error: msg }),
                is_error: true,
              })
            }
          }

          // Append assistant turn + tool_result user turn, then loop.
          messages.push({ role: 'assistant', content: finalMsg.content })
          messages.push({ role: 'user', content: toolResults })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown_error'
        controller.enqueue(
          encoder.encode(`\n\n[Error: ${msg}]`)
        )
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
