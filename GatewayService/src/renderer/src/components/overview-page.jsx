import { Activity, Bot, Cable, Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function StatusMetric({ icon: Icon, title, value, tone = 'outline', meta }) {
  return (
    <Card className="border-border/80">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <Badge variant={tone}>{value}</Badge>
          </div>
          {meta ? <p className="break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{meta}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewPage({ health, providerHealth, integrationView, onRefreshHealth, onRefreshProviderHealth, onRefreshIntegration }) {
  const interfaces = health?.interfaces || {};
  const litellm = health?.litellm || {};
  const mtRuntime = health?.mtRuntime || {};
  const providerSummary = providerHealth?.summary || {};
  const unhealthy = Array.isArray(providerHealth?.items)
    ? providerHealth.items.filter((item) => item?.healthy === false && item?.enabled !== false)
    : [];

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Overview</p>
                <CardTitle className="text-2xl">Current MT system status</CardTitle>
                <CardDescription>
                  Focus the desktop app on runtime readiness, provider health, and integration state.
                </CardDescription>
              </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={onRefreshHealth}>Refresh health</Button>
              <Button type="button" variant="secondary" onClick={onRefreshProviderHealth}>Refresh providers</Button>
              <Button type="button" variant="secondary" onClick={onRefreshIntegration}>Refresh integration</Button>
            </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <StatusMetric
              icon={Activity}
              title="Gateway"
              value={health ? 'Online' : 'Loading'}
              tone={health ? 'success' : 'outline'}
              meta={`Version ${health?.version || 'n/a'} · Host ${health?.host || '127.0.0.1'} · Port ${health?.port || '5271'}`}
            />
            <StatusMetric
              icon={Gauge}
              title="MT Runtime"
              value={interfaces.mt ? 'Enabled' : 'Disabled'}
              tone={interfaces.mt ? 'success' : 'warning'}
              meta={`timeout ${health?.interfaces?.mt?.requestTimeoutMs || '-'}ms · concurrency ${mtRuntime.maxConcurrency || 1} · rps ${mtRuntime.requestsPerSecond || 0}`}
            />
            <StatusMetric
              icon={Bot}
              title="LiteLLM"
              value={litellm.enabled ? (litellm.running ? 'Ready' : 'Not ready') : 'Disabled'}
              tone={!litellm.enabled ? 'outline' : litellm.running ? 'success' : 'destructive'}
              meta={litellm.error || litellm.installCommand || 'Sidecar runtime status and readiness'}
            />
            <StatusMetric
              icon={Cable}
              title="memoQ Integration"
              value={!integrationView?.foundInstallation ? 'Not found' : integrationView.installationStatus}
              tone={!integrationView?.foundInstallation ? 'destructive' : integrationView.installationStatusClass === 'ok' ? 'success' : integrationView.installationStatusClass === 'warn' ? 'warning' : 'destructive'}
              meta={!integrationView?.foundInstallation ? 'No memoQ Desktop installation was detected.' : `${integrationView.installationName} · Addins ${integrationView.addinsDir}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider health</CardTitle>
            <CardDescription>
              Providers stay visible here without the old onboarding or step-by-step instructions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{providerSummary.total || 0}</p>
              </div>
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Healthy</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{providerSummary.healthy || 0}</p>
              </div>
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Enabled</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{providerSummary.enabled || 0}</p>
              </div>
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Unhealthy</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{providerSummary.unhealthy || 0}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              {unhealthy.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">No enabled providers are currently reporting health issues.</p>
              ) : (
                unhealthy.map((item) => (
                  <div key={`${item.providerId}-${item.code}`} className="rounded-2xl border border-border bg-background px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{item.providerId}</p>
                      <Badge variant="destructive">{item.code || 'ERROR'}</Badge>
                    </div>
                    <p className="mt-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.message || 'Provider is not healthy.'}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
