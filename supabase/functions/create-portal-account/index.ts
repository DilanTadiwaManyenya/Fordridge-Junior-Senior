import { createClient } from 'npm:@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers })
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply(405, { error: 'POST required' })
  try {
    const authorization = request.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser()
    if (authError || !user) return reply(401, { error: 'Sign in again' })
    const { data: actor, error: profileError } = await caller
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileError || actor?.role !== 'admin')
      return reply(403, { error: 'Administrator access required' })
    const input = await request.json()
    if (
      !['student', 'teacher', 'staff'].includes(input.role) ||
      typeof input.full_name !== 'string' ||
      !input.full_name.trim() ||
      typeof input.password !== 'string' ||
      input.password.length < 12 ||
      !/^\+[1-9]\d{7,14}$/.test(input.phone)
    )
      return reply(400, {
        error:
          'Provide a name, valid international phone number, permitted role and password of at least 12 characters.',
      })
    const admin = createClient(
      url,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: campus } = await admin
      .from('campuses')
      .select('id')
      .eq('id', input.campus_id)
      .maybeSingle()
    if (!campus) return reply(400, { error: 'Select an existing campus.' })
    const { data, error } = await admin.auth.admin.createUser({
      phone: input.phone,
      password: input.password,
      phone_confirm: true,
      user_metadata: {
        full_name: input.full_name.trim(),
        phone_number: input.phone,
        portal_role: 'student',
      },
    })
    if (error) return reply(400, { error: error.message })
    const learner = input.role === 'student'
    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update({
        full_name: input.full_name.trim(),
        role: input.role,
        campus_id: campus.id,
        admission_number: learner
          ? input.admission_number?.trim() || null
          : null,
        class_level: learner ? input.class_level?.trim() || null : null,
        class_stream: learner ? input.class_stream?.trim() || null : null,
        enrollment_status: learner ? input.enrollment_status || 'active' : null,
      })
      .eq('id', data.user.id)
      .select('id')
      .single()
    if (updateError || !updated) {
      const cleanup = await admin.auth.admin.deleteUser(data.user.id)
      return reply(400, {
        error: cleanup.error
          ? 'Account created but profile setup failed. Contact the administrator before retrying.'
          : updateError?.message ||
            'Profile setup failed; no account was retained.',
      })
    }
    return reply(200, { id: data.user.id })
  } catch {
    return reply(500, {
      error:
        'Account creation failed. Check the provisioning service before retrying.',
    })
  }
})
