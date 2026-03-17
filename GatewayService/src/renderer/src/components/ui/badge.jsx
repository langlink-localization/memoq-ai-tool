import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-secondary text-secondary-foreground',
      outline: 'border border-border bg-background text-foreground',
      success: 'bg-success/15 text-[hsl(var(--success))]',
      warning: 'bg-warning/20 text-[hsl(var(--warning))]',
      destructive: 'bg-destructive/15 text-destructive',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
