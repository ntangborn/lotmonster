export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { resolveOrgId } from '@/lib/ingredients/queries'
import { ChatUI } from './_components/chat'

export default async function AIAssistantPage() {
  // Guard — unauthenticated sessions never see the chat shell.
  try {
    await resolveOrgId()
  } catch {
    redirect('/login')
  }

  return <ChatUI />
}
