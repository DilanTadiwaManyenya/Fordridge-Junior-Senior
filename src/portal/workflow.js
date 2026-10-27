export function workflowError(error) {
  if (
    ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703'].includes(error?.code)
  )
    return 'This portal feature needs the latest database update. Please contact the school administrator.'
  if (error?.code === '23505')
    return 'A matching record already exists. Check the admission number or attendance date.'
  return (
    error?.message || 'The request could not be completed. Please try again.'
  )
}
export function canEnterPortal(role, portal) {
  return portal === 'staff'
    ? ['staff', 'teacher', 'admin'].includes(role)
    : role === portal
}

export function withPortalTimeout(operation, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            'The portal took too long to respond. Check your connection and try again.',
          ),
        ),
      timeoutMs,
    )
    Promise.resolve()
      .then(() => (typeof operation === 'function' ? operation() : operation))
      .then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
  })
}
