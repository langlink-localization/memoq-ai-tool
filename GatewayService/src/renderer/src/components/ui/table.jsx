import { cn } from '@/lib/utils';

export function Table({ className, ...props }) {
  return <table className={cn('w-full caption-bottom text-sm', className)} {...props} />;
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-muted/50', className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground', className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn('px-4 py-3 align-top text-sm text-foreground', className)} {...props} />;
}
