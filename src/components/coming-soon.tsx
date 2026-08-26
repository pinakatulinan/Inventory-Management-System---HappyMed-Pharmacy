import { Hammer } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

/**
 * Placeholder for routes that are navigable but not yet built. Keeping the nav
 * complete from the start means the shell can be reviewed as a whole rather
 * than judged one screen at a time.
 */
export function ComingSoon({
  title,
  description,
  phase,
  covers,
}: {
  title: string;
  description: string;
  phase: string;
  covers: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} />

      <div className="rounded-xl border border-dashed bg-card">
        <EmptyState
          icon={<Hammer className="size-5" />}
          title={`Arriving in ${phase}`}
          description="The data model and permissions behind this screen are already in place."
        />

        <div className="mx-auto max-w-md pb-10">
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
            This screen will cover
          </p>
          <ul className="space-y-1.5">
            {covers.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
