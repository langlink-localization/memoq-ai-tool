import React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn('flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
    {...props}
  />
));

Input.displayName = 'Input';

export { Input };
