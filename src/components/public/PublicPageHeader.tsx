import type { ReactNode } from 'react'

type PublicPageHeaderProps = {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  /** Wanneer title geen enkele h1 is (bijv. eigen layout), sla de standaard h1-wrapper over */
  titleAsFragment?: boolean
}

export function PublicPageHeader({ eyebrow, title, subtitle, titleAsFragment }: PublicPageHeaderProps) {
  return (
    <div className="page-header">
      <div className="container">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        {titleAsFragment ? title : <h1>{title}</h1>}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  )
}
