"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Power } from "lucide-react";

import {
  createSupplierAction,
  setSupplierActiveAction,
  updateSupplierAction,
} from "@/app/(app)/suppliers/actions";
import { Field, FormError, SubmitButton } from "@/components/form/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/form/use-action";

export interface SupplierValues {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

function SupplierFields({
  supplier,
  fieldError,
}: {
  supplier?: SupplierValues;
  fieldError: (name: string) => string | undefined;
}) {
  return (
    <div className="space-y-4 py-4">
      <Field name="name" label="Supplier name" required error={fieldError("name")}>
        {(props) => <Input {...props} defaultValue={supplier?.name} required />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="contactPerson"
          label="Contact person"
          error={fieldError("contactPerson")}
        >
          {(props) => (
            <Input {...props} defaultValue={supplier?.contactPerson ?? ""} />
          )}
        </Field>

        <Field name="phone" label="Phone" error={fieldError("phone")}>
          {(props) => <Input {...props} defaultValue={supplier?.phone ?? ""} />}
        </Field>
      </div>

      <Field name="email" label="Email" error={fieldError("email")}>
        {(props) => (
          <Input {...props} type="email" defaultValue={supplier?.email ?? ""} />
        )}
      </Field>

      <Field name="address" label="Address" error={fieldError("address")}>
        {(props) => (
          <Textarea {...props} rows={2} defaultValue={supplier?.address ?? ""} />
        )}
      </Field>

      <Field
        name="notes"
        label="Notes"
        error={fieldError("notes")}
        hint="Delivery days, minimum order, anything worth remembering."
      >
        {(props) => (
          <Textarea {...props} rows={2} defaultValue={supplier?.notes ?? ""} />
        )}
      </Field>
    </div>
  );
}

export function CreateSupplierDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useAction(createSupplierAction, {
    onSuccess: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Add supplier
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Add a supplier</DialogTitle>
            <DialogDescription>
              Only the name is required. The rest can be filled in later.
            </DialogDescription>
          </DialogHeader>

          <SupplierFields
            fieldError={(n) => (state.ok ? undefined : state.fieldErrors?.[n])}
          />

          {!state.ok ? <FormError message={state.error} /> : null}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Add supplier</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSupplierDialog({
  supplier,
  onClose,
}: {
  supplier: SupplierValues;
  onClose: () => void;
}) {
  const [state, formAction] = useAction(updateSupplierAction, {
    onSuccess: onClose,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction}>
          <input type="hidden" name="id" value={supplier.id} />

          <DialogHeader>
            <DialogTitle>Edit {supplier.name}</DialogTitle>
            <DialogDescription>
              Changes are recorded in the audit log.
            </DialogDescription>
          </DialogHeader>

          <SupplierFields
            supplier={supplier}
            fieldError={(n) => (state.ok ? undefined : state.fieldErrors?.[n])}
          />

          {!state.ok ? <FormError message={state.error} /> : null}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton>Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleSupplierDialog({
  supplier,
  isActive,
  productCount,
  onClose,
}: {
  supplier: SupplierValues;
  isActive: boolean;
  productCount: number;
  onClose: () => void;
}) {
  const [state, formAction] = useAction(setSupplierActiveAction, {
    onSuccess: onClose,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="isActive" value={String(!isActive)} />

          <DialogHeader>
            <DialogTitle>
              {isActive ? `Deactivate ${supplier.name}?` : `Reactivate ${supplier.name}?`}
            </DialogTitle>
            <DialogDescription>
              {isActive
                ? `They will stop appearing when choosing a supplier. Their ${productCount} product(s), past deliveries and purchase orders are kept.`
                : "They will appear again when choosing a supplier."}
            </DialogDescription>
          </DialogHeader>

          {!state.ok ? (
            <div className="py-4">
              <FormError message={state.error} />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton variant={isActive ? "destructive" : "default"}>
              {isActive ? "Deactivate" : "Reactivate"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierRowActions({
  supplier,
  isActive,
  productCount,
}: {
  supplier: SupplierValues;
  isActive: boolean;
  productCount: number;
}) {
  const [dialog, setDialog] = useState<"edit" | "toggle" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal aria-hidden />
            <span className="sr-only">Actions for {supplier.name}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDialog("toggle")}
            variant={isActive ? "destructive" : "default"}
          >
            <Power aria-hidden />
            {isActive ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" ? (
        <EditSupplierDialog supplier={supplier} onClose={() => setDialog(null)} />
      ) : null}

      {dialog === "toggle" ? (
        <ToggleSupplierDialog
          supplier={supplier}
          isActive={isActive}
          productCount={productCount}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
