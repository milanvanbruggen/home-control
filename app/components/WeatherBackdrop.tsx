import type { SkyVisual, SkyLayer } from "@/lib/sky-visuals";

// One soft cloud silhouette as a single SVG group (shared fill = one shape, no
// seams): a wide pill gives the flat bottom, with three bumps on top — small on
// the left, a larger one on the right, one in between. Bumps never dip below the pill.
const CLOUD = (
  <svg viewBox="0 0 100 50" width="100%" height="100%" aria-hidden>
    <g fill="currentColor">
      <rect x="6" y="28" width="84" height="18" rx="9" />
      <circle cx="22" cy="31" r="11" />
      <circle cx="45" cy="26" r="14" />
      <circle cx="69" cy="23" r="18" />
    </g>
  </svg>
);

// Parallax cloud layers: far clouds are smaller, blurrier, fainter and drift
// slowly; near clouds are larger, sharper and a touch quicker. All slow + subtle.
// Each cloud gets its own starting offset (left) + an irregular delay so they
// drift scattered and out of sync, not stacked on one track.
const CLOUDS = [
  { top: "4%", left: "54%", w: 90, blur: 1.4, op: 0.5, dur: 115, delay: -37 }, // far — slow, blurry, faint
  { top: "18%", left: "6%", w: 128, blur: 0.6, op: 0.7, dur: 78, delay: -13 }, // mid
  { top: "31%", left: "31%", w: 170, blur: 0, op: 0.88, dur: 48, delay: -29 }, // near — fast, sharp
];

const DROPS = [16, 34, 52, 70, 88, 42];
const DROP_DUR = [1.5, 1.7, 1.4, 1.6, 1.55, 1.65];
const FLAKES = [14, 32, 50, 68, 86, 40];
const FLAKE_DUR = [6.5, 7.2, 6.8, 7.6, 6.4, 7.0];
const STARS = [
  { top: 30, left: 24, dur: 4.6 }, { top: 52, left: 70, dur: 5.4 },
  { top: 22, left: 120, dur: 5.0 }, { top: 64, left: 160, dur: 5.8 },
  { top: 40, left: 200, dur: 4.4 }, { top: 80, left: 48, dur: 5.6 },
  { top: 90, left: 110, dur: 4.8 },
];

export function WeatherBackdrop({ visual }: { visual: SkyVisual }) {
  const has = (l: SkyLayer) => visual.layers.includes(l);
  const toneCls = visual.cloudTone === "grey" ? " grey" : visual.cloudTone === "dark" ? " dark" : "";
  return (
    <>
      <div className="wx-fx" aria-hidden>
        {has("sun") && <div className="wx-sun-glow" />}
        {has("moon") && <div className="wx-moon" />}
        {has("stars") && STARS.map((s, i) => (
          <span key={`st${i}`} className="wx-star" style={{ top: s.top, left: s.left, animationDuration: `${s.dur}s`, animationDelay: `-${i * 0.7}s` }} />
        ))}
        {has("clouds") && CLOUDS.map((c, i) => (
          <span
            key={`cl${i}`}
            className={`wx-cloud${toneCls}`}
            style={{ top: c.top, left: c.left, width: c.w, opacity: c.op, filter: `blur(${c.blur}px)`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          >
            {CLOUD}
          </span>
        ))}
        {has("rain") && DROPS.map((left, i) => (
          <span key={`dr${i}`} className="wx-drop" style={{ left: `${left}%`, animationDuration: `${DROP_DUR[i]}s`, animationDelay: `-${(i * 0.22).toFixed(2)}s` }} />
        ))}
        {has("snow") && FLAKES.map((left, i) => (
          <span key={`fl${i}`} className="wx-flake" style={{ left: `${left}%`, animationDuration: `${FLAKE_DUR[i]}s`, animationDelay: `-${(i * 0.6).toFixed(2)}s` }} />
        ))}
      </div>
      <div className="wx-scrim" aria-hidden />
    </>
  );
}
