/** Minimale laadstatus tijdens eerste download van lazy route-modules. */
export function RouteOutletFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '2.5rem 1rem',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.95rem',
        fontWeight: 600,
      }}
    >
      Laden…
    </div>
  )
}
