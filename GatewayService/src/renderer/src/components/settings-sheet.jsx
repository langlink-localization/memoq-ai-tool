import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

function Field({ label, children, description }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {description ? <span className="text-xs leading-5 text-muted-foreground">{description}</span> : null}
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function SettingsSheet({ open, onOpenChange, form, onFieldChange, onSave, busy }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="System and prompt settings"
      description="Hidden from the main navigation, but still available for full desktop configuration."
    >
      <div className="grid gap-8">
        <section className="grid gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Interfaces and runtime</p>
            <h3 className="mt-2 text-lg font-semibold text-foreground">Gateway system</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleField label="MT interface enabled" checked={form.mtEnabled} onChange={(value) => onFieldChange('mtEnabled', value)} />
            <ToggleField label="TM interface enabled" checked={form.tmEnabled} onChange={(value) => onFieldChange('tmEnabled', value)} />
            <ToggleField label="TB interface enabled" checked={form.tbEnabled} onChange={(value) => onFieldChange('tbEnabled', value)} />
            <ToggleField label="QA interface enabled" checked={form.qaEnabled} onChange={(value) => onFieldChange('qaEnabled', value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gateway host"><Input value={form.host} onChange={(event) => onFieldChange('host', event.target.value)} /></Field>
            <Field label="Gateway port"><Input type="number" value={form.port} onChange={(event) => onFieldChange('port', event.target.value)} /></Field>
            <Field label="MT timeout (ms)"><Input type="number" value={form.mtTimeout} onChange={(event) => onFieldChange('mtTimeout', event.target.value)} /></Field>
            <Field label="MT batch size"><Input type="number" value={form.mtBatch} onChange={(event) => onFieldChange('mtBatch', event.target.value)} /></Field>
            <Field label="Log retention (days)"><Input type="number" value={form.retentionDays} onChange={(event) => onFieldChange('retentionDays', event.target.value)} /></Field>
            <Field label="LiteLLM port"><Input type="number" value={form.liteLLMPort} onChange={(event) => onFieldChange('liteLLMPort', event.target.value)} /></Field>
            <Field label="LiteLLM host"><Input value={form.liteLLMHost} onChange={(event) => onFieldChange('liteLLMHost', event.target.value)} /></Field>
            <Field label="LiteLLM cli"><Input value={form.liteLLMCli} onChange={(event) => onFieldChange('liteLLMCli', event.target.value)} /></Field>
            <Field label="LiteLLM python"><Input value={form.liteLLMPython} onChange={(event) => onFieldChange('liteLLMPython', event.target.value)} /></Field>
            <div className="sm:col-span-2 flex flex-wrap gap-3">
              <ToggleField label="Enable LiteLLM" checked={form.liteLLMEnabled} onChange={(value) => onFieldChange('liteLLMEnabled', value)} />
              <ToggleField label="Mask sensitive data in logs" checked={form.maskSensitive} onChange={(value) => onFieldChange('maskSensitive', value)} />
              <ToggleField label="Hash text for log" checked={form.hashTextForLog} onChange={(value) => onFieldChange('hashTextForLog', value)} />
              <ToggleField label="Store raw payload" checked={form.storeRawPayload} onChange={(value) => onFieldChange('storeRawPayload', value)} />
            </div>
          </div>
        </section>

        <Separator />

        <section className="grid gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Prompt controls</p>
            <h3 className="mt-2 text-lg font-semibold text-foreground">MT prompt and advanced policy</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleField label="Use batch prompts" checked={form.advUseBatchPrompt} onChange={(value) => onFieldChange('advUseBatchPrompt', value)} />
            <ToggleField label="Inject context" checked={form.advEnableContext} onChange={(value) => onFieldChange('advEnableContext', value)} />
            <ToggleField label="Inject TM hints" checked={form.advEnableTm} onChange={(value) => onFieldChange('advEnableTm', value)} />
            <ToggleField label="Enable glossary" checked={form.advEnableGlossary} onChange={(value) => onFieldChange('advEnableGlossary', value)} />
            <ToggleField label="Enable summary" checked={form.advEnableSummary} onChange={(value) => onFieldChange('advEnableSummary', value)} />
            <ToggleField label="Enable cache" checked={form.advEnableCache} onChange={(value) => onFieldChange('advEnableCache', value)} />
            <ToggleField label="Insert tags to end" checked={form.advInsertTagsToEnd} onChange={(value) => onFieldChange('advInsertTagsToEnd', value)} />
            <ToggleField label="Normalize tag spacing" checked={form.advNormalizeTagSpaces} onChange={(value) => onFieldChange('advNormalizeTagSpaces', value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch max segments"><Input type="number" value={form.advBatchSegments} onChange={(event) => onFieldChange('advBatchSegments', event.target.value)} /></Field>
            <Field label="Batch max characters"><Input type="number" value={form.advBatchChars} onChange={(event) => onFieldChange('advBatchChars', event.target.value)} /></Field>
            <Field label="Retry max attempts"><Input type="number" value={form.advRetryAttempts} onChange={(event) => onFieldChange('advRetryAttempts', event.target.value)} /></Field>
            <Field label="Retry backoff ms"><Input type="number" value={form.advRetryBackoff} onChange={(event) => onFieldChange('advRetryBackoff', event.target.value)} /></Field>
            <Field label="Context before"><Input type="number" value={form.advContextBefore} onChange={(event) => onFieldChange('advContextBefore', event.target.value)} /></Field>
            <Field label="Context after"><Input type="number" value={form.advContextAfter} onChange={(event) => onFieldChange('advContextAfter', event.target.value)} /></Field>
            <Field label="Max concurrency"><Input type="number" value={form.advMaxConcurrency} onChange={(event) => onFieldChange('advMaxConcurrency', event.target.value)} /></Field>
            <Field label="Requests per second"><Input type="number" value={form.advRequestsPerSecond} onChange={(event) => onFieldChange('advRequestsPerSecond', event.target.value)} /></Field>
          </div>
          <div className="grid gap-4">
            <Field label="System prompt"><Textarea value={form.advSystemPrompt} onChange={(event) => onFieldChange('advSystemPrompt', event.target.value)} /></Field>
            <Field label="User prompt"><Textarea value={form.advUserPrompt} onChange={(event) => onFieldChange('advUserPrompt', event.target.value)} /></Field>
            <Field label="Batch system prompt"><Textarea value={form.advBatchSystemPrompt} onChange={(event) => onFieldChange('advBatchSystemPrompt', event.target.value)} /></Field>
            <Field label="Batch user prompt"><Textarea value={form.advBatchUserPrompt} onChange={(event) => onFieldChange('advBatchUserPrompt', event.target.value)} /></Field>
            <Field label="Glossary entries"><Textarea value={form.advGlossaryEntries} onChange={(event) => onFieldChange('advGlossaryEntries', event.target.value)} /></Field>
            <Field label="Summary text"><Textarea value={form.advSummaryText} onChange={(event) => onFieldChange('advSummaryText', event.target.value)} /></Field>
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-end border-t border-border bg-card/95 py-4 backdrop-blur">
          <Button type="button" onClick={onSave} disabled={busy}>
            <Save className="h-4 w-4" />
            Save hidden settings
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
