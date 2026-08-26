"use client";

import { useState } from "react";
import {
  Ban,
  CircleCheck,
  MoreHorizontal,
  Scale,
  Trash2,
  Undo2,
} from "lucide-react";

import {
  adjustBatchAction,
  disposeBatchAction,
  returnBatchAction,
  setBatchQuarantineAction,
} from "@/app/(app)/inventory/actions";
import { Field, FormError, SubmitButton } from "@/components/form/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BatchStatus } from "@/generated/prisma/enums";
import { useAction } from "@/components/form/use-action";
import { cn } from "@/lib/utils";

export interface BatchActionTarget {
  id: string;
  lotNumber: string;
  productLabel: string;
  baseUnit: string;
  quantityOnHand: number;
  status: BatchStatus;
  isExpired: boolean;
}

type DialogKind = "adjust" | "dispose" | "return" | "quarantine" | "release";

function AdjustDialog({
  batch,
  close,
}: {
  batch: BatchActionTarget;
  close: () => void;
}) {
  const [state, formAction] = useAction(adjustBatchAction, { onSuccess: close });
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [quantity, setQuantity] = useState(1);


  const projected =
    direction === "increase"
      ? batch.quantityOnHand + quantity
      : batch.quantityOnHand - quantity;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="batchId" value={batch.id} />
          <input type="hidden" name="direction" value={direction} />

          <DialogHeader>
            <DialogTitle>Adjust lot {batch.lotNumber}</DialogTitle>
            <DialogDescription>
              For correcting a physical count. This appends a correction to the
              ledger rather than editing history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["decrease", "increase"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium",
                      direction === d
                        ? "border-primary bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                  >
                    {d === "decrease" ? "Count is lower" : "Count is higher"}
                  </button>
                ))}
              </div>
            </div>

            <Field
              name="quantity"
              label={`Difference (${batch.baseUnit})`}
              required
              error={state.ok ? undefined : state.fieldErrors?.quantity}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Number.parseInt(e.target.value, 10) || 0)
                  }
                  required
                />
              )}
            </Field>

            <p
              className={cn(
                "rounded-md px-3 py-2 text-sm tabular",
                projected < 0
                  ? "bg-status-expired-soft text-status-expired"
                  : "bg-muted text-muted-foreground",
              )}
              aria-live="polite"
            >
              {batch.quantityOnHand} &rarr; <strong>{projected}</strong>{" "}
              {batch.baseUnit}
              {projected < 0 ? " — cannot go below zero" : ""}
            </p>

            <Field
              name="reason"
              label="Reason"
              required
              error={state.ok ? undefined : state.fieldErrors?.reason}
              hint="Recorded permanently against this batch."
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  placeholder="e.g. Physical count found 3 fewer than recorded"
                  required
                />
              )}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton disabled={projected < 0 || quantity < 1}>
              Record adjustment
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisposeDialog({
  batch,
  close,
}: {
  batch: BatchActionTarget;
  close: () => void;
}) {
  const [state, formAction] = useAction(disposeBatchAction, { onSuccess: close });
  const [quantity, setQuantity] = useState(batch.quantityOnHand);


  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="batchId" value={batch.id} />

          <DialogHeader>
            <DialogTitle>Dispose of lot {batch.lotNumber}</DialogTitle>
            <DialogDescription>
              Write off expired or damaged stock. {batch.productLabel} —{" "}
              {batch.quantityOnHand} {batch.baseUnit} on hand.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field
              name="quantity"
              label={`Quantity to dispose (${batch.baseUnit})`}
              required
              error={state.ok ? undefined : state.fieldErrors?.quantity}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={batch.quantityOnHand}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Number.parseInt(e.target.value, 10) || 0)
                  }
                  required
                />
              )}
            </Field>

            <Field
              name="reason"
              label="Reason"
              required
              error={state.ok ? undefined : state.fieldErrors?.reason}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  placeholder="e.g. Expired stock, collected by licensed waste contractor"
                  required
                />
              )}
            </Field>

            <Field
              name="reference"
              label="Disposal reference"
              error={state.ok ? undefined : state.fieldErrors?.reference}
              hint="Certificate or collection note number, if you have one."
            >
              {(props) => <Input {...props} />}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton
              variant="destructive"
              disabled={quantity < 1 || quantity > batch.quantityOnHand}
            >
              Dispose of {quantity}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({
  batch,
  close,
}: {
  batch: BatchActionTarget;
  close: () => void;
}) {
  const [state, formAction] = useAction(returnBatchAction, { onSuccess: close });
  const [quantity, setQuantity] = useState(batch.quantityOnHand);


  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="batchId" value={batch.id} />

          <DialogHeader>
            <DialogTitle>Return lot {batch.lotNumber} to supplier</DialogTitle>
            <DialogDescription>
              For recalls, over-deliveries and near-dated returns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field
              name="quantity"
              label={`Quantity to return (${batch.baseUnit})`}
              required
              error={state.ok ? undefined : state.fieldErrors?.quantity}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={batch.quantityOnHand}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Number.parseInt(e.target.value, 10) || 0)
                  }
                  required
                />
              )}
            </Field>

            <Field
              name="reason"
              label="Reason"
              required
              error={state.ok ? undefined : state.fieldErrors?.reason}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  placeholder="e.g. Manufacturer recall notice R-2026-14"
                  required
                />
              )}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton disabled={quantity < 1}>Record return</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuarantineDialog({
  batch,
  quarantine,
  close,
}: {
  batch: BatchActionTarget;
  quarantine: boolean;
  close: () => void;
}) {
  const [state, formAction] = useAction(setBatchQuarantineAction, { onSuccess: close });


  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="batchId" value={batch.id} />
          <input type="hidden" name="quarantine" value={String(quarantine)} />

          <DialogHeader>
            <DialogTitle>
              {quarantine
                ? `Quarantine lot ${batch.lotNumber}?`
                : `Release lot ${batch.lotNumber}?`}
            </DialogTitle>
            <DialogDescription>
              {quarantine
                ? "Blocks this batch from being dispensed. The stock stays on the shelf and the count is unchanged."
                : "Makes this batch dispensable again."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field
              name="reason"
              label="Reason"
              required
              error={state.ok ? undefined : state.fieldErrors?.reason}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  placeholder={
                    quarantine
                      ? "e.g. Packaging damaged in transit"
                      : "e.g. Supplier confirmed the batch is safe"
                  }
                  required
                />
              )}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton variant={quarantine ? "destructive" : "default"}>
              {quarantine ? "Quarantine" : "Release"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BatchRowActions({
  batch,
  canAdjust,
  canDispose,
}: {
  batch: BatchActionTarget;
  canAdjust: boolean;
  canDispose: boolean;
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const close = () => setDialog(null);

  const isTerminal =
    batch.status === "DISPOSED" || batch.status === "RETURNED";

  if (isTerminal || (!canAdjust && !canDispose)) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal aria-hidden />
            <span className="sr-only">Actions for lot {batch.lotNumber}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {canAdjust ? (
            <DropdownMenuItem onSelect={() => setDialog("adjust")}>
              <Scale aria-hidden />
              Adjust count
            </DropdownMenuItem>
          ) : null}

          {canAdjust && batch.status === "ACTIVE" ? (
            <DropdownMenuItem onSelect={() => setDialog("quarantine")}>
              <Ban aria-hidden />
              Quarantine
            </DropdownMenuItem>
          ) : null}

          {canAdjust && batch.status === "QUARANTINED" && !batch.isExpired ? (
            <DropdownMenuItem onSelect={() => setDialog("release")}>
              <CircleCheck aria-hidden />
              Release for dispensing
            </DropdownMenuItem>
          ) : null}

          {canDispose && batch.quantityOnHand > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("return")}>
                <Undo2 aria-hidden />
                Return to supplier
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setDialog("dispose")}
                variant="destructive"
              >
                <Trash2 aria-hidden />
                Dispose of stock
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "adjust" ? <AdjustDialog batch={batch} close={close} /> : null}
      {dialog === "dispose" ? <DisposeDialog batch={batch} close={close} /> : null}
      {dialog === "return" ? <ReturnDialog batch={batch} close={close} /> : null}
      {dialog === "quarantine" ? (
        <QuarantineDialog batch={batch} quarantine close={close} />
      ) : null}
      {dialog === "release" ? (
        <QuarantineDialog batch={batch} quarantine={false} close={close} />
      ) : null}
    </>
  );
}
