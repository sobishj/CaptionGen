"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClientError, fetchModels, requestCaptions, type ClientErrorCode } from "@/lib/client/api";
import { PLATFORM_RULES, TONE_LABELS } from "@/lib/platforms";
import {
  GenerateRequestSchema,
  type GenerateRequest,
  type GeneratedVariation,
  type Platform,
  type PublicModel,
} from "@/lib/schemas";
import { GeneratorForm, type FormValues } from "./GeneratorForm";
import { ResultCard } from "./ResultCard";
import { EmptyState, ErrorState, LoadingState } from "./States";
import { useToast } from "./Toast";
import { RefreshIcon } from "./icons";

const DEFAULT_VALUES: FormValues = {
  description: "",
  platform: "instagram",
  tone: "friendly",
  count: 3,
  emojis: true,
  modelId: "",
};

const SLOW_HINT_MS = 5000;

type Status = "idle" | "loading" | "success" | "error";

interface Result {
  input: GenerateRequest;
  variations: GeneratedVariation[];
  fallbackFrom?: string;
}

export function CaptionGenerator() {
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: ClientErrorCode; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const emojisTouched = useRef(false);
  const lastRequest = useRef<GenerateRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const loadModels = useCallback(async () => {
    const list = await fetchModels();
    setModels(list);
    setValues((v) => {
      if (v.modelId && list.some((m) => m.id === v.modelId)) return v;
      return { ...v, modelId: list.find((m) => m.isDefault)?.id ?? list[0]?.id ?? "" };
    });
  }, []);

  useEffect(() => {
    void loadModels();
    return () => abortRef.current?.abort();
  }, [loadModels]);

  const scrollToResultsOnMobile = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const onError = useCallback(
    (e: ClientError) => {
      // The admin removed or disabled the chosen model: refresh the list.
      if (e.code === "MODEL_NOT_FOUND") void loadModels();
    },
    [loadModels],
  );

  const run = useCallback(
    async (input: GenerateRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastRequest.current = input;

      setStatus("loading");
      setError(null);
      setSlow(false);
      setRegeneratingId(null);
      const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS);
      scrollToResultsOnMobile();

      try {
        const res = await requestCaptions(input, controller.signal);
        setResult({ input, variations: res.variations, fallbackFrom: res.fallbackFrom });
        setStatus("success");
      } catch (err) {
        if (controller.signal.aborted) return;
        const e = err instanceof ClientError ? err : new ClientError("INTERNAL", "Something went wrong. Please try again.");
        onError(e);
        setError({ code: e.code, message: e.message });
        setStatus("error");
      } finally {
        clearTimeout(slowTimer);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [onError],
  );

  function submit(overrides?: Partial<FormValues>) {
    const v = { ...values, ...overrides };
    const parsed = GenerateRequestSchema.safeParse({ ...v, modelId: v.modelId || undefined });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please check your input.");
      textareaRef.current?.focus();
      return;
    }
    setFormError(null);
    void run(parsed.data);
  }

  async function regenerateOne(id: string) {
    if (!result || regeneratingId) return;
    setRegeneratingId(id);
    try {
      const res = await requestCaptions({
        ...result.input,
        count: 1,
        avoid: result.variations.map((v) => v.caption),
      });
      const replacement = res.variations[0];
      if (!replacement) throw new ClientError("BAD_OUTPUT", "That came back empty. Please try again.");
      setResult((r) => (r ? { ...r, variations: r.variations.map((v) => (v.id === id ? replacement : v)) } : r));
      toast("New draft ready");
    } catch (err) {
      if (err instanceof ClientError) onError(err);
      toast(err instanceof ClientError ? err.message : "Couldn't write another. Please try again.", "error");
    } finally {
      setRegeneratingId(null);
    }
  }

  function changePlatform(platform: Platform) {
    setValues((v) => ({
      ...v,
      platform,
      emojis: emojisTouched.current ? v.emojis : PLATFORM_RULES[platform].emojisByDefault,
    }));
  }

  function changeValues(patch: Partial<FormValues>) {
    if ("emojis" in patch) emojisTouched.current = true;
    if ("description" in patch) setFormError(null);
    setValues((v) => ({ ...v, ...patch }));
  }

  function pickExample(text: string) {
    changeValues({ description: text });
    submit({ description: text });
  }

  const loading = status === "loading";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-10">
      <section
        aria-labelledby="form-heading"
        className="rounded-lg border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-6 lg:self-start"
      >
        <h2 id="form-heading" className="sr-only">
          Caption details
        </h2>
        <GeneratorForm
          values={values}
          models={models}
          onChange={changeValues}
          onPlatformChange={changePlatform}
          onSubmit={() => submit()}
          loading={loading}
          error={formError}
          textareaRef={textareaRef}
        />
      </section>

      <section ref={resultsRef} aria-labelledby="results-heading" className="min-w-0 scroll-mt-4">
        <h2 id="results-heading" className="sr-only">
          Results
        </h2>
        {status === "success" && result && (
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-ink-2">
              <span className="font-display text-2xl text-ink">
                {result.variations.length} draft{result.variations.length === 1 ? "" : "s"}
              </span>{" "}
              for {PLATFORM_RULES[result.input.platform].label}, {TONE_LABELS[result.input.tone].toLowerCase()}
              {result.input.emojis ? "" : ", no emojis"}
            </p>
            <button
              type="button"
              onClick={() => void run(result.input)}
              disabled={regeneratingId !== null}
              className="inline-flex items-center gap-2 rounded-md border border-line px-3.5 py-2 text-sm text-ink-2 transition hover:border-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshIcon className="size-4" />
              Rewrite all
            </button>
          </div>
        )}

        <div aria-live="polite" aria-busy={loading}>
          {status === "idle" && <EmptyState onExample={pickExample} />}
          {status === "loading" && <LoadingState count={lastRequest.current?.count ?? values.count} slow={slow} />}
          {status === "error" && error && (
            <ErrorState
              code={error.code}
              message={error.message}
              onRetry={() => lastRequest.current && void run({ ...lastRequest.current, modelId: values.modelId || undefined })}
            />
          )}
          {status === "success" && result && (
            <div className="space-y-4">
              {result.fallbackFrom && (
                <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
                  {result.fallbackFrom} wasn&apos;t available, so {result.variations[0]?.model} wrote these instead.
                </p>
              )}
              {result.variations.map((v, i) => (
                <ResultCard
                  key={v.id}
                  index={i}
                  variation={v}
                  platform={result.input.platform}
                  regenerating={regeneratingId === v.id}
                  disabled={regeneratingId !== null}
                  onRegenerate={() => void regenerateOne(v.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
