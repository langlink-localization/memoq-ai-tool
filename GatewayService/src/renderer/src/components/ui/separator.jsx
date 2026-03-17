import { cn } from '@/lib/utils';

export function Separator({ className, vertical = false }) {
  return <div className={cn(vertical ? 'h-full w-px' : 'h-px w-full', 'bg-border', className)} />;
}
