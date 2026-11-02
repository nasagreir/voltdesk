"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-3 py-10">
      <h1 className="font-heading text-xl">Something broke in VoltDesk</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        className="rounded-lg bg-white px-3 py-1.5 text-sm text-black"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}
