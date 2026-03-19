import Link from 'next/link'

interface PlatformLogoProps {
  href?: string
  className?: string
  showName?: boolean
}

export function PlatformLogo({
  href = '/',
  className = '',
  showName = true,
}: PlatformLogoProps) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'

  const content = (
    <div className={`flex items-center gap-2 font-medium ${className}`}>
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      </div>
      {showName && <span>{appName}</span>}
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex"
      >
        {content}
      </Link>
    )
  }

  return content
}
