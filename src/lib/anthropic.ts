import Anthropic from '@anthropic-ai/sdk'

// Singleton — reused across server-side calls in the same process
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})
