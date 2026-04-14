import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  // Auth guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const isPdf = file.type === 'application/pdf'
  const mediaType = isPdf ? 'application/pdf' : (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: isPdf ? 'document' : 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          } as never,
          {
            type: 'text',
            text: `Extract all ingredients from this ${isPdf ? 'document' : 'image'}.
Return ONLY a JSON array — no explanation, no markdown fences.

Each item: { "name": string, "quantity": number|null, "unit": string|null, "unit_cost": number|null }

Rules:
- name is required; never omit it
- unit must be one of: oz, lb, gal, fl_oz, g, kg, ml, l, each — or null if unknown
- quantity and unit_cost are null if not found
- Normalize unit abbreviations (e.g. "ounces" -> "oz", "pounds" -> "lb")
- If this is a recipe card also include: { "recipe_name": string, "yield_quantity": number|null, "yield_unit": string|null } as the first element`,
          },
        ],
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    // Strip any accidental markdown fences
    const json = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim()
    const parsed = JSON.parse(json)
    return NextResponse.json({ ingredients: Array.isArray(parsed) ? parsed : [] })
  } catch {
    return NextResponse.json(
      { error: 'Claude returned unparseable output', raw },
      { status: 422 }
    )
  }
}
