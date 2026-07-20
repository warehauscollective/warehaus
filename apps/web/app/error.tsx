'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
      <p className="text-sm text-gray-400 max-w-md">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="mt-2 px-6 py-2 text-sm font-bold rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors border border-white/15"
      >
        Try again
      </button>
    </div>
  );
}
