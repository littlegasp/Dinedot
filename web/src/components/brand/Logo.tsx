import { cn } from "@/lib/utils";

/**
 * DineOS mark: an original geometric "D" — a straight stem and a half-ring drawn as one
 * continuous stroke, with a coral dot inside (a plate seen from above / a live order).
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--ink)" />
      <path d="M13 10.5v19h6.5a9.5 9.5 0 0 0 0-19H13Z" fill="none" stroke="var(--surface)" strokeWidth="3.6" strokeLinejoin="round" />
      <circle cx="19.6" cy="20" r="3.4" fill="var(--coral)" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-[19px] font-extrabold tracking-tight text-fg">
          Dine<span className="text-coral-strong">OS</span>
        </span>
      )}
    </span>
  );
}
