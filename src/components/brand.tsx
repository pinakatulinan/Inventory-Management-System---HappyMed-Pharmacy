import { cn } from "@/lib/utils";

/** Mortar-and-pestle-free, deliberately plain: a cross inside a rounded tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground",
        "size-9",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-5"
        strokeWidth={2.5}
        stroke="currentColor"
        strokeLinecap="round"
      >
        <path d="M12 6v12M6 12h12" />
      </svg>
    </span>
  );
}

export function BrandWordmark({
  pharmacyName = "HappyMed",
  className,
  subtitle = "Pharmacy",
}: {
  pharmacyName?: string;
  subtitle?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {pharmacyName}
        </span>
        {subtitle ? (
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
