"use client";

import type { ClientErrorCode } from "@/lib/client/api";
import { HowItWorksDemo } from "./HowItWorksDemo";
import { AlertIcon, RefreshIcon } from "./icons";

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-line bg-surface p-5 sm:p-6" aria-hidden="true">
      <div className="animate-pulse">
        <div className="mb-5 flex justify-between">
          <div className="h-6 w-8 rounded bg-surface-2" />
          <div className="h-3 w-20 rounded bg-surface-2" />
        </div>
        <div className="space-y-2.5">
          <div className="h-3.5 w-11/12 rounded bg-surface-2" />
          <div className="h-3.5 w-full rounded bg-surface-2" />
          <div className="h-3.5 w-4/5 rounded bg-surface-2" />
          <div className="h-3.5 w-2/3 rounded bg-surface-2" />
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {[16, 20, 14, 24, 18].map((w, i) => (
            <div key={i} className="h-5 rounded bg-surface-2" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="mt-6 flex gap-2 border-t border-line pt-4">
          <div className="h-8 w-28 rounded-md bg-surface-2" />
          <div className="h-8 w-28 rounded-md bg-surface-2" />
        </div>
      </div>
    </div>
  );
}

export function LoadingState({ count, slow }: { count: number; slow: boolean }) {
  return (
    <div className="space-y-4">
      <p className="sr-only">Writing your captions, please wait.</p>
      {slow && (
        <p className="animate-fade-in rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
          Still writing. Some models, especially ones running on your own server, take a little longer.
        </p>
      )}
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export const EXAMPLE_PROMPTS = [
  "Handmade soy candles, lavender scent, launching this Friday",
  "Our family-run Italian restaurant now offers a weekday lunch menu for $12",
  "Free webinar for small business owners on getting started with email marketing",
];

export function EmptyState({ onExample }: { onExample: (text: string) => void }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="mb-4 font-display text-2xl">
          Here&apos;s how it works
        </h2>
        <HowItWorksDemo />
      </section>
      <section aria-labelledby="examples-heading" className="border-t border-line pt-6">
        <h2 id="examples-heading" className="text-sm font-semibold text-ink-2">
          Try it with an example
        </h2>
        <ul className="mt-3 space-y-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onExample(p)}
                className="group flex w-full items-baseline gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left text-sm text-ink-2 transition hover:border-brand-400 hover:text-ink"
              >
                <span className="text-brand-700 transition group-hover:translate-x-0.5" aria-hidden="true">
                  →
                </span>
                {p}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const ERROR_TITLES: Record<ClientErrorCode, string> = {
  NETWORK: "Connection problem",
  RATE_LIMITED: "Slow down a little",
  INVALID_INPUT: "Please check your input",
  MODEL_UNAVAILABLE: "The writer is unavailable",
  MODEL_NOT_FOUND: "That writer was removed",
  TIMEOUT: "That took too long",
  BAD_OUTPUT: "Something got garbled",
  NOT_CONFIGURED: "Not set up yet",
  INTERNAL: "Something went wrong",
};

export function ErrorState({ code, message, onRetry }: { code: ClientErrorCode; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.07] px-6 py-8">
      <div className="flex items-center gap-2 text-red-700">
        <AlertIcon className="size-5" />
        <h2 className="font-display text-xl text-ink">{ERROR_TITLES[code]}</h2>
      </div>
      <p className="mt-2 max-w-md text-sm text-ink-2">{message}</p>
      {code !== "NOT_CONFIGURED" && code !== "INVALID_INPUT" && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          <RefreshIcon className="size-4" />
          Try again
        </button>
      )}
    </div>
  );
}
