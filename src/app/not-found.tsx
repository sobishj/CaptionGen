export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl text-brand-700">404</p>
      <h1 className="mt-3 font-display text-2xl">This page doesn&apos;t exist.</h1>
      <a href="/" className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-on-accent hover:bg-brand-700">
        Back to CaptionGen
      </a>
    </main>
  );
}
