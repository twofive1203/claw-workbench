import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

/**
 * Button 组件变体配置
 * 作者：towfive
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-blue-600)] text-white hover:bg-[var(--color-blue-700)] focus-visible:ring-[var(--color-blue-600)]',
        destructive:
          'bg-[var(--color-red-600)] text-white hover:bg-[var(--color-red-700)] focus-visible:ring-[var(--color-red-600)]',
        outline:
          'border border-[var(--app-border)] bg-transparent hover:bg-[var(--color-gray-800)] hover:text-[var(--app-text-primary)]',
        secondary:
          'bg-[var(--color-gray-700)] text-[var(--app-text-primary)] hover:bg-[var(--color-gray-600)]',
        ghost:
          'hover:bg-[var(--color-gray-800)] hover:text-[var(--app-text-primary)]',
        link: 'text-[var(--app-link)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

/**
 * Button 组件
 * 支持多种变体和尺寸，使用 CSS 变量主题系统
 * 作者：towfive
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
