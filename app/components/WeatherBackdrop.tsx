import type { SkyVisual, SkyLayer } from "@/lib/sky-visuals";

const RAYS = (
  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
    <g stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round">
      <line x1="50" y1="8" x2="50" y2="22" /><line x1="50" y1="78" x2="50" y2="92" />
      <line x1="8" y1="50" x2="22" y2="50" /><line x1="78" y1="50" x2="92" y2="50" />
      <line x1="20" y1="20" x2="30" y2="30" /><line x1="70" y1="70" x2="80" y2="80" />
      <line x1="80" y1="20" x2="70" y2="30" /><line x1="30" y1="70" x2="20" y2="80" />
    </g>
  </svg>
);

const DROPS = [14, 28, 42, 56, 70, 84, 36, 64];
const DROP_DUR = [1.0, 1.2, 0.9, 1.1, 1.0, 1.25, 1.15, 0.95];
const FLAKES = [12, 26, 40, 54, 68, 82, 33, 61];
const FLAKE_DUR = [4.2, 5.0, 4.6, 5.4, 4.4, 5.2, 4.8, 5.6];
const STARS = [
  { top: 30, left: 24, dur: 3.2 }, { top: 52, left: 70, dur: 4.0 },
  { top: 22, left: 120, dur: 3.6 }, { top: 64, left: 160, dur: 4.4 },
  { top: 40, left: 200, dur: 3.0 }, { top: 80, left: 48, dur: 4.2 },
  { top: 90, left: 110, dur: 3.4 },
];

export function WeatherBackdrop({ visual }: { visual: SkyVisual }) {
  const has = (l: SkyLayer) => visual.layers.includes(l);
  const cloudCls = `wx-cloud${visual.cloudTone === "grey" ? " grey" : visual.cloudTone === "dark" ? " dark" : ""}`;
  return (
    <>
      <div className="wx-fx" aria-hidden>
        {has("sun") && (
          <>
            <div className="wx-rays">{RAYS}</div>
            <div className="wx-sun-glow" />
          </>
        )}
        {has("moon") && <div className="wx-moon" />}
        {has("stars") && STARS.map((s, i) => (
          <span key={`st${i}`} className="wx-star" style={{ top: s.top, left: s.left, animationDuration: `${s.dur}s`, animationDelay: `-${i * 0.5}s` }} />
        ))}
        {has("clouds") && (
          <>
            <span className={cloudCls} style={{ top: 26, left: 0, animationDuration: "30s" }} />
            <span className={cloudCls} style={{ top: 58, left: 0, transform: "scale(1.1)", animationDuration: "40s", animationDelay: "-14s" }} />
            <span className={cloudCls} style={{ top: 88, left: 0, transform: "scale(0.78)", opacity: 0.75, animationDuration: "48s", animationDelay: "-26s" }} />
          </>
        )}
        {has("rain") && DROPS.map((left, i) => (
          <span key={`dr${i}`} className="wx-drop" style={{ left: `${left}%`, animationDuration: `${DROP_DUR[i]}s`, animationDelay: `-${(i * 0.13).toFixed(2)}s` }} />
        ))}
        {has("snow") && FLAKES.map((left, i) => (
          <span key={`fl${i}`} className="wx-flake" style={{ left: `${left}%`, animationDuration: `${FLAKE_DUR[i]}s`, animationDelay: `-${(i * 0.4).toFixed(2)}s` }} />
        ))}
      </div>
      <div className="wx-scrim" aria-hidden />
    </>
  );
}
