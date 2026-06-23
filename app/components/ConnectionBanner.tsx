import { WifiOff } from "lucide-react";

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
    >
      <WifiOff size={16} aria-hidden className="shrink-0" />
      <span>Verbinding met huis kwijt — opnieuw proberen…</span>
    </div>
  );
}
