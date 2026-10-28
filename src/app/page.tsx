import { CaptionGenerator } from "@/components/CaptionGenerator";
import { LogoMark } from "@/components/icons";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="font-display text-xl tracking-tight">CaptionGen</span>
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-12 sm:px-6 sm:pt-14">
        <div className="mb-10 max-w-2xl">
          <h1 className="font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl">
            Write the post.
            <br />
            <span className="text-brand-700 italic">Skip the blank page.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">
            Tell us what you&apos;re posting about. You&apos;ll get a few caption drafts with hashtags for Instagram,
            LinkedIn or Facebook, ready to copy and tweak.
          </p>
        </div>
        <CaptionGenerator />
      </main>

      <footer className="border-t border-line/70 py-5 text-center text-xs text-muted">
        CaptionGen · Drafts are written by AI. Give them a read before you post.
      </footer>
    </div>
  );
}
