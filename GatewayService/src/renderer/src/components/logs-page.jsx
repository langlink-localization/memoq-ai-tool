import { useMemo, useState } from 'react';
import { Copy, Eye, Search, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';

function FilterField({ label, children }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function summarize(text, fallback = '-') {
  if (!text) return fallback;
  return String(text);
}

function JsonBlock({ label, value }) {
  if (!value) return null;

  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <pre className="overflow-x-auto rounded-2xl border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
        {content}
      </pre>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]">{value || '-'}</p>
    </div>
  );
}

async function copyText(value) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  } catch (_error) {
    // Ignore clipboard failures inside the desktop shell.
  }
}

export function LogsPage({ filters, logs, onFilterChange, onSearch, loading }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const items = logs?.items || [];
  const selectedItem = useMemo(
    () => items.find((item) => `${item.requestId}-${item.createdAt}` === selectedKey) || null,
    [items, selectedKey],
  );

  return (
    <>
      <div className="grid gap-5">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Logs</p>
                <CardTitle className="text-2xl">Request diagnostics</CardTitle>
                <CardDescription>
                  Keep the results list readable. Filters and long payload details both open in popouts.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                </Button>
                <Button type="button" onClick={onSearch} disabled={loading}>
                  <Search className="h-4 w-4" />
                  Search logs
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{filters.interfaceName || 'All interfaces'}</Badge>
            <Badge variant="outline">{filters.status === '1' ? 'Failures' : filters.status === '0' ? 'Successes' : 'All statuses'}</Badge>
            <Badge variant="outline">{filters.provider || 'All providers'}</Badge>
            <Badge variant="outline">{filters.model || 'All models'}</Badge>
            <Badge variant="outline">{filters.keyword || 'No keyword filter'}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent results</CardTitle>
            <CardDescription>
              {Array.isArray(logs?.items) ? `${logs.items.length} log entries loaded` : 'Loading logs'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[640px] rounded-[1.35rem] border border-border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Elapsed</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`${item.requestId}-${item.createdAt}`}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>{item.interfaceName}</TableCell>
                      <TableCell className="min-w-[160px] max-w-[220px] truncate">{item.providerId || '-'}</TableCell>
                      <TableCell className="min-w-[180px] max-w-[240px] truncate">{item.model || '-'}</TableCell>
                      <TableCell>{item.status === 0 ? <Badge variant="success">Success</Badge> : <Badge variant="destructive">Failure</Badge>}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.elapsedMs || 0} ms</TableCell>
                      <TableCell className="min-w-[220px] max-w-[320px] truncate">
                        {summarize(item.errorCode || item.requestType || item.documentId || item.requestId)}
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedKey(`${item.requestId}-${item.createdAt}`)}>
                          <Eye className="h-4 w-4" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Log filters"
        description="Use the compact defaults for everyday searches. Open advanced filters only when you need deep identifiers."
      >
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FilterField label="Interface">
              <Select value={filters.interfaceName} onChange={(event) => onFilterChange('interfaceName', event.target.value)}>
                <option value="">All</option>
                <option value="mt">MT</option>
                <option value="tm">TM</option>
                <option value="tb">TB</option>
                <option value="qa">QA</option>
              </Select>
            </FilterField>
            <FilterField label="Status">
              <Select value={filters.status} onChange={(event) => onFilterChange('status', event.target.value)}>
                <option value="">All</option>
                <option value="0">Success</option>
                <option value="1">Failure</option>
              </Select>
            </FilterField>
            <FilterField label="Request type">
              <Input value={filters.requestType} onChange={(event) => onFilterChange('requestType', event.target.value)} />
            </FilterField>
            <FilterField label="Provider">
              <Input value={filters.provider} onChange={(event) => onFilterChange('provider', event.target.value)} />
            </FilterField>
            <FilterField label="Model">
              <Input value={filters.model} onChange={(event) => onFilterChange('model', event.target.value)} />
            </FilterField>
            <FilterField label="Keyword">
              <Input value={filters.keyword} onChange={(event) => onFilterChange('keyword', event.target.value)} />
            </FilterField>
            <FilterField label="Start time">
              <Input type="datetime-local" value={filters.start} onChange={(event) => onFilterChange('start', event.target.value)} />
            </FilterField>
            <FilterField label="End time">
              <Input type="datetime-local" value={filters.end} onChange={(event) => onFilterChange('end', event.target.value)} />
            </FilterField>
          </div>

          <div className="grid gap-3 rounded-[1.35rem] border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Advanced filters</p>
                <p className="text-sm text-muted-foreground">Show document-level IDs only when you need precise tracing.</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setShowAdvanced((current) => !current)}>
                {showAdvanced ? 'Hide advanced' : 'Show advanced'}
              </Button>
            </div>

            {showAdvanced ? (
              <div className="grid gap-4 md:grid-cols-2">
                <FilterField label="Document ID">
                  <Input value={filters.documentId} onChange={(event) => onFilterChange('documentId', event.target.value)} />
                </FilterField>
                <FilterField label="Segment hash">
                  <Input value={filters.segmentHash} onChange={(event) => onFilterChange('segmentHash', event.target.value)} />
                </FilterField>
                <FilterField label="Request ID">
                  <Input value={filters.requestId} onChange={(event) => onFilterChange('requestId', event.target.value)} />
                </FilterField>
                <label className="flex items-end">
                  <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <Checkbox checked={filters.includePayload} onChange={(event) => onFilterChange('includePayload', event.target.checked)} />
                    Include raw payload
                  </span>
                </label>
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-card/95 py-4 backdrop-blur">
            <Button type="button" variant="secondary" onClick={() => setFiltersOpen(false)}>Close</Button>
            <Button type="button" onClick={() => { setFiltersOpen(false); onSearch(); }} disabled={loading}>
              <Search className="h-4 w-4" />
              Search logs
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
        title="Log details"
        description="Full request metadata and payloads live here so the results table can stay compact."
      >
        {selectedItem ? (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => copyText(selectedItem.requestId)}>
                <Copy className="h-4 w-4" />
                Copy request ID
              </Button>
              <Button type="button" variant="secondary" onClick={() => copyText(selectedItem.requestPayload)}>
                <Copy className="h-4 w-4" />
                Copy request payload
              </Button>
              <Button type="button" variant="secondary" onClick={() => copyText(selectedItem.responsePayload)}>
                <Copy className="h-4 w-4" />
                Copy response payload
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Created at" value={formatDateTime(selectedItem.createdAt)} />
              <DetailRow label="Status" value={selectedItem.status === 0 ? 'Success' : 'Failure'} />
              <DetailRow label="Interface" value={selectedItem.interfaceName} />
              <DetailRow label="Request type" value={selectedItem.requestType} />
              <DetailRow label="Provider" value={selectedItem.providerId} />
              <DetailRow label="Model" value={selectedItem.model} />
              <DetailRow label="Elapsed" value={`${selectedItem.elapsedMs || 0} ms`} />
              <DetailRow label="Error code" value={selectedItem.errorCode} />
              <DetailRow label="Document ID" value={selectedItem.documentId} />
              <DetailRow label="Request ID" value={selectedItem.requestId} />
              <DetailRow label="Segment hash" value={selectedItem.segmentHashes} />
              <DetailRow label="Keyword summary" value={selectedItem.keyword || selectedItem.message} />
            </div>

            <JsonBlock label="Request payload" value={selectedItem.requestPayload} />
            <JsonBlock label="Response payload" value={selectedItem.responsePayload} />
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
