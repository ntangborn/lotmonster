import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  try {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      console.error('[auth/callback] exchangeCodeForSession error:', error?.message)
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
    }

    const user = data.user

    // Use the admin client for org creation — the new user has no org_id in
    // their JWT yet, so the anon client would be blocked by RLS.
    const admin = createAdminClient()

    // Check if this user already has an org_member record.
    // If not, this is a first sign-in from the signup flow — create the org.
    const { data: existingMember } = await admin
      .from('org_members')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existingMember) {
      // Pull org_name / org_slug from user metadata set during signInWithOtp
      const orgName =
        (user.user_metadata?.org_name as string | undefined) ??
        user.email?.split('@')[1] ??
        'My Company'

      const orgSlug =
        (user.user_metadata?.org_slug as string | undefined) ??
        orgName
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

      // Create org — admin client bypasses RLS
      const { data: org, error: orgError } = await admin
        .from('orgs')
        .insert({ name: orgName, slug: orgSlug })
        .select('id')
        .single()

      if (orgError || !org) {
        console.error('[auth/callback] org creation error:', orgError?.message)
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
      }

      // Create org_member (owner)
      const { error: memberError } = await admin
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

      if (memberError) {
        console.error('[auth/callback] org_member creation error:', memberError.message)
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
      }
    }

    return NextResponse.redirect(`${origin}/dashboard`)
  } catch (err) {
    console.error('[auth/callback] unexpected error:', err)
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }
}
