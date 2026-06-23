export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div role="status" className="rounded-xl bg-amber-900/60 px-4 py-2 text-center text-sm text-amber-100">
      Verbinding met huis kwijt — opnieuw proberen…
    </div>
  );
}
