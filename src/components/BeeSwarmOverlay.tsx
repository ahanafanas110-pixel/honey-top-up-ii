import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SwarmBee {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  midX: number;
  midY: number;
  scale: number;
  duration: number;
  delay: number;
  angle: number;
}

interface AmbientBee {
  id: number;
  top: string;
  left: string;
  dx: number;
  dy: number;
  duration: number;
  scale: number;
}

function RealisticBeeSvg({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left & Right Translucent Wings */}
      <g className="animate-wing-left">
        <ellipse
          cx="22"
          cy="20"
          rx="12"
          ry="7"
          transform="rotate(-28 22 20)"
          fill="rgba(255,255,255,0.82)"
          stroke="rgba(148,163,184,0.6)"
          strokeWidth="1.2"
        />
        <ellipse
          cx="25"
          cy="25"
          rx="8"
          ry="4.5"
          transform="rotate(-14 25 25)"
          fill="rgba(255,255,255,0.65)"
          stroke="rgba(148,163,184,0.45)"
          strokeWidth="1"
        />
      </g>
      <g className="animate-wing-right">
        <ellipse
          cx="42"
          cy="20"
          rx="12"
          ry="7"
          transform="rotate(28 42 20)"
          fill="rgba(255,255,255,0.82)"
          stroke="rgba(148,163,184,0.6)"
          strokeWidth="1.2"
        />
        <ellipse
          cx="39"
          cy="25"
          rx="8"
          ry="4.5"
          transform="rotate(14 39 25)"
          fill="rgba(255,255,255,0.65)"
          stroke="rgba(148,163,184,0.45)"
          strokeWidth="1"
        />
      </g>

      {/* Stinger */}
      <path d="M32 54 L29 48 L35 48 Z" fill="#1E293B" />

      {/* Striped Golden-Amber Abdomen */}
      <ellipse cx="32" cy="39" rx="10" ry="12" fill="#F59E0B" stroke="#78350F" strokeWidth="1.2" />
      <path d="M23.5 34 Q32 37 40.5 34" stroke="#1E293B" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M22.5 40 Q32 43 41.5 40" stroke="#1E293B" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M25 46 Q32 48.5 39 46" stroke="#1E293B" strokeWidth="2.6" strokeLinecap="round" />

      {/* Fuzzy Thorax */}
      <circle cx="32" cy="27" r="6.5" fill="#92400E" stroke="#451A03" strokeWidth="1" />
      <ellipse cx="32" cy="26" rx="4.5" ry="3.5" fill="#D97706" opacity="0.6" />

      {/* Head & Compound Eyes */}
      <circle cx="32" cy="19" r="5" fill="#1E293B" />
      <ellipse cx="28.5" cy="18.5" rx="1.6" ry="2.2" fill="#0F172A" />
      <ellipse cx="35.5" cy="18.5" rx="1.6" ry="2.2" fill="#0F172A" />
      <circle cx="28" cy="17.8" r="0.6" fill="#FFFFFF" opacity="0.7" />
      <circle cx="35" cy="17.8" r="0.6" fill="#FFFFFF" opacity="0.7" />

      {/* Antennae */}
      <path d="M29.5 14.5 Q26 10 23 11" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M34.5 14.5 Q38 10 41 11" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const AMBIENT_BEES: AmbientBee[] = [
  { id: 1, top: '16%', left: '8%', dx: 120, dy: -45, duration: 9, scale: 0.78 },
  { id: 2, top: '28%', left: '84%', dx: -140, dy: 50, duration: 11, scale: 0.72 },
  { id: 3, top: '62%', left: '12%', dx: 95, dy: -70, duration: 10, scale: 0.68 },
  { id: 4, top: '72%', left: '88%', dx: -110, dy: -55, duration: 12, scale: 0.76 },
];

export function AmbientBeesLayer() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (reducedMotion) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden" aria-hidden="true">
      {AMBIENT_BEES.map((bee) => (
        <motion.div
          key={bee.id}
          className="absolute drop-shadow-sm"
          style={{ top: bee.top, left: bee.left }}
          animate={{
            x: [0, bee.dx, bee.dx * 0.4, 0],
            y: [0, bee.dy, bee.dy * -0.5, 0],
            rotate: [0, bee.dx > 0 ? 18 : -18, bee.dx > 0 ? -12 : 12, 0],
          }}
          transition={{
            duration: bee.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <div style={{ transform: `scale(${bee.scale})` }}>
            <RealisticBeeSvg className="w-9 h-9" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function HoneycombHiveWidget() {
  const [swarmBees, setSwarmBees] = useState<SwarmBee[]>([]);
  const [pulseCount, setPulseCount] = useState(0);

  const triggerBeeSwarm = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const count = 24;
    const newBees: SwarmBee[] = Array.from({ length: count }).map((_, idx) => {
      const angleRad = (Math.PI * 2 * idx) / count + (Math.random() - 0.5) * 0.45;
      const dist = 140 + Math.random() * 260;
      const endX = originX + Math.cos(angleRad) * dist;
      const endY = originY + Math.sin(angleRad) * dist - 60;
      const midX = originX + Math.cos(angleRad + 0.35) * (dist * 0.52);
      const midY = originY + Math.sin(angleRad + 0.35) * (dist * 0.52) - 40;
      return {
        id: `${Date.now()}_${idx}`,
        startX: originX,
        startY: originY,
        midX,
        midY,
        endX,
        endY,
        scale: 0.65 + Math.random() * 0.55,
        duration: 1.4 + Math.random() * 0.9,
        delay: Math.random() * 0.25,
        angle: (angleRad * 180) / Math.PI + 90,
      };
    });

    setPulseCount((c) => c + 1);
    setSwarmBees((prev) => [...prev.slice(-24), ...newBees]);
    setTimeout(() => {
      setSwarmBees((prev) => prev.filter((b) => !newBees.some((nb) => nb.id === b.id)));
    }, 2600);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={triggerBeeSwarm}
        aria-label="Click honeycomb to release honey bees"
        className="group relative flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-br from-amber-100 via-amber-50 to-yellow-100 dark:from-amber-950/80 dark:via-amber-900/50 dark:to-slate-900 border border-amber-300/80 dark:border-amber-700/60 shadow-sm hover:shadow-md active:scale-95 transition-all cursor-pointer"
      >
        <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
          {/* Honeycomb Hex Grid SVG */}
          <svg viewBox="0 0 64 64" className="w-11 h-11 drop-shadow-sm" aria-hidden="true">
            <polygon
              points="20,6 32,13 32,27 20,34 8,27 8,13"
              fill="#F59E0B"
              stroke="#B45309"
              strokeWidth="2"
            />
            <polygon
              points="44,6 56,13 56,27 44,34 32,27 32,13"
              fill="#FBBF24"
              stroke="#B45309"
              strokeWidth="2"
            />
            <polygon
              points="32,27 44,34 44,48 32,55 20,48 20,34"
              fill="#D97706"
              stroke="#92400E"
              strokeWidth="2"
            />
            <circle cx="20" cy="20" r="3" fill="#FEF3C7" opacity="0.6" />
            <circle cx="44" cy="20" r="3" fill="#FEF3C7" opacity="0.6" />
            <path d="M32 55 Q35 61 32 63 Q29 61 32 55 Z" fill="#F59E0B" />
          </svg>
          <div className="absolute -top-2 -right-2 w-6 h-6 animate-bee-hover">
            <RealisticBeeSvg className="w-6 h-6" />
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs font-bold text-amber-950 dark:text-amber-200 leading-tight">
            মধুর চাক · Honey Hive
          </div>
          <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-tight mt-0.5">
            {pulseCount > 0 ? `Swarm released (${pulseCount}x) — Tap again!` : 'Tap to release bees'}
          </div>
        </div>
      </button>

      {/* Swarm Portal Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
        <AnimatePresence>
          {swarmBees.map((bee) => (
            <motion.div
              key={bee.id}
              initial={{
                x: bee.startX - 18,
                y: bee.startY - 18,
                opacity: 0,
                scale: 0.3,
                rotate: bee.angle,
              }}
              animate={{
                x: [bee.startX - 18, bee.midX - 18, bee.endX - 18],
                y: [bee.startY - 18, bee.midY - 18, bee.endY - 18],
                opacity: [0, 1, 1, 0],
                scale: [0.3, bee.scale, bee.scale * 0.9],
                rotate: [bee.angle, bee.angle + 18, bee.angle - 10],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: bee.duration,
                delay: bee.delay,
                ease: 'easeOut',
              }}
              className="absolute top-0 left-0"
            >
              <RealisticBeeSvg className="w-9 h-9 drop-shadow-md" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
