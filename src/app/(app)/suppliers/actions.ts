"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actionError,
  actionOk,
  fieldErrorsFrom,
  toActionError,
  type ActionResult,
} from "@/lib/actions";
import { diffFields, recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier name.").max(120),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.union([z.email("Enter a valid email address."), z.literal("")]),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

function readSupplier(formData: FormData) {
  return supplierSchema.safeParse({
    name: formData.get("name"),
    contactPerson: formData.get("contactPerson") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

/** Empty strings become NULL so "no email" is one value, not two. */
const nullIfBlank = (value: string | undefined) =>
  value && value.trim() !== "" ? value.trim() : null;

export async function createSupplierAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("supplier.manage");

    const parsed = readSupplier(formData);
    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const created = await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        contactPerson: nullIfBlank(parsed.data.contactPerson),
        email: nullIfBlank(parsed.data.email),
        phone: nullIfBlank(parsed.data.phone),
        address: nullIfBlank(parsed.data.address),
        notes: nullIfBlank(parsed.data.notes),
      },
      select: { id: true, name: true },
    });

    await recordAudit({
      userId: actor.id,
      action: "supplier.create",
      entity: "Supplier",
      entityId: created.id,
      summary: `Added supplier ${created.name}`,
    });

    revalidatePath("/suppliers");
    return actionOk(undefined, `${created.name} added.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSupplierAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("supplier.manage");

    const id = String(formData.get("id") ?? "");
    if (!id) return actionError("Invalid request.");

    const parsed = readSupplier(formData);
    if (!parsed.success) {
      return actionError(
        "Please check the highlighted fields.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const before = await prisma.supplier.findUnique({
      where: { id },
      select: {
        name: true,
        contactPerson: true,
        email: true,
        phone: true,
        address: true,
        notes: true,
      },
    });
    if (!before) return actionError("That supplier no longer exists.");

    const next = {
      name: parsed.data.name,
      contactPerson: nullIfBlank(parsed.data.contactPerson),
      email: nullIfBlank(parsed.data.email),
      phone: nullIfBlank(parsed.data.phone),
      address: nullIfBlank(parsed.data.address),
      notes: nullIfBlank(parsed.data.notes),
    };

    await prisma.supplier.update({ where: { id }, data: next });

    const changes = diffFields(before, next);
    if (Object.keys(changes).length > 0) {
      await recordAudit({
        userId: actor.id,
        action: "supplier.update",
        entity: "Supplier",
        entityId: id,
        summary: `Updated ${next.name} (${Object.keys(changes).join(", ")})`,
        metadata: changes,
      });
    }

    revalidatePath("/suppliers");
    return actionOk(undefined, `${next.name} updated.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function setSupplierActiveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await assertPermission("supplier.manage");

    const id = String(formData.get("id") ?? "");
    const activate = formData.get("isActive") === "true";
    if (!id) return actionError("Invalid request.");

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      select: {
        name: true,
        _count: { select: { products: true } },
      },
    });
    if (!supplier) return actionError("That supplier no longer exists.");

    // Deactivating is a soft delete: products keep pointing at it so batch
    // history and purchase orders stay readable.
    await prisma.supplier.update({
      where: { id },
      data: { isActive: activate },
    });

    await recordAudit({
      userId: actor.id,
      action: activate ? "supplier.activate" : "supplier.deactivate",
      entity: "Supplier",
      entityId: id,
      summary: `${activate ? "Reactivated" : "Deactivated"} supplier ${supplier.name}`,
    });

    revalidatePath("/suppliers");
    return actionOk(
      undefined,
      activate
        ? `${supplier.name} reactivated.`
        : `${supplier.name} deactivated. Its ${supplier._count.products} product(s) keep their history.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
