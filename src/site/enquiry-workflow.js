export async function submitEnquiry(client, configured, enquiry) {
  if (!configured || !client) return { ok: false, reason: 'unavailable' }
  try {
    const { error } = await client.from('enquiries').insert(enquiry)
    if (error) return { ok: false, reason: 'failed' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
