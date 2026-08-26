import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}

      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {action}
    </div>
  );
}
