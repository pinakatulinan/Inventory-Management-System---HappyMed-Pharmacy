"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Search that lives in the URL, so a filtered list can be bookmarked, shared and
 * survives a refresh. Debounced, because every keystroke would otherwise be a
 * round trip to Singapore.
 */
export function SearchInput({
  placeholder = "Search...",
  paramName = "q",
  className,
  debounceMs = 300,
}: {
  placeholder?: string;
  paramName?: string;
  className?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlValue = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(urlValue);
  const [syncedFrom, setSyncedFrom] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep in step when the URL changes from elsewhere (back button, a reset
  // link). Adjusting state during render rather than in an effect is React's
  // documented pattern for this, and avoids a second render pass on every
  // keystroke-driven URL update.
  if (urlValue !== syncedFrom) {
    setSyncedFrom(urlValue);
    setValue(urlValue);
  }

  const push = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(paramName, next);
    else params.delete(paramName);
    // Any change to the query resets paging; page 3 of the old result set is
    // meaningless against a new one.
    params.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const onChange = (next: string) => {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), debounceMs);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("pl-9", value && "pr-9", isPending && "opacity-70")}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            clearTimeout(timer.current);
            setValue("");
            push("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
          <span className="sr-only">Clear search</span>
        </button>
      ) : null}
    </div>
  );
}
