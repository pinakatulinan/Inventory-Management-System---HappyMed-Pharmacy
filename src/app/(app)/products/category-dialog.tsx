"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";

import { createCategoryAction } from "@/app/(app)/products/actions";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/form/use-action";

export function CategoryDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useAction(createCategoryAction, {
    onSuccess: () => setOpen(false),
  });

  const err = (n: string) => (state.ok ? undefined : state.fieldErrors?.[n]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus aria-hidden />
          New category
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Add a category</DialogTitle>
            <DialogDescription>
              Categories group products for filtering and reporting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field name="name" label="Name" required error={err("name")}>
              {(props) => <Input {...props} required />}
            </Field>

            <Field name="description" label="Description" error={err("description")}>
              {(props) => <Textarea {...props} rows={2} />}
            </Field>

            <Field
              name="expiryWarningDays"
              label="Expiry warning override (days)"
              error={err("expiryWarningDays")}
              hint="Leave blank to use the pharmacy-wide setting. Useful for short-dated goods."
            >
              {(props) => <Input {...props} type="number" min={1} max={3650} />}
            </Field>

            {!state.ok ? <FormError message={state.error} /> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Add category</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
