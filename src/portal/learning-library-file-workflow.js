export const LEARNING_FILE_MAX_BYTES = 10 * 1024 * 1024
export const ABANDONED_UPLOAD_REVIEW_AGE_MS = 7 * 24 * 60 * 60 * 1000

const FILE_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function learningFileDetails(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const mimeType = FILE_TYPES[extension]
  if (!mimeType || file.size < 1 || file.size > LEARNING_FILE_MAX_BYTES)
    throw new Error('Choose a PDF, Word, PowerPoint, JPEG, PNG, or WebP file up to 10 MiB.')
  if (file.type && file.type !== mimeType)
    throw new Error('The file name and file format do not match an allowed type.')
  if (file.name.length > 240) throw new Error('File names must be 240 characters or fewer.')
  return { extension, mimeType }
}

export function matchesLearningFileReservation(file, reservation) {
  try {
    const details = learningFileDetails(file)
    return file.name === reservation.original_name
      && file.size === Number(reservation.size_bytes)
      && details.extension === reservation.extension
      && details.mimeType === reservation.mime_type
  } catch {
    return false
  }
}

export function needsAbandonedUploadReview(file, now = Date.now()) {
  if (!file || file.ready) return false
  const createdAt = Date.parse(file.created_at)
  return Number.isFinite(createdAt) && now - createdAt >= ABANDONED_UPLOAD_REVIEW_AGE_MS
}
