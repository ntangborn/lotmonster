import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { createClient } from '@/lib/supabase/server'

export interface ExtractedIngredient {
  name: string
  sku: string | null
  unit: string | null
  category: string | null
  quantity: number | null
  unit_cost: number | null
}

export interface ExtractResponse {
  ingredients: ExtractedIngredient[]
}

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type ImageMediaType = typeof SUPPORTED_IMAGE_TYPES[number]
const PDF_TYPE = 'application/pdf'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse FormData ────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)
  const isPdf = file.type === PDF_TYPE

  if (!isImage && !isPdf) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use JPEG, PNG, GIF, WebP, or PDF.` },
      { status: 415 }
    )
  }

  // ── Base64 encode ─────────────────────────────────────────────────────────
  const bytes = await file.arrayBuffer()
  const data = Buffer.from(bytes).toString('base64')
  const media_type = file.type as ImageMediaType | typeof PDF_TYPE

  // ── Claude API call ───────────────────────────────────────────────────────
  let raw = ''
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: isPdf ? 'document' : 'image',
              source: { type: 'base64', media_type, data },
            } as never,
            {
              type: 'text',
              text: `Extract all ingredients from this image.
For each ingredient, identify: name, sku, unit, category, quantity, unit_cost.
Return as JSON array. Use null for unknown values.

Rules:
- Return ONLY valid JSON — no explanation, no markdown fences, no comments
- Every item must have all six keys
- name is required and must not be null
- unit must be one of: oz, lb, gal, fl_oz, g, kg, ml, l, each — or null if not determinable
- category must be one of: raw_material, packaging, label — or null if not determinable
- Normalize abbreviations: "ounces" → "oz", "pounds" → "lb", "grams" → "g"
- quantity and unit_cost are numbers or null

Example output:
[
  {"name":"Habanero Peppers","sku":"HAB-001","unit":"lb","category":"raw_material","quantity":10,"unit_cost":3.20},
  {"name":"White Vinegar","sku":null,"unit":"gal","category":"raw_material","quantity":2,"unit_cost":4.50}
]`,
            },
          ],
        },
      ],
    })

    raw = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (err) {
    console.error('[extract-ingredients] Claude API error:', err)
    return NextResponse.json(
      { error: 'AI extraction failed. Please try again or upload a clearer image.' },
      { status: 502 }
    )
  }

  // ── Parse JSON response ───────────────────────────────────────────────────
  try {
    const json = raw
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    const parsed: unknown = JSON.parse(json)

    if (!Array.isArray(parsed)) {
      throw new Error('Response was not a JSON array')
    }

    // Coerce each item to the expected shape, filling missing keys with null
    const ingredients: ExtractedIngredient[] = parsed.map((item) => {
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

    return NextResponse.json({ ingredients } satisfies ExtractResponse)
  } catch (err) {
    console.error('[extract-ingredients] JSON parse error:', err, '\nRaw:', raw)
    return NextResponse.json(
      {
        error: 'Could not read the AI response. The image may be unclear or contain no ingredient data.',
        fallback: true,
      },
      { status: 422 }
    )
  }
}
