// Provenance / evidence-grade tag — the product's signature label.
// i18n-free by design: the caller resolves the copy via t(...) and passes the
// already-translated `label`, so this stays a pure presentational component
// usable directly inside Server Components (no 'use client' needed).
//
// variant maps to the evidence semantic colours (see app/globals.css):
//   m  → measured (实测, L3/L4)   i → inferred (推断)
//   g  → gap (差距)              ok → good (已具备)
export function ProvenanceTag({
  variant,
  label,
}: {
  variant: 'm' | 'i' | 'g' | 'ok'
  label: string
}) {
  return (
    <span className={`tag ${variant}`}>
      <span className="dot" />
      {label}
    </span>
  )
}
