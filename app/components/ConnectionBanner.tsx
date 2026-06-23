import { WifiOff } from "lucide-react";

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-100 px-4 py-3 text-sm text-amber-800"
    >
      <WifiOff size={16} aria-hidden className="shrink-0" />
      <span>Verbinding met huis kwijt — opnieuw proberen…</span>
    </div>
  );
}
