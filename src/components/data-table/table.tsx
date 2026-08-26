import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Thin table primitives. Deliberately plain markup rather than a headless table
 * library: every list in this app is server-rendered and server-paginated, so
 * there is no client-side sorting state worth the extra dependency.
 */

export function DataTable({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    // Wide tables scroll inside their own container so the page body never does.
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-xs font-medium text-muted-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b">{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y">{children}</tbody>;
}

export function Tr({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("hover:bg-accent/40", className)}>{children}</tr>
  );
}

/**
 * Page links that preserve every other query parameter, so paging does not
 * silently drop the search term or status filter the user set.
 */
export function Pagination({
  page,
  pageSize,
  total,
  searchParams,
  basePath,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const linkClass =
    "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const disabledClass =
    "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-50";

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t px-4 py-3"
    >
      <p className="text-xs text-muted-foreground tabular">
        Showing {from}-{to} of {total}
      </p>

      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className={linkClass} rel="prev">
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled>
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </span>
        )}

        <span className="text-xs text-muted-foreground tabular">
          Page {page} of {totalPages}
        </span>

        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className={linkClass} rel="next">
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled>
            Next
            <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

/** Consistent card wrapper for a list screen. */
export function TableCard({
  children,
  toolbar,
}: {
  children: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      {toolbar ? (
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {toolbar}
        </div>
      ) : null}
      {children}
    </div>
  );
}
