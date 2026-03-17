import { useMemo, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function ProviderField({ label, children, className = '' }) {
  return (
    <label className={`grid gap-2 text-sm ${className}`}>
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function summarizeEndpoint(endpoint) {
  if (!endpoint) return '-';
  try {
    const url = new URL(endpoint);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch (_error) {
    return endpoint;
  }
}

function ProviderEditor({ provider, index, onProviderChange, onRemoveProvider }) {
  if (!provider) return null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ProviderField label="ID">
          <Input value={provider.id} onChange={(event) => onProviderChange(index, 'id', event.target.value)} />
        </ProviderField>
        <ProviderField label="Name">
          <Input value={provider.name} onChange={(event) => onProviderChange(index, 'name', event.target.value)} />
        </ProviderField>
        <ProviderField label="Type">
          <Select value={provider.type} onChange={(event) => onProviderChange(index, 'type', event.target.value)}>
            <option value="openai">openai</option>
            <option value="openai-compatible">openai-compatible</option>
          </Select>
        </ProviderField>
        <ProviderField label="Model">
          <Input value={provider.model} onChange={(event) => onProviderChange(index, 'model', event.target.value)} />
        </ProviderField>
        <ProviderField label="Endpoint" className="sm:col-span-2">
          <Input value={provider.endpoint} onChange={(event) => onProviderChange(index, 'endpoint', event.target.value)} />
        </ProviderField>
        <ProviderField label="API Key" className="sm:col-span-2">
          <Input
            type="password"
            value={provider.apiKey}
            onChange={(event) => onProviderChange(index, 'apiKey', event.target.value)}
            placeholder="Leave blank to keep the stored secret"
          />
        </ProviderField>
      </div>

      <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
        <Checkbox checked={provider.enabled} onChange={(event) => onProviderChange(index, 'enabled', event.target.checked)} />
        Enabled
      </label>

      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => onRemoveProvider(index)}>Remove provider</Button>
      </div>
    </div>
  );
}

export function ProvidersPage({
  form,
  providerHealth,
  onFieldChange,
  onProviderChange,
  onAddProvider,
  onRemoveProvider,
  onRefreshProviderHealth,
  onSave,
  busy,
}) {
  const [editingIndex, setEditingIndex] = useState(null);

  const editingProvider = editingIndex === null ? null : form.providers[editingIndex];
  const defaultProviderOptions = useMemo(
    () => form.providers.filter((provider) => provider.id),
    [form.providers],
  );
  const healthByProviderId = useMemo(() => {
    const items = Array.isArray(providerHealth?.items) ? providerHealth.items : [];
    return new Map(items.map((item) => [item.providerId, item]));
  }, [providerHealth]);

  function getProviderHealthBadge(provider) {
    const health = healthByProviderId.get(provider.id);
    if (!provider.enabled) {
      return { label: 'Disabled', variant: 'outline' };
    }
    if (!provider.id) {
      return { label: 'Draft', variant: 'outline' };
    }
    if (!health) {
      return { label: 'Unknown', variant: 'outline' };
    }
    if (health.healthy) {
      return { label: 'Healthy', variant: 'success' };
    }
    return { label: 'Issue', variant: 'destructive' };
  }

  function handleAddProvider() {
    const nextIndex = form.providers.length;
    onAddProvider();
    setEditingIndex(nextIndex);
  }

  function handleRemoveProvider(index) {
    onRemoveProvider(index);
    setEditingIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Providers</p>
              <CardTitle className="text-2xl">MT routing and credentials</CardTitle>
              <CardDescription>
                Keep the main view compact. Open a provider to edit full endpoint, model, and credential details.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={onRefreshProviderHealth}>Refresh health</Button>
              <Button type="button" onClick={onSave} disabled={busy}>
                <Save className="h-4 w-4" />
                Save providers
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="max-w-2xl rounded-[1.35rem] border border-border bg-background p-4">
            <ProviderField label="Default provider">
              <Select value={form.mtDefaultProvider} onChange={(event) => onFieldChange('mtDefaultProvider', event.target.value)}>
                <option value="">Select a provider</option>
                {defaultProviderOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name ? `${provider.name} (${provider.id})` : provider.id}
                  </option>
                ))}
              </Select>
            </ProviderField>
          </div>

          <div className="rounded-[1.35rem] border border-border bg-background">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">Name</TableHead>
                  <TableHead className="w-[12%]">Type</TableHead>
                  <TableHead className="w-[25%]">Endpoint</TableHead>
                  <TableHead className="w-[18%]">Model</TableHead>
                  <TableHead className="w-[9%]">Enabled</TableHead>
                  <TableHead className="w-[12%]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {form.providers.map((provider, index) => (
                  <TableRow key={`${provider.id || 'provider'}-${index}`}>
                    <TableCell className="py-4">
                      <div className="space-y-1">
                        <p className="font-medium">{provider.name || provider.id || `Provider ${index + 1}`}</p>
                        <p className="truncate text-xs text-muted-foreground">{provider.id || 'No ID set'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 align-middle">{provider.type || '-'}</TableCell>
                    <TableCell className="truncate py-4 align-middle">{summarizeEndpoint(provider.endpoint)}</TableCell>
                    <TableCell className="truncate py-4 align-middle">{provider.model || '-'}</TableCell>
                    <TableCell className="py-4 align-middle">
                      <div className="flex flex-col gap-1">
                        <span>{provider.enabled ? 'Yes' : 'No'}</span>
                        <Badge variant={getProviderHealthBadge(provider).variant}>{getProviderHealthBadge(provider).label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditingIndex(index)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveProvider(index)}>Remove</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={handleAddProvider}>
              <Plus className="h-4 w-4" />
              Add provider
            </Button>
            <Button type="button" onClick={onSave} disabled={busy}>Save provider settings</Button>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={editingIndex !== null && Boolean(editingProvider)}
        onOpenChange={(open) => {
          if (!open) setEditingIndex(null);
        }}
        title={editingProvider?.name || editingProvider?.id || 'Provider details'}
        description="Edit the full provider configuration here to keep the main table compact."
      >
        <div className="grid gap-6">
          <ProviderEditor
            provider={editingProvider}
            index={editingIndex}
            onProviderChange={onProviderChange}
            onRemoveProvider={handleRemoveProvider}
          />

          <div className="sticky bottom-0 flex justify-end border-t border-border bg-card/95 py-4 backdrop-blur">
            <Button type="button" onClick={onSave} disabled={busy}>
              <Save className="h-4 w-4" />
              Save providers
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
