export default function AsyncState({
  loading,
  error,
  empty,
  loadingMessage = 'Loading…',
  emptyMessage = 'No records are available yet.',
  onRetry,
}) {
  if (loading)
    return (
      <p className="workflow-async-state" role="status" aria-live="polite">
        {loadingMessage}
      </p>
    )

  if (error)
    return (
      <div className="workflow-async-error">
        <p className="workflow-error" role="alert">{error}</p>
        {onRetry && (
          <button className="secondary-action" type="button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    )

  if (empty)
    return (
      <p className="portal-empty-copy workflow-async-state" role="status">
        {emptyMessage}
      </p>
    )

  return null
}
