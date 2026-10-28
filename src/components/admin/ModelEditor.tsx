"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PROVIDERS, getProvider, isPrivateUrl } from "@/lib/admin/providers";
import type {
  AdminModel,
  DiscoverResult,
  ModelInputDraft,
  ModelsListing,
  SessionInfo,
  TestResult,
} from "@/lib/admin/schemas";
import { adminApi } from "@/lib/client/admin-api";
import { toDraft, TestOutput } from "./ModelsPage";
import { Alert, Button, Field, Modal, Toggle, inputClass } from "./ui";

interface Props {
  model: AdminModel | null;
  session: SessionInfo;
  onClose: () => void;
  onSaved: (listing: ModelsListing) => void;
  onAuthError: (err: unknown) => boolean;
}

function emptyDraft(providerKey = "openai"): ModelInputDraft {
  const p = getProvider(providerKey)!;
  return {
    name: "",
    provider: p.key,
    baseUrl: p.defaultBaseUrl,
    modelName: "",
    apiKey: "",
    clearApiKey: false,
    headers: [],
    temperature: 0.8,
    maxTokens: 2000,
    timeoutSeconds: p.cloud ? 30 : 120,
    jsonMode: p.jsonMode,
    enabled: true,
  };
}

/** Add/edit a model, with provider presets, an auto-fetched model list and a live test. */
export function ModelEditor({ model, session, onClose, onSaved, onAuthError }: Props) {
  const [v, setV] = useState<ModelInputDraft>(() => (model ? toDraft(model) : emptyDraft()));
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [found, setFound] = useState<string[] | null>(null);
  const [manual, setManual] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = { provider: useId(), name: useId(), url: useId(), key: useId(), model: useId(), temp: useId(), max: useId(), timeout: useId() };

  const provider = useMemo(() => getProvider(v.provider), [v.provider]);
  const hasStoredKey = Boolean(model?.hasApiKey) && !v.clearApiKey;

  function set<K extends keyof ModelInputDraft>(key: K, value: ModelInputDraft[K]) {
    setV((cur) => ({ ...cur, [key]: value }));
    setTest(null);
  }

  function chooseProvider(key: string) {
    const p = getProvider(key)!;
    setV((cur) => {
      const old = getProvider(cur.provider);
      // Replace the URL only if the admin hadn't customised it.
      const baseUrl = !cur.baseUrl || cur.baseUrl === old?.defaultBaseUrl ? p.defaultBaseUrl : cur.baseUrl;
      return {
        ...cur,
        provider: key,
        baseUrl,
        jsonMode: p.jsonMode,
        timeoutSeconds: cur.timeoutSeconds === (old?.cloud ? 30 : 120) ? (p.cloud ? 30 : 120) : cur.timeoutSeconds,
      };
    });
    setFound(null);
    setFetchError(null);
    setTest(null);
  }

  const payload = (): ModelInputDraft => ({ ...v, name: v.name?.trim() || v.modelName?.trim() || "" });
  const formBody = () => ({ modelId: model?.id ?? null, config: payload() });

  // Load the provider's model list once a key (or, for keyless servers, a URL) is entered.
  const canFetch = provider?.needsApiKey ? (v.apiKey ?? "").trim().length >= 8 || hasStoredKey : /^https?:\/\/.+/.test(v.baseUrl);
  const requestNo = useRef(0);
  const latest = useRef(v);
  latest.current = v;

  async function fetchModels() {
    const no = ++requestNo.current;
    setFetching(true);
    setFetchError(null);
    try {
      const cfg = latest.current;
      const r = await adminApi<DiscoverResult>("models/discover", {
        body: { modelId: model?.id ?? null, config: { ...cfg, name: cfg.name || "x", modelName: cfg.modelName || "x" } },
      });
      if (no !== requestNo.current) return;
      if (!r.ok) {
        setFetchError(r.error ?? "Couldn't fetch the model list.");
        setFound(null);
      } else if (!r.models?.length) {
        setFetchError("The provider returned no models. Type the model name instead.");
        setFound(null);
      } else {
        setFound(r.models);
        const current = latest.current.modelName ?? "";
        if (!current) {
          const preferred = provider && r.models.includes(provider.exampleModel) ? provider.exampleModel : r.models[0]!;
          setV((c) => ({ ...c, modelName: preferred }));
          setManual(false);
        } else {
          setManual(!r.models.includes(current));
        }
      }
    } catch (err) {
      if (no === requestNo.current && !onAuthError(err)) setFetchError(err instanceof Error ? err.message : "Couldn't fetch models.");
    } finally {
      if (no === requestNo.current) setFetching(false);
    }
  }

  useEffect(() => {
    if (!canFetch) {
      requestNo.current++;
      setFetching(false);
      setFound(null);
      return;
    }
    const t = setTimeout(() => void fetchModels(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.provider, v.baseUrl, v.apiKey, canFetch]);

  async function runTest() {
    setTesting(true);
    setTest(null);
    setError(null);
    try {
      setTest(await adminApi<TestResult>("models/test", { body: formBody() }));
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const listing = model
        ? await adminApi<ModelsListing>(`models/${model.id}`, { method: "PUT", body: payload() })
        : await adminApi<ModelsListing>("models", { body: payload() });
      onSaved(listing);
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Couldn't save the model.");
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      onSaved(await adminApi<ModelsListing>(`models/${model!.id}`, { method: "DELETE" }));
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Couldn't delete the model.");
      setSaving(false);
    }
  }

  const headers = v.headers ?? [];
  const showList = found !== null && !manual;
  const privateUrl = isPrivateUrl(v.baseUrl);

  return (
    <Modal
      wide
      title={model ? `Edit ${model.name}` : "Add AI model"}
      onClose={onClose}
      footer={
        <>
          {model &&
            (confirmDelete ? (
              <Button kind="danger" onClick={() => void remove()} loading={saving} className="mr-auto">
                Really delete?
              </Button>
            ) : (
              <Button kind="ghost" onClick={() => setConfirmDelete(true)} className="mr-auto text-red-700 hover:text-red-800">
                Delete
              </Button>
            ))}
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="primary" onClick={() => void save()} loading={saving} disabled={!v.modelName?.trim()}>
            {model ? "Save changes" : "Add model"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider" htmlFor={ids.provider} hint={provider?.hint}>
            <select id={ids.provider} className={inputClass} value={v.provider} onChange={(e) => chooseProvider(e.target.value)}>
              <optgroup label="Cloud">
                {PROVIDERS.filter((p) => p.cloud).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Self-hosted (e.g. Qwen on your server)">
                {PROVIDERS.filter((p) => !p.cloud).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Field label="Display name" htmlFor={ids.name} hint="Shown to users in the model list and on result cards.">
            <input
              id={ids.name}
              className={inputClass}
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={v.modelName || "e.g. Qwen 2.5 7B (our server)"}
              maxLength={100}
            />
          </Field>
          <Field
            label="Base URL"
            htmlFor={ids.url}
            className="sm:col-span-2"
            hint={provider?.kind === "openai" ? "OpenAI-compatible endpoint, usually ending in /v1." : "Pre-filled; change only if you use a proxy."}
          >
            <input
              id={ids.url}
              className={`${inputClass} font-mono`}
              value={v.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder={provider?.defaultBaseUrl || "https://your-server.example.com/v1"}
              spellCheck={false}
            />
          </Field>
          <Field
            label={`API key${provider?.needsApiKey ? "" : " (optional)"}`}
            htmlFor={ids.key}
            hint={
              hasStoredKey ? (
                <>
                  Saved key {model?.apiKeyHint}. Leave blank to keep it.{" "}
                  <button type="button" className="font-medium text-red-700 hover:underline" onClick={() => set("clearApiKey", true)}>
                    Remove key
                  </button>
                </>
              ) : v.clearApiKey ? (
                <>
                  The saved key will be removed.{" "}
                  <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => set("clearApiKey", false)}>
                    Undo
                  </button>
                </>
              ) : provider?.needsApiKey ? (
                "Stored encrypted; never shown again."
              ) : (
                "Most self-hosted servers don't need one."
              )
            }
          >
            <input
              id={ids.key}
              type="password"
              className={inputClass}
              autoComplete="new-password"
              value={v.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              placeholder={hasStoredKey ? "••••••••" : ""}
            />
          </Field>
          <Field
            label="Model name"
            htmlFor={ids.model}
            hint={
              showList ? (
                <>
                  {found!.length} models available.{" "}
                  <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setManual(true)}>
                    Type a name instead
                  </button>
                </>
              ) : fetching ? (
                "Loading the models this provider offers…"
              ) : provider?.needsApiKey && !canFetch ? (
                "Enter the API key to choose from the provider's models, or type a name."
              ) : (
                <>
                  Exactly as the provider names it, e.g. <code>{provider?.exampleModel}</code>
                  {found && (
                    <>
                      {" "}
                      ·{" "}
                      <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setManual(false)}>
                        Pick from list
                      </button>
                    </>
                  )}
                </>
              )
            }
          >
            <div className="flex gap-2">
              {showList ? (
                <select id={ids.model} className={`${inputClass} font-mono`} value={v.modelName} onChange={(e) => set("modelName", e.target.value)}>
                  {!found!.includes(v.modelName ?? "") && <option value={v.modelName}>{v.modelName || "Choose a model"}</option>}
                  {found!.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={ids.model}
                  className={`${inputClass} font-mono`}
                  value={v.modelName}
                  onChange={(e) => set("modelName", e.target.value)}
                  placeholder={provider?.exampleModel}
                  spellCheck={false}
                />
              )}
              <Button onClick={() => void fetchModels()} loading={fetching} disabled={!canFetch} aria-label="Refresh model list" title="Refresh model list">
                ↻
              </Button>
            </div>
          </Field>
        </div>

        {fetchError && <Alert kind="warning">{fetchError}</Alert>}

        {privateUrl && (
          <Alert kind={session.runtime === "cloudflare" ? "warning" : "info"}>
            {session.runtime === "cloudflare" ? (
              <>
                <strong>This address is on a private network.</strong> CaptionGen runs on Cloudflare, which can only reach
                public HTTPS addresses. Expose your model server through a public URL (for example with Cloudflare Tunnel)
                and protect it with a token header under <em>Advanced options</em>.
              </>
            ) : (
              <>
                Private and local addresses work while CaptionGen runs on the same machine or network. When deployed to
                Cloudflare, use a public HTTPS URL for the model server instead (for example via Cloudflare Tunnel).
              </>
            )}
          </Alert>
        )}

        <label className="flex items-center gap-3 text-sm">
          <Toggle checked={v.enabled ?? true} onChange={(on) => set("enabled", on)} label="Available to users" />
          <span>
            <span className="font-medium">Available to users</span>
            <span className="block text-xs text-muted">Turn off to keep the model saved but hidden (and unused as a fallback).</span>
          </span>
        </label>

        <button
          type="button"
          className="text-sm font-medium text-brand-700 hover:underline"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
        >
          {advanced ? "Hide" : "Show"} advanced options
        </button>

        {advanced && (
          <div className="space-y-4 rounded-xl border border-line bg-bg/40 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Temperature" htmlFor={ids.temp} hint="0 = focused, 1.5 = very creative. 0.8 suits captions.">
                <input
                  id={ids.temp}
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.1}
                  className={inputClass}
                  value={v.temperature}
                  onChange={(e) => set("temperature", Number(e.target.value))}
                />
              </Field>
              <Field label="Max output tokens" htmlFor={ids.max}>
                <input
                  id={ids.max}
                  type="number"
                  min={256}
                  max={16000}
                  step={100}
                  className={inputClass}
                  value={v.maxTokens}
                  onChange={(e) => set("maxTokens", Number(e.target.value))}
                />
              </Field>
              <Field label="Timeout (seconds)" htmlFor={ids.timeout} hint="Up to 300 for slow local models.">
                <input
                  id={ids.timeout}
                  type="number"
                  min={5}
                  max={300}
                  className={inputClass}
                  value={v.timeoutSeconds}
                  onChange={(e) => set("timeoutSeconds", Number(e.target.value))}
                />
              </Field>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <Toggle checked={v.jsonMode ?? false} onChange={(on) => set("jsonMode", on)} label="JSON mode" />
              <span>
                <span className="font-medium">JSON mode</span>
                <span className="block text-xs text-muted">
                  Asks the API for strict JSON. Turn off if the server rejects <code>response_format</code>; CaptionGen
                  still parses the reply safely.
                </span>
              </span>
            </label>

            <div>
              <p className="text-sm font-medium">Extra headers</p>
              <p className="mb-2 text-xs text-muted">
                For example an access token for a reverse proxy or Cloudflare Tunnel in front of your Qwen server. Values are
                encrypted; leave a value blank to keep the saved one.
              </p>
              <div className="space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={`${inputClass} font-mono`}
                      placeholder="Header name"
                      aria-label={`Header ${i + 1} name`}
                      value={h.name}
                      onChange={(e) => set("headers", headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      type="password"
                      autoComplete="new-password"
                      className={inputClass}
                      placeholder={model?.headerNames.includes(h.name) ? "•••••••• (saved)" : "Value"}
                      aria-label={`Header ${i + 1} value`}
                      value={h.value}
                      onChange={(e) => set("headers", headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <Button kind="ghost" aria-label={`Remove header ${i + 1}`} onClick={() => set("headers", headers.filter((_, j) => j !== i))}>
                      ✕
                    </Button>
                  </div>
                ))}
                {headers.length < 10 && (
                  <Button size="sm" onClick={() => set("headers", [...headers, { name: "", value: "" }])}>
                    + Add header
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button onClick={() => void runTest()} loading={testing} disabled={!v.modelName?.trim() || !v.baseUrl}>
            Test connection
          </Button>
          <span className="text-xs text-muted">Generates one sample caption with these settings, without saving.</span>
        </div>
        {testing && (
          <p className="text-sm text-muted" role="status">
            Generating a sample caption… local models can take a little longer.
          </p>
        )}
        {test && <TestOutput result={test} />}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
