import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

// 全站唯一按钮（design-system §4 Button / §5 状态矩阵）。i18n-free：文案由调用方 t() 后传入。
// 无 hook，可直接用于 Server Component；放进 Client Component 时 onClick 照常可用。
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'md' | 'sm'

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
  className?: string
} = {}): string {
  return [
    'ui-btn',
    variant === 'secondary' ? '' : `ui-btn--${variant}`,
    size === 'sm' ? 'ui-btn--sm' : '',
    iconOnly ? 'ui-btn--icon' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

type CommonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 只有图标、没有可见文字时为 true；此时必须传 aria-label。 */
  iconOnly?: boolean
  icon?: ReactNode
  className?: string
  children?: ReactNode
}

export function Button({
  variant,
  size,
  iconOnly,
  icon,
  className,
  children,
  loading = false,
  disabled,
  type = 'button',
  ...rest
}: CommonProps & { loading?: boolean } & Omit<ComponentProps<'button'>, 'className' | 'children'>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

export function ButtonLink({
  href,
  variant,
  size,
  iconOnly,
  icon,
  className,
  children,
  ...rest
}: CommonProps & { href: string } & Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={buttonClass({ variant, size, iconOnly, className })} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
