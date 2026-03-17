import { PanelLeftClose, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function TopBar({ statusText, onOpenSettings }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background shadow-soft">
              <PanelLeftClose className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">memoQ desktop gateway</p>
              <h1 className="truncate text-lg font-semibold text-foreground">MT Control Center</h1>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="outline" className="hidden max-w-[360px] truncate md:inline-flex">
            {statusText || 'Status will appear here after refresh'}
          </Badge>
          <Button type="button" variant="secondary" onClick={onOpenSettings}>
            <Settings2 className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SidebarNav({ items, activeTab, onTabChange }) {
  return (
    <aside className="w-full shrink-0 lg:w-64">
      <nav className="sticky top-[84px] rounded-[1.4rem] border border-border bg-card/90 p-3 shadow-soft">
        <div className="mb-3 px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Navigation</p>
        </div>
        <div className="grid gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeTab;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                  active
                    ? 'bg-foreground text-background shadow-soft'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${active ? 'bg-background/10' : 'bg-muted'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${active ? 'text-background' : 'text-foreground'}`}>{item.label}</span>
                  <span className={`block truncate text-xs ${active ? 'text-background/70' : 'text-muted-foreground'}`}>{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
