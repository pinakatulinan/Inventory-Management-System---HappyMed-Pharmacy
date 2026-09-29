"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Pill, Search, Snowflake, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface PickerProduct {
  id: string;
  sku: string;
  genericName: string;
  brandName: string | null;
  strength: string | null;
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
  isRxOnly: boolean;
  requiresRefrigeration: boolean;
  onHand?: number;
}

/**
 * Filter-as-you-type picker over a list held in memory.
 *
 * A pharmacy catalogue is hundreds of items, not millions, so shipping the list
 * and filtering client-side is far more responsive than a round trip per
 * keystroke to a database in another country. Matching covers brand name,
 * generic name and stock code, because staff search by whichever is on the box.
 */
export function ProductPicker({
  products,
  name = "productId",
  label = "Item",
  defaultProductId,
  onSelect,
  error,
}: {
  products: PickerProduct[];
  name?: string;
  label?: string;
  defaultProductId?: string;
  onSelect?: (product: PickerProduct | null) => void;
  error?: string;
}) {
  const [selected, setSelected] = useState<PickerProduct | null>(
    () => products.find((p) => p.id === defaultProductId) ?? null,
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 12);

    return products
      .filter((p) =>
        [p.brandName, p.genericName, p.sku, p.strength]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [products, query]);

  const choose = (product: PickerProduct) => {
    setSelected(product);
    setQuery("");
    setOpen(false);
    onSelect?.(product);
  };

  const clear = () => {
    setSelected(null);
    setQuery("");
    onSelect?.(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (selected) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <input type="hidden" name={name} value={selected.id} />

        <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              {selected.brandName ?? selected.genericName}
              {selected.isRxOnly ? (
                <span className="rounded bg-status-warning-soft px-1 text-xs font-medium text-status-warning">
                  Rx
                </span>
              ) : null}
              {selected.requiresRefrigeration ? (
                <Snowflake
                  className="size-3.5 text-brand-700"
                  aria-label="Requires refrigeration"
                />
              ) : null}
            </p>
            <p className="truncate text-xs text-brand-800">
              {selected.genericName}
              {selected.strength ? ` · ${selected.strength}` : ""} ·{" "}
              <span className="font-mono">{selected.sku}</span>
              {typeof selected.onHand === "number"
                ? ` · ${selected.onHand} ${selected.baseUnit} on hand`
                : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded p-1 text-brand-800 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Choose a different item</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="product-search">{label}</Label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="product-search"
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          // Blur is delayed so a click on an option lands before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open && matches[highlight]) {
              e.preventDefault();
              choose(matches[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search by brand, generic name or code..."
          className="pl-9"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="product-options"
          aria-invalid={Boolean(error)}
        />

        {open && matches.length > 0 ? (
          <ul
            id="product-options"
            role="listbox"
            className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
          >
            {matches.map((product, index) => (
              <li key={product.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(product)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                    index === highlight
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60",
                  )}
                >
                  <Pill className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {product.brandName ?? product.genericName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {product.genericName}
                      {product.strength ? ` · ${product.strength}` : ""} ·{" "}
                      <span className="font-mono">{product.sku}</span>
                    </span>
                  </span>
                  {typeof product.onHand === "number" ? (
                    <span className="shrink-0 text-xs text-muted-foreground tabular">
                      {product.onHand} {product.baseUnit}
                    </span>
                  ) : null}
                  {index === highlight ? (
                    <Check className="size-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {open && query.trim() && matches.length === 0 ? (
          <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover px-3 py-4 text-center text-sm text-muted-foreground shadow-md">
            No item matches &ldquo;{query.trim()}&rdquo;.
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs font-medium text-status-expired">{error}</p>
      ) : null}
    </div>
  );
}
