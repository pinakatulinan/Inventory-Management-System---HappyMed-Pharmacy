/**
 * Clears demo data and leaves exactly one worked example of each record type,
 * so there is a template to copy when entering real stock.
 *
 * Stock is created through `receiveStock`, never by inserting a Batch directly.
 * A hand-inserted batch would have a quantityOnHand that no StockMovement
 * accounts for, and `findLedgerDiscrepancies` would report drift forever after.
 *
 * Settings and the OWNER account are deliberately preserved: the first is
 * configuration rather than data, the second is how you get back in.
 *
 * Destructive. Requires --yes.
 */
import "dotenv/config";

import { prisma } from "@/lib/db";
import { receiveStock } from "@/lib/stock";

const DAY = 86_400_000;

function dateOffset(days: number): Date {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) + days * DAY,
  );
}

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("Refusing to run without --yes. This deletes all stock data.");
    process.exit(1);
  }

  const owner = await prisma.user.findFirst({
    where: { role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new Error("No active OWNER account; refusing to wipe.");

  console.log(`Owner preserved: ${owner.email}`);

  // Child-to-parent, so no foreign key is ever left dangling.
  const wiped = {
    sessions: (await prisma.session.deleteMany()).count,
    auditLogs: (await prisma.auditLog.deleteMany()).count,
    movements: (await prisma.stockMovement.deleteMany()).count,
    batches: (await prisma.batch.deleteMany()).count,
    poItems: (await prisma.purchaseOrderItem.deleteMany()).count,
    purchaseOrders: (await prisma.purchaseOrder.deleteMany()).count,
    products: (await prisma.product.deleteMany()).count,
    suppliers: (await prisma.supplier.deleteMany()).count,
    categories: (await prisma.category.deleteMany()).count,
    otherUsers: (
      await prisma.user.deleteMany({ where: { id: { not: owner.id } } })
    ).count,
  };
  console.table(wiped);

  const category = await prisma.category.create({
    data: {
      name: "Analgesics",
      description: "Pain relief and fever reduction. EXAMPLE - edit or delete.",
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      name: "MediSupply Distributors",
      contactPerson: "Rosa Delgado",
      email: "orders@medisupply.example",
      phone: "+63 2 8555 0142",
      address: "12 Warehouse Road, Quezon City, Metro Manila",
      notes: "EXAMPLE supplier - replace with a real one.",
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: "EXAMPLE-001",
      genericName: "Paracetamol",
      brandName: "Biogesic",
      strength: "500mg",
      dosageForm: "TABLET",
      description:
        "EXAMPLE product showing how a field is filled in. Delete once you have added your own.",
      categoryId: category.id,
      supplierId: supplier.id,
      baseUnit: "tablet",
      packUnit: "box",
      unitsPerPack: 100,
      sellingPrice: "3.5000",
      reorderPoint: 200,
      isRxOnly: false,
      requiresRefrigeration: false,
    },
  });

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: "PO-2026-0001",
      supplierId: supplier.id,
      status: "RECEIVED",
      orderDate: dateOffset(-14),
      expectedDate: dateOffset(-7),
      receivedDate: dateOffset(-7),
      notes: "EXAMPLE purchase order.",
      createdById: owner.id,
      receivedById: owner.id,
      items: {
        create: [
          {
            productId: product.id,
            quantityOrdered: 500,
            quantityReceived: 500,
            unitCost: "1.8000",
          },
        ],
      },
    },
  });

  // Creates the Batch and its matching RECEIPT movement in one transaction.
  const received = await receiveStock({
    productId: product.id,
    lotNumber: "EXAMPLE-LOT-001",
    expiryDate: dateOffset(300),
    costPerUnit: "1.8000",
    quantity: 500,
    userId: owner.id,
    purchaseOrderId: po.id,
    notes: "EXAMPLE batch - 5 boxes of 100 tablets.",
  });

  console.log("\nExample set created:");
  console.table({
    category: category.name,
    supplier: supplier.name,
    product: `${product.genericName} ${product.strength} (${product.sku})`,
    purchaseOrder: po.poNumber,
    batch: `EXAMPLE-LOT-001 - ${received.balanceAfter} tablets`,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
