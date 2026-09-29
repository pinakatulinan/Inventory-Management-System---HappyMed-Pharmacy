"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Scale, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  fixCountAction,
  getCountableBatchesAction,
  type CountableBatch,
  type FixCountResult,
} from "@/app/(app)/inventory/fix-count/actions";
import { FormError, SubmitButton } from "@/components/form/form-parts";
import {
  ProductPicker,
  type PickerProduct,
} from "@/components/form/product-picker";
import { useAction } from "@/components/form/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FixCountForm({ products }: { products: PickerProduct[] }) {
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [batches, setBatches] = useState<CountableBatch[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, startLoading] = useTransition();
  const [done, setDone] = useState<FixCountResult | null>(null);
  const [round, setRound] = useState(0);

  const choose = (next: PickerProduct | null) => {
    setProduct(next);
    setBatches([]);
    setCounts({});
    if (!next) return;

    startLoading(async () => {
      const result = await getCountableBatchesAction(next.id);
      if (result.ok && result.data) {
        setBatches(result.data);
        setCounts(
          Object.fromEntries(
            result.data.map((b) => [b.id, String(b.quantityOnHand)]),
          ),
        );
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  };

  const [state, formAction] = useAction<FixCountResult>(fixCountAction, {
    toastOnSuccess: false,
    onSuccess: (data) => {
      if (data) setDone(data);
    },
  });

  const changed = batches.filter(
    (b) => counts[b.id] !== undefined && counts[b.id] !== String(b.quantityOnHand),
  );

  if (done) {
    return (
      <div className="space-y-6 rounded-xl border border-status-ok-border bg-status-ok-soft p-6 text-status-ok">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-8 shrink-0" aria-hidden />
          <div>
            <p className="text-lg font-semibold">
              {done.changes.length === 0 ? "Nothing to change" : "Count fixed"}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm tabular">
              {done.changes.map((c) => (
                <li key={c.lotNumber}>
                  Lot <span className="font-mono">{c.lotNumber}</span>: {c.from} &rarr;{" "}
                  <strong>{c.to}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            size="lg"
            className="h-12 text-base"
            onClick={() => {
              setDone(null);
              setRound((r) => r + 1);
              choose(null);
            }}
          >
            Fix another
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background text-base text-foreground"
          >
            <Link href="/inventory">Back to stock</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="productId" value={product?.id ?? ""} />

      <div className="space-y-6 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <ProductPicker
          key={round}
          products={products}
          name="_product"
          label="1. Which item?"
          onSelect={choose}
        />

        {product ? (
          loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : batches.length === 0 ? (
            <div className="flex items-start gap-2.5 rounded-md border border-status-warning-border bg-status-warning-soft px-3 py-2.5 text-sm text-status-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                There is no stock recorded for this item. To add some, use
                Receive stock.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  2. How many are really on the shelf?
                </p>
                <p className="text-xs text-muted-foreground">
                  Count in {product.baseUnit}. Each row is one batch, matching
                  the expiry date on the box.
                </p>

                <ul className="divide-y rounded-lg border">
                  {batches.map((batch) => (
                    <li
                      key={batch.id}
                      className="flex items-center justify-between gap-3 px-3 py-3"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="font-mono font-medium">{batch.lotNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {batch.expiryDate}
                          {batch.onHold ? " · on hold" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground tabular">
                          System says {batch.quantityOnHand.toLocaleString()}
                        </p>
                      </div>

                      <Input
                        name={`count_${batch.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={counts[batch.id] ?? ""}
                        onChange={(e) =>
                          setCounts((c) => ({ ...c, [batch.id]: e.target.value }))
                        }
                        aria-label={`Real count for lot ${batch.lotNumber}`}
                        className="h-12 w-28 shrink-0 text-center text-lg font-semibold tabular"
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fix-note">Why? (optional)</Label>
                <Textarea
                  id="fix-note"
                  name="note"
                  rows={2}
                  placeholder="For example: broken box, counted wrong last time"
                />
              </div>
            </>
          )
        ) : null}

        {!state.ok ? <FormError message={state.error} /> : null}
      </div>

      <SubmitButton
        pendingLabel="Saving..."
        size="lg"
        className="h-14 w-full text-base"
        disabled={!product || batches.length === 0 || changed.length === 0}
      >
        <Scale aria-hidden />
        {changed.length > 0
          ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}`
          : "Change a number to save"}
      </SubmitButton>
    </form>
  );
}
