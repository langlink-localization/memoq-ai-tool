import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Sheet({ open, onOpenChange, title, description, children }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
        aria-label="Close settings panel"
        onClick={() => onOpenChange(false)}
      />
      <div className={cn('relative flex h-full w-full max-w-[720px] flex-col border-l border-border bg-card shadow-panel')}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
