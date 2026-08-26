"use client";

import { useState } from "react";
import { Ban, PackageCheck, Send } from "lucide-react";

import {
  receiveAgainstOrderAction,
  setPurchaseOrderStatusAction,
} from "@/app/(app)/purchase-orders/actions";
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
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/form/use-action";

export function OrderStatusButton({
  orderId,
  status,
  label,
  icon,
  variant,
  confirmTitle,
  confirmBody,
}: {
  orderId: string;
  status: "SUBMITTED" | "CANCELLED" | "DRAFT";
  label: string;
  icon: "send" | "cancel";
  variant?: "default" | "outline" | "destructive";
  confirmTitle: string;
  confirmBody: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useAction(setPurchaseOrderStatusAction, {
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {icon === "send" ? <Send aria-hidden /> : <Ban aria-hidden />}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={formAction}>
            <input type="hidden" name="id" value={orderId} />
            <input type="hidden" name="status" value={status} />

            <DialogHeader>
              <DialogTitle>{confirmTitle}</DialogTitle>
              <DialogDescription>{confirmBody}</DialogDescription>
            </DialogHeader>

            {!state.ok ? (
              <div className="py-4">
                <FormError message={state.error} />
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton variant={variant === "destructive" ? "destructive" : "default"}>
                {label}
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReceiveLineButton({
  purchaseOrderId,
  itemId,
  productLabel,
  baseUnit,
  outstanding,
  defaultUnitCost,
}: {
  purchaseOrderId: string;
  itemId: string;
  productLabel: string;
  baseUnit: string;
  outstanding: number;
  defaultUnitCost: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useAction(receiveAgainstOrderAction, {
    onSuccess: () => setOpen(false),
  });

  const err = (n: string) => (state.ok ? undefined : state.fieldErrors?.[n]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PackageCheck aria-hidden />
        Receive
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={formAction}>
            <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
            <input type="hidden" name="itemId" value={itemId} />

            <DialogHeader>
              <DialogTitle>Receive {productLabel}</DialogTitle>
              <DialogDescription>
                {outstanding} {baseUnit} still outstanding on this line. Record
                the lot number and expiry date from the carton that arrived.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="lotNumber"
                  label="Lot number"
                  required
                  error={err("lotNumber")}
                >
                  {(props) => (
                    <Input {...props} className="font-mono" autoComplete="off" required />
                  )}
                </Field>

                <Field
                  name="expiryDate"
                  label="Expiry date"
                  required
                  error={err("expiryDate")}
                >
                  {(props) => <Input {...props} type="date" required />}
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="quantity"
                  label={`Quantity (${baseUnit})`}
                  required
                  error={err("quantity")}
                  hint="A part delivery is fine; the balance stays outstanding."
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={1}
                      defaultValue={outstanding > 0 ? outstanding : 1}
                      required
                    />
                  )}
                </Field>

                <Field
                  name="unitCost"
                  label={`Actual cost per ${baseUnit}`}
                  required
                  error={err("unitCost")}
                  hint="Correct it here if the invoice differs from the order."
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      step="0.0001"
                      min={0}
                      defaultValue={defaultUnitCost}
                      required
                    />
                  )}
                </Field>
              </div>

              {!state.ok ? <FormError message={state.error} /> : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pendingLabel="Receiving...">Record delivery</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
