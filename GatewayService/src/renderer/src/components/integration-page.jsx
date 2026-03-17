import { FolderCog, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export function IntegrationPage({ form, integrationView, onFieldChange, onInstall, onRepair, onRefresh, onSave, busy }) {
  const statusVariant = !integrationView?.foundInstallation
    ? 'destructive'
    : integrationView.installationStatusClass === 'ok'
      ? 'success'
      : integrationView.installationStatusClass === 'warn'
        ? 'warning'
        : 'destructive';

  return (
    <Card>
      <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Integration</p>
            <CardTitle className="text-2xl">memoQ desktop installation</CardTitle>
            <CardDescription>
              Keep installation-specific controls separate from system and prompt tuning.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" variant="secondary" onClick={onSave} disabled={busy}>Save</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4 rounded-[1.4rem] border border-border bg-background p-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Target memoQ version</span>
              <Select value={form.memoqVersion} onChange={(event) => onFieldChange('memoqVersion', event.target.value)}>
                <option value="10">memoQ 10</option>
                <option value="11">memoQ 11</option>
                <option value="12">memoQ 12</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm text-foreground sm:col-span-2">
              <span className="font-medium">Custom memoQ install root</span>
              <Input
                value={form.memoqCustomInstallDir}
                onChange={(event) => onFieldChange('memoqCustomInstallDir', event.target.value)}
                placeholder="D:\\Apps\\memoQ\\memoQ-11"
              />
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <Button type="button" onClick={onInstall} disabled={busy}>
                <FolderCog className="h-4 w-4" />
                Install into memoQ
              </Button>
              <Button type="button" variant="secondary" onClick={onRepair} disabled={busy}>
                <Wrench className="h-4 w-4" />
                Repair installation
              </Button>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-foreground">Integration status</p>
              <Badge variant={statusVariant}>{!integrationView?.foundInstallation ? 'Not found' : integrationView.installationStatus}</Badge>
            </div>
            {!integrationView?.foundInstallation ? (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">No memoQ Desktop installation was detected.</p>
            ) : (
              <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
                <p className="break-words [overflow-wrap:anywhere]"><span className="font-medium text-foreground">Installation:</span> {integrationView.installationName}</p>
                <p className="break-words [overflow-wrap:anywhere]"><span className="font-medium text-foreground">Addins:</span> {integrationView.addinsDir}</p>
                <p className="break-words [overflow-wrap:anywhere]"><span className="font-medium text-foreground">ClientDevConfig:</span> {integrationView.clientDevConfigTarget}</p>
                <p className="break-words [overflow-wrap:anywhere]"><span className="font-medium text-foreground">Target root:</span> {integrationView.customInstallDir || `C:\\Program Files\\memoQ\\memoQ-${integrationView.requestedMemoQVersion}`}</p>
                <p><span className="font-medium text-foreground">Assets:</span> {integrationView.assetsReady ? 'Ready' : 'Missing'}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
