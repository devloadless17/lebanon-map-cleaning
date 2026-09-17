import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-ink-muted">
          That page does not exist.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white"
        >
          Back to today
        </Link>
      </div>
    </main>
  );
}
