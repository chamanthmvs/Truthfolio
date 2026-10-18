/**
 * Signature background: a faint rising NAV growth-curve — the thing Truthfolio actually
 * analyses — woven behind the hero, plus a soft emerald glow and fine grain for a premium
 * texture. Deliberately low-contrast and non-interactive so it never competes with content
 * or the "plain, honest, readable" USP.
 */
export default function BackgroundMotif() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* soft emerald glow, top-centre */}
      <div
        className="absolute left-1/2 top-[-300px] h-[600px] w-[1200px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(48% 55% at 50% 42%, rgba(14,124,90,0.11), transparent 70%)",
        }}
      />

      {/* rising NAV curve + area fill, anchored to the top band of the page */}
      <svg
        className="absolute inset-x-0 top-0 h-[560px] w-full"
        viewBox="0 0 1440 560"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="nav-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0e7c5a" stopOpacity="0.10" />
            <stop offset="1" stopColor="#0e7c5a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nav-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0e7c5a" stopOpacity="0" />
            <stop offset="0.12" stopColor="#0e7c5a" stopOpacity="0.28" />
            <stop offset="0.75" stopColor="#13a06f" stopOpacity="0.42" />
            <stop offset="1" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* area under the curve */}
        <path
          d="M0,470 C150,452 240,486 360,440 C480,394 560,420 680,356 C800,292 900,322 1040,260 C1160,206 1300,224 1440,168 L1440,560 L0,560 Z"
          fill="url(#nav-area)"
        />
        {/* the growth line */}
        <path
          d="M0,470 C150,452 240,486 360,440 C480,394 560,420 680,356 C800,292 900,322 1040,260 C1160,206 1300,224 1440,168"
          stroke="url(#nav-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* a fainter second curve for depth */}
        <path
          d="M0,520 C180,508 260,528 420,492 C600,452 700,470 860,418 C1020,366 1180,382 1440,320"
          stroke="#0e7c5a"
          strokeOpacity="0.08"
          strokeWidth="1.5"
        />
      </svg>

      {/* fine grain for premium texture */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
