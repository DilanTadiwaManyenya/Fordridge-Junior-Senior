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
