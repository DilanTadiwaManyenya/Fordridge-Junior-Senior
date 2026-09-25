const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASEURL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASESECRETKEY
const ADMIN_PHONE = process.env.ADMIN_PHONE || process.env.ADMINPHONE
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD
const ADMIN_NAME = process.env.ADMIN_NAME || process.env.ADMINNAME || 'Tainttzar'

if (![SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PHONE, ADMIN_PASSWORD].every(Boolean)) {
  throw new Error('Set the Supabase URL, secret key, admin phone, and admin password before running this script.')
}

const headers = {
  apikey: SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } })
  const body = await response.text()
  if (!response.ok) throw new Error(`${response.status}: ${body}`)
  return body ? JSON.parse(body) : null
}

const users = await request('/auth/v1/admin/users?page=1&per_page=1000')
let user = users.users?.find(candidate => candidate.phone === ADMIN_PHONE)

if (!user) {
  const created = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      phone: ADMIN_PHONE,
      password: ADMIN_PASSWORD,
      phone_confirm: true,
      user_metadata: { full_name: ADMIN_NAME, phone_number: ADMIN_PHONE },
    }),
  })
  user = created.user || created
}

await request(`/rest/v1/profiles?id=eq.${user.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ full_name: ADMIN_NAME, phone_number: ADMIN_PHONE, role: 'admin' }),
})

console.log(`Provisioned admin ${user.id} for ${ADMIN_PHONE}.`)