import { useEffect, useMemo, useState } from 'react';
import { AppWindow, Blocks, ClipboardList, ScrollText } from 'lucide-react';
import { TopBar, SidebarNav } from '@/components/app-shell';
import { IntegrationPage } from '@/components/integration-page';
import { LogsPage } from '@/components/logs-page';
import { OverviewPage } from '@/components/overview-page';
import { ProvidersPage } from '@/components/providers-page';
import { SettingsSheet } from '@/components/settings-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  createDefaultLogFiltersFromNow,
  fetchConfig,
  fetchHealth,
  fetchIntegrationStatus,
  fetchLogs,
  fetchProviderHealth,
  runIntegrationAction,
  saveConfig,
  saveProviderSecret,
} from '@/lib/api';
import {
  buildConfigPayload,
  configToForm,
  createDefaultConfigForm,
  createEmptyProvider,
} from '@/lib/config';
import { buildIntegrationStatusViewModel } from '@/lib/ui-state';

const TAB_STORAGE_KEY = 'memoq-ai-gateway.active-tab';

const navItems = [
  { key: 'overview', label: 'Overview', description: 'Gateway and provider status', icon: AppWindow },
  { key: 'integration', label: 'Integration', description: 'memoQ desktop installation', icon: Blocks },
  { key: 'providers', label: 'Providers', description: 'Routing and credentials', icon: ClipboardList },
  { key: 'logs', label: 'Logs', description: 'Search request diagnostics', icon: ScrollText },
];

function createStatusText(health, providerHealth) {
  const providerSummary = providerHealth?.summary || {};
  const gatewayLabel = health ? `Gateway ${health.version || 'n/a'}` : 'Gateway loading';
  return `${gatewayLabel} · Providers ${providerSummary.healthy || 0}/${providerSummary.enabled || 0} healthy`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => window.localStorage.getItem(TAB_STORAGE_KEY) || 'overview');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [providerHealth, setProviderHealth] = useState(null);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [form, setForm] = useState(createDefaultConfigForm());
  const [logsFilters, setLogsFilters] = useState(createDefaultLogFiltersFromNow());
  const [logs, setLogs] = useState({ items: [] });
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyIntegration, setBusyIntegration] = useState(false);
  const [error, setError] = useState('');

  const integrationView = useMemo(
    () => buildIntegrationStatusViewModel(integrationStatus || {}),
    [integrationStatus],
  );

  const statusText = useMemo(
    () => createStatusText(health, providerHealth),
    [health, providerHealth],
  );

  useEffect(() => {
    window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  async function refreshHealth() {
    setHealth(await fetchHealth());
  }

  async function refreshProviderHealth() {
    setProviderHealth(await fetchProviderHealth());
  }

  async function refreshIntegration() {
    setIntegrationStatus(await fetchIntegrationStatus());
  }

  async function refreshConfig() {
    const config = await fetchConfig();
    setForm(configToForm(config));
  }

  async function refreshLogs() {
    setLoadingLogs(true);
    try {
      const data = await fetchLogs(logsFilters);
      setLogs(data);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function refreshAll() {
    setError('');
    try {
      await Promise.all([refreshHealth(), refreshProviderHealth(), refreshIntegration(), refreshConfig()]);
      await refreshLogs();
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    refreshAll();
    const healthInterval = window.setInterval(() => {
      refreshHealth().catch(() => {});
    }, 15000);
    const providerInterval = window.setInterval(() => {
      refreshProviderHealth().catch(() => {});
    }, 20000);
    return () => {
      window.clearInterval(healthInterval);
      window.clearInterval(providerInterval);
    };
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setProviderField(index, key, value) {
    setForm((current) => ({
      ...current,
      providers: current.providers.map((provider, providerIndex) => (
        providerIndex === index ? { ...provider, [key]: value } : provider
      )),
    }));
  }

  function addProvider() {
    setForm((current) => ({
      ...current,
      providers: [...current.providers, createEmptyProvider()],
    }));
  }

  function removeProvider(index) {
    setForm((current) => {
      const providers = current.providers.filter((_, providerIndex) => providerIndex !== index);
      const stillExists = providers.some((provider) => provider.id === current.mtDefaultProvider);
      return {
        ...current,
        providers,
        mtDefaultProvider: stillExists ? current.mtDefaultProvider : '',
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = buildConfigPayload(form);
      await saveConfig(payload);
      await Promise.all(form.providers.map((provider) => saveProviderSecret(provider.id, provider.apiKey)));
      await Promise.all([refreshConfig(), refreshHealth(), refreshProviderHealth(), refreshIntegration()]);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleIntegrationAction(path) {
    setBusyIntegration(true);
    setError('');
    try {
      await runIntegrationAction(path);
      await refreshIntegration();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyIntegration(false);
    }
  }

  const page = {
    overview: (
      <OverviewPage
        health={health}
        providerHealth={providerHealth}
        integrationView={integrationView}
        onRefreshHealth={() => refreshHealth().catch((loadError) => setError(loadError.message))}
        onRefreshProviderHealth={() => refreshProviderHealth().catch((loadError) => setError(loadError.message))}
        onRefreshIntegration={() => refreshIntegration().catch((loadError) => setError(loadError.message))}
      />
    ),
    integration: (
      <IntegrationPage
        form={form}
        integrationView={integrationView}
        onFieldChange={setField}
        onInstall={() => handleIntegrationAction('/desktop/integration/install')}
        onRepair={() => handleIntegrationAction('/desktop/integration/repair')}
        onRefresh={() => refreshIntegration().catch((loadError) => setError(loadError.message))}
        onSave={handleSave}
        busy={busyIntegration || saving}
      />
    ),
    providers: (
      <ProvidersPage
        form={form}
        providerHealth={providerHealth}
        onFieldChange={setField}
        onProviderChange={setProviderField}
        onAddProvider={addProvider}
        onRemoveProvider={removeProvider}
        onRefreshProviderHealth={() => refreshProviderHealth().catch((loadError) => setError(loadError.message))}
        onSave={handleSave}
        busy={saving}
      />
    ),
    logs: (
      <LogsPage
        filters={logsFilters}
        logs={logs}
        loading={loadingLogs}
        onFilterChange={(key, value) => setLogsFilters((current) => ({ ...current, [key]: value }))}
        onSearch={() => refreshLogs().catch((loadError) => setError(loadError.message))}
      />
    ),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar statusText={statusText} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row">
        <SidebarNav items={navItems} activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="min-w-0 flex-1 space-y-5">
          {error ? (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="break-words text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>
                <Button type="button" variant="secondary" onClick={refreshAll}>Retry</Button>
              </CardContent>
            </Card>
          ) : null}
          {page[activeTab]}
        </main>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        form={form}
        onFieldChange={setField}
        onSave={handleSave}
        busy={saving}
      />
    </div>
  );
}
