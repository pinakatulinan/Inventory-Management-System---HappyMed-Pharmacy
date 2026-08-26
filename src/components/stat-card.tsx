import Link from "next/link";

import { cn } from "@/lib/utils";

export type StatTone = "default" | "expired" | "critical" | "warning" | "ok";

const TONE_STYLES: Record<
  StatTone,
  { value: string; accent: string; ring: string }
> = {
  default: {
    value: "text-foreground",
    accent: "bg-muted text-muted-foreground",
    ring: "",
  },
  expired: {
    value: "text-status-expired",
    accent: "bg-status-expired-soft text-status-expired",
    ring: "ring-1 ring-status-expired-border",
  },
  critical: {
    value: "text-status-critical",
    accent: "bg-status-critical-soft text-status-critical",
    ring: "ring-1 ring-status-critical-border",
  },
  warning: {
    value: "text-status-warning",
    accent: "bg-status-warning-soft text-status-warning",
    ring: "ring-1 ring-status-warning-border",
  },
  ok: {
    value: "text-status-ok",
    accent: "bg-status-ok-soft text-status-ok",
    ring: "",
  },
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
  href?: string;
}) {
  const styles = TONE_STYLES[tone];

  const content = (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-5 shadow-xs transition-colors",
        styles.ring,
        href && "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              styles.accent,
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-3 text-3xl font-semibold tracking-tight tabular",
          styles.value,
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  );
}
