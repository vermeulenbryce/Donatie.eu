import type { CSSProperties, ReactNode } from 'react'

export function ProjectBanner({
  imageUrl,
  fallbackGradient = 'linear-gradient(135deg,#3a98f8,#6d28d9)',
  height = 160,
  children,
  style,
}: {
  imageUrl?: string | null
  fallbackGradient?: string
  height?: number
  children?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: imageUrl ? '#0f172a' : fallbackGradient,
        overflow: 'hidden',
        borderTopLeftRadius: 'inherit',
        borderTopRightRadius: 'inherit',
        ...style,
      }}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.5))',
            }}
          />
        </>
      ) : null}
      {children ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 14,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
