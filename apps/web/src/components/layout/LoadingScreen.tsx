'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Home page loading screen.
 *
 * - Top and bottom covers (theme-background) meet at a horizontal gap.
 * - Gap grows from a thin line to 20rem as `progress` animates 0 → 100.
 * - Once loaded, the covers slide fully off the viewport.
 * - Only shown on actual page load — gated by a module-level flag so that
 *   SPA navigation away and back does not retrigger it.
 */

// Module-level gate — persists across re-renders within a single page-load
// session, but resets on a full browser reload (module re-initialization).
let hasShown = false;

// Gap eases linearly from 0rem at 0% progress to MAX_GAP_REM at 100%.
const MAX_GAP_REM = 5;
const EXIT_DURATION_MS = 700;
const INITIAL_RAMP_MS = 1500;
const FINAL_RAMP_MS = 400;
const HOLD_AT_100_MS = 300;
// Dev/testing: force the loader to stay on screen for at least this long so
// the full animation can be observed even on fast connections. Set to 0 to
// disable and let the loader dismiss as soon as the page is ready.
const MIN_DISPLAY_MS = 0;

type Phase = 'loading' | 'exiting' | 'done';

export function LoadingScreen() {
  // `mounted` is true only on the client so hydration renders nothing.
  const [mounted] = useState(() => typeof window !== 'undefined');
  const [phase, setPhase] = useState<Phase>(() => {
    // Skip loader on subsequent mounts (SPA navigations) or when the page is
    // already fully loaded (served from cache / bfcache).
    if (typeof window === 'undefined') return 'loading';
    if (hasShown) return 'done';
    const navEntry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navEntry?.type === 'back_forward' || document.readyState === 'complete') return 'done';
    return 'loading';
  });
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  // Mark as shown on first mount.
  useEffect(() => {
    if (hasShown) return;
    hasShown = true;
  }, []);

  // Drive the progress animation + wait for real page load.
  useEffect(() => {
    if (!mounted || phase !== 'loading') return;

    let cancelled = false;
    const startedAt = performance.now();
    let pageReady = document.readyState === 'complete';
    let finalRampStart: number | null = null;

    // When a minimum display time is set, the 0 → 90 ramp stretches to fill
    // (MIN_DISPLAY_MS - FINAL_RAMP_MS - HOLD_AT_100_MS) so the whole animation
    // takes ~MIN_DISPLAY_MS from mount to exit.
    const rampDuration = Math.max(
      INITIAL_RAMP_MS,
      MIN_DISPLAY_MS - FINAL_RAMP_MS - HOLD_AT_100_MS,
    );

    const onLoad = () => {
      pageReady = true;
    };
    if (!pageReady) {
      window.addEventListener('load', onLoad, { once: true });
    }

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startedAt;
      const minElapsed = elapsed >= MIN_DISPLAY_MS - FINAL_RAMP_MS - HOLD_AT_100_MS;

      let next: number;
      if (!pageReady || !minElapsed) {
        // Ramp 0 → 90 over rampDuration, then hold at 90 until both
        // pageReady and the minimum display time have been satisfied.
        const t = Math.min(elapsed / rampDuration, 1);
        next = easeOut(t) * 90;
      } else {
        // Gate cleared — finish 90 → 100.
        if (finalRampStart === null) finalRampStart = now;
        const t = Math.min((now - finalRampStart) / FINAL_RAMP_MS, 1);
        next = 90 + easeOut(t) * 10;
        if (t >= 1) {
          setProgress(100);
          const holdId = window.setTimeout(() => {
            setPhase('exiting');
          }, HOLD_AT_100_MS);
          timeoutsRef.current.push(holdId);
          return;
        }
      }

      setProgress(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('load', onLoad);
    };
  }, [mounted, phase]);

  // After the exit animation finishes, unmount.
  useEffect(() => {
    if (phase !== 'exiting') return;
    const id = window.setTimeout(() => setPhase('done'), EXIT_DURATION_MS);
    timeoutsRef.current.push(id);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Lock body scroll while visible.
  useEffect(() => {
    if (phase === 'done') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Cleanup any lingering timeouts on unmount.
  useEffect(() => {
    const ref = timeoutsRef.current;
    return () => {
      ref.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Render nothing on the server and on the client's first render pass so
  // hydration matches. The `mounted` flag flips to true inside an effect,
  // which runs only on the client after hydration.
  if (!mounted || phase === 'done') return null;
  if (typeof document === 'undefined') return null;

  const pct = Math.round(progress);
  const exiting = phase === 'exiting';

  // Gap grows 0 → MAX_GAP_REM linearly with progress; after 100% the covers
  // slide off screen entirely.
  const gapRem = (progress / 100) * MAX_GAP_REM;
  const coverHeight = `calc(50% - ${gapRem}rem / 2)`;

  const coverTransition = `height 120ms linear, transform ${EXIT_DURATION_MS}ms cubic-bezier(0.76, 0, 0.24, 1)`;

  return createPortal(
    <div
      aria-hidden={exiting}
      aria-busy={!exiting}
      className="fixed inset-0 z-[9999] pointer-events-none"
    >
      {/* Top cover */}
      <div
        className="absolute left-0 right-0 top-0 overflow-hidden pointer-events-auto"
        style={{
          height: coverHeight,
          background: 'var(--background)',
          transform: exiting ? 'translateY(-100%)' : 'translateY(0)',
          transition: coverTransition,
          willChange: 'transform, height',
        }}
      >
        {/* Header row pinned to the bottom edge of the top cover (just above the gap) */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-6 md:px-10 pb-4 md:pb-5"
          style={{ color: 'var(--foreground)' }}
        >
          {/* Logo — inline SVG, inherits currentColor */}
          <svg
            width="72"
            height="27"
            viewBox="0 0 72 27"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Warehaus"
            className="h-6 w-auto md:h-7"
          >
            <path
              d="M22.5913 5.43494C23.7124 5.43494 24.6214 6.34321 24.6216 7.46423V24.7777C24.6216 25.8989 23.7125 26.808 22.5913 26.808H17.2095C16.0884 26.8079 15.1792 25.8988 15.1792 24.7777V7.46423C15.1794 6.34327 16.0885 5.43504 17.2095 5.43494H22.5913ZM52.688 5.43494C53.8091 5.43494 54.7181 6.34321 54.7183 7.46423V24.7777C54.7182 25.8989 53.8091 26.808 52.688 26.808H47.3062C46.1851 26.8078 45.2759 25.8988 45.2759 24.7777V7.46423C45.2761 6.3433 46.1852 5.43508 47.3062 5.43494H52.688ZM7.83838 0.0911865C8.95953 0.0912223 9.86865 1.0003 9.86865 2.12146V19.434C9.86865 20.5551 8.95953 21.4642 7.83838 21.4642H2.45654C1.33537 21.4642 0.42627 20.5551 0.42627 19.434V2.12146C0.42627 1.00028 1.33537 0.0911865 2.45654 0.0911865H7.83838ZM37.9351 0.0911865C39.0562 0.0911865 39.9653 1.00028 39.9653 2.12146V19.434C39.9653 20.5551 39.0562 21.4642 37.9351 21.4642H32.5532C31.432 21.4642 30.5229 20.5551 30.5229 19.434V2.12146C30.5229 1.00028 31.432 0.0911865 32.5532 0.0911865H37.9351ZM68.6216 0.0911865C69.7428 0.0911865 70.6519 1.00028 70.6519 2.12146V19.434C70.6519 20.5551 69.7428 21.4642 68.6216 21.4642H63.2397C62.1187 21.4641 61.2104 20.555 61.2104 19.434V2.12146C61.2104 1.00038 62.1187 0.0913491 63.2397 0.0911865H68.6216Z"
              fill="currentColor"
            />
          </svg>

          {/* Load progress */}
          <div className="flex items-baseline gap-2 md:gap-3 font-display italic font-black tracking-tight">
            <span className="text-[10px] md:text-xs tracking-[0.2em] uppercase opacity-80">
              Diving in…
            </span>
            <span
              className="text-3xl md:text-5xl tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {pct}%
            </span>
          </div>
        </div>
      </div>

      {/* Bottom cover */}
      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-auto"
        style={{
          height: coverHeight,
          background: 'var(--background)',
          transform: exiting ? 'translateY(100%)' : 'translateY(0)',
          transition: coverTransition,
          willChange: 'transform, height',
        }}
      />
    </div>,
    document.body,
  );
}
