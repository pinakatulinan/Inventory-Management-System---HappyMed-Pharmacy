import "dotenv/config";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { receiveStock } from "@/lib/stock";

/**
 * Development seed.
 *
 * Stock is created through `receiveStock`, the same path the application uses,
 * rather than by inserting batches directly. That keeps the ledger, the cached
 * balances and the audit trail genuinely consistent - a seed that bypassed the
 * ledger would produce a database no real workflow could ever have created, and
 * would hide exactly the bugs this seed exists to surface.
 */

const DAY = 86_400_000;

/** A calendar date `offsetDays` from today, at UTC midnight. */
function dateOffset(offsetDays: number): Date {
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(todayUtc + offsetDays * DAY);
}

const CATEGORIES = [
  { name: "Analgesics", description: "Pain relief and fever reduction" },
  { name: "Antibiotics", description: "Bacterial infection treatment" },
  { name: "Antihypertensives", description: "Blood pressure management" },
  { name: "Antihistamines", description: "Allergy relief" },
  { name: "Gastrointestinal", description: "Digestive and stomach medicines" },
  {
    name: "Vitamins and Supplements",
    description: "Nutritional support",
    expiryWarningDays: 120,
  },
  { name: "Topical", description: "Creams, ointments and gels" },
  { name: "Respiratory", description: "Cough, cold and asthma" },
];

const SUPPLIERS = [
  {
    name: "MediSupply Distributors",
    contactPerson: "Rosa Delgado",
    email: "orders@medisupply.example",
    phone: "+63 2 8555 0142",
    address: "12 Warehouse Road, Quezon City",
  },
  {
    name: "PharmaLink Wholesale",
    contactPerson: "Ben Tan",
    email: "sales@pharmalink.example",
    phone: "+63 2 8555 0288",
    address: "Unit 4, Industrial Park, Pasig",
  },
  {
    name: "HealthFirst Trading",
    contactPerson: "Marisol Cruz",
    email: "support@healthfirst.example",
    phone: "+63 917 555 033",
    address: "88 Commerce Street, Makati",
  },
];

interface SeedProduct {
  sku: string;
  genericName: string;
  brandName: string | null;
  strength: string | null;
  dosageForm:
    | "TABLET"
    | "CAPSULE"
    | "SYRUP"
    | "SUSPENSION"
    | "CREAM"
    | "DROPS"
    | "INHALER";
  category: string;
  supplier: string;
  baseUnit: string;
  packUnit: string | null;
  unitsPerPack: number;
  sellingPrice: string;
  reorderPoint: number;
  isRxOnly?: boolean;
  requiresRefrigeration?: boolean;
  /** [lotNumber, expiryOffsetDays, quantity in base units, cost per base unit] */
  batches: [string, number, number, string][];
}

const PRODUCTS: SeedProduct[] = [
  {
    sku: "PAR-500-TAB",
    genericName: "Paracetamol",
    brandName: "Biogesic",
    strength: "500mg",
    dosageForm: "TABLET",
    category: "Analgesics",
    supplier: "MediSupply Distributors",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 100,
    sellingPrice: "3.5000",
    reorderPoint: 200,
    batches: [
      ["PAR2401A", -18, 40, "1.8000"],
      ["PAR2404B", 21, 260, "1.8500"],
      ["PAR2407C", 240, 900, "1.9000"],
    ],
  },
  {
    sku: "IBU-200-TAB",
    genericName: "Ibuprofen",
    brandName: "Advil",
    strength: "200mg",
    dosageForm: "TABLET",
    category: "Analgesics",
    supplier: "PharmaLink Wholesale",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 50,
    sellingPrice: "6.0000",
    reorderPoint: 150,
    batches: [
      ["IBU5512", 12, 85, "3.2000"],
      ["IBU5590", 310, 400, "3.3500"],
    ],
  },
  {
    sku: "MEF-500-CAP",
    genericName: "Mefenamic Acid",
    brandName: "Dolfenal",
    strength: "500mg",
    dosageForm: "CAPSULE",
    category: "Analgesics",
    supplier: "MediSupply Distributors",
    baseUnit: "capsule",
    packUnit: "box",
    unitsPerPack: 30,
    sellingPrice: "12.0000",
    reorderPoint: 90,
    isRxOnly: true,
    batches: [["MEF7781", 64, 120, "7.5000"]],
  },
  {
    sku: "AMX-500-CAP",
    genericName: "Amoxicillin",
    brandName: "Amoxil",
    strength: "500mg",
    dosageForm: "CAPSULE",
    category: "Antibiotics",
    supplier: "PharmaLink Wholesale",
    baseUnit: "capsule",
    packUnit: "box",
    unitsPerPack: 100,
    sellingPrice: "15.0000",
    reorderPoint: 200,
    isRxOnly: true,
    batches: [
      ["AMX9021", -3, 55, "9.0000"],
      ["AMX9188", 27, 180, "9.2500"],
      ["AMX9245", 420, 600, "9.5000"],
    ],
  },
  {
    sku: "AZI-500-TAB",
    genericName: "Azithromycin",
    brandName: "Zithromax",
    strength: "500mg",
    dosageForm: "TABLET",
    category: "Antibiotics",
    supplier: "HealthFirst Trading",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 30,
    sellingPrice: "85.0000",
    reorderPoint: 60,
    isRxOnly: true,
    batches: [["AZI3310", 78, 45, "52.0000"]],
  },
  {
    sku: "AML-5-TAB",
    genericName: "Amlodipine",
    brandName: "Norvasc",
    strength: "5mg",
    dosageForm: "TABLET",
    category: "Antihypertensives",
    supplier: "MediSupply Distributors",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 100,
    sellingPrice: "22.0000",
    reorderPoint: 250,
    isRxOnly: true,
    batches: [
      ["AML1102", 35, 220, "13.0000"],
      ["AML1250", 500, 800, "13.5000"],
    ],
  },
  {
    sku: "LOS-50-TAB",
    genericName: "Losartan Potassium",
    brandName: "Cozaar",
    strength: "50mg",
    dosageForm: "TABLET",
    category: "Antihypertensives",
    supplier: "PharmaLink Wholesale",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 100,
    sellingPrice: "18.0000",
    reorderPoint: 200,
    isRxOnly: true,
    batches: [["LOS4407", 165, 340, "10.5000"]],
  },
  {
    sku: "CET-10-TAB",
    genericName: "Cetirizine",
    brandName: "Zyrtec",
    strength: "10mg",
    dosageForm: "TABLET",
    category: "Antihistamines",
    supplier: "HealthFirst Trading",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 50,
    sellingPrice: "9.0000",
    reorderPoint: 120,
    batches: [
      ["CET2211", 8, 60, "4.7500"],
      ["CET2290", 275, 350, "4.9000"],
    ],
  },
  {
    sku: "LOR-10-TAB",
    genericName: "Loratadine",
    brandName: "Claritin",
    strength: "10mg",
    dosageForm: "TABLET",
    category: "Antihistamines",
    supplier: "HealthFirst Trading",
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: 30,
    sellingPrice: "11.0000",
    reorderPoint: 90,
    // Deliberately low: exercises the reorder alert on the dashboard.
    batches: [["LOR6612", 190, 24, "6.2000"]],
  },
  {
    sku: "OME-20-CAP",
    genericName: "Omeprazole",
    brandName: "Losec",
    strength: "20mg",
    dosageForm: "CAPSULE",
    category: "Gastrointestinal",
    supplier: "MediSupply Distributors",
    baseUnit: "capsule",
    packUnit: "box",
    unitsPerPack: 30,
    sellingPrice: "24.0000",
    reorderPoint: 60,
    isRxOnly: true,
    batches: [["OME8801", 52, 90, "14.0000"]],
  },
  {
    sku: "LOP-2-CAP",
    genericName: "Loperamide",
    brandName: "Imodium",
    strength: "2mg",
    dosageForm: "CAPSULE",
    category: "Gastrointestinal",
    supplier: "PharmaLink Wholesale",
    baseUnit: "capsule",
    packUnit: "box",
    unitsPerPack: 20,
    sellingPrice: "13.0000",
    reorderPoint: 40,
    batches: [["LOP1177", 340, 160, "7.8000"]],
  },
  {
    sku: "ASC-500-TAB",
    genericName: "Ascorbic Acid",
    brandName: "Cecon",
    strength: "500mg",
    dosageForm: "TABLET",
    category: "Vitamins and Supplements",
    supplier: "HealthFirst Trading",
    baseUnit: "tablet",
    packUnit: "bottle",
    unitsPerPack: 100,
    sellingPrice: "5.5000",
    reorderPoint: 300,
    batches: [
      ["ASC0912", 96, 500, "2.4000"],
      ["ASC1050", 610, 700, "2.5000"],
    ],
  },
  {
    sku: "PAR-250-SYR",
    genericName: "Paracetamol",
    brandName: "Tempra Syrup",
    strength: "250mg/5mL",
    dosageForm: "SYRUP",
    category: "Analgesics",
    supplier: "MediSupply Distributors",
    baseUnit: "mL",
    packUnit: "bottle",
    unitsPerPack: 60,
    sellingPrice: "2.2000",
    reorderPoint: 240,
    batches: [
      ["TEM3301", 5, 120, "1.1000"],
      ["TEM3390", 205, 480, "1.1500"],
    ],
  },
  {
    sku: "SAL-100-INH",
    genericName: "Salbutamol",
    brandName: "Ventolin",
    strength: "100mcg",
    dosageForm: "INHALER",
    category: "Respiratory",
    supplier: "PharmaLink Wholesale",
    baseUnit: "inhaler",
    packUnit: null,
    unitsPerPack: 1,
    sellingPrice: "450.0000",
    reorderPoint: 8,
    isRxOnly: true,
    batches: [["SAL5590", 148, 14, "320.0000"]],
  },
  {
    sku: "MUP-2-CRM",
    genericName: "Mupirocin",
    brandName: "Bactroban",
    strength: "2%",
    dosageForm: "CREAM",
    category: "Topical",
    supplier: "HealthFirst Trading",
    baseUnit: "tube",
    packUnit: null,
    unitsPerPack: 1,
    sellingPrice: "290.0000",
    reorderPoint: 10,
    batches: [["MUP2204", 44, 18, "195.0000"]],
  },
  {
    sku: "INS-100-VIA",
    genericName: "Insulin Glargine",
    brandName: "Lantus",
    strength: "100 units/mL",
    dosageForm: "SUSPENSION",
    category: "Antihypertensives",
    supplier: "MediSupply Distributors",
    baseUnit: "vial",
    packUnit: null,
    unitsPerPack: 1,
    sellingPrice: "1850.0000",
    reorderPoint: 4,
    isRxOnly: true,
    requiresRefrigeration: true,
    batches: [["INS7712", 30, 6, "1320.0000"]],
  },
];

async function main() {
  console.log("Seeding HappyMed Pharmacy...\n");

  // --- Settings -----------------------------------------------------------
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
  console.log(`  settings      ${Object.keys(SETTING_DEFAULTS).length} keys`);

  // --- Users --------------------------------------------------------------
  const ownerEmail = (
    process.env.SEED_OWNER_EMAIL ?? "owner@happymed.local"
  ).toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "ChangeMeNow!2026";

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      name: process.env.SEED_OWNER_NAME ?? "Pharmacy Owner",
      passwordHash: await hashPassword(ownerPassword),
      role: "OWNER",
    },
    update: {},
    select: { id: true, email: true },
  });

  const pharmacist = await prisma.user.upsert({
    where: { email: "pharmacist@happymed.local" },
    create: {
      email: "pharmacist@happymed.local",
      name: "Ana Villanueva",
      passwordHash: await hashPassword(ownerPassword),
      role: "PHARMACIST",
    },
    update: {},
    select: { id: true },
  });

  await prisma.user.upsert({
    where: { email: "staff@happymed.local" },
    create: {
      email: "staff@happymed.local",
      name: "Josef Ramos",
      passwordHash: await hashPassword(ownerPassword),
      role: "STAFF",
    },
    update: {},
  });
  console.log("  users         3 (owner, pharmacist, staff)");

  // --- Catalogue ----------------------------------------------------------
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { name: category.name },
      create: category,
      update: {},
      select: { id: true, name: true },
    });
    categoryIds.set(row.name, row.id);
  }
  console.log(`  categories    ${CATEGORIES.length}`);

  const supplierIds = new Map<string, string>();
  for (const supplier of SUPPLIERS) {
    const row = await prisma.supplier.upsert({
      where: { name: supplier.name },
      create: supplier,
      update: {},
      select: { id: true, name: true },
    });
    supplierIds.set(row.name, row.id);
  }
  console.log(`  suppliers     ${SUPPLIERS.length}`);

  // --- Products and stock -------------------------------------------------
  let batchCount = 0;

  for (const product of PRODUCTS) {
    const categoryId = categoryIds.get(product.category);
    const supplierId = supplierIds.get(product.supplier);
    if (!categoryId) throw new Error(`Unknown category ${product.category}`);

    const row = await prisma.product.upsert({
      where: { sku: product.sku },
      create: {
        sku: product.sku,
        genericName: product.genericName,
        brandName: product.brandName,
        strength: product.strength,
        dosageForm: product.dosageForm,
        categoryId,
        supplierId,
        baseUnit: product.baseUnit,
        packUnit: product.packUnit,
        unitsPerPack: product.unitsPerPack,
        sellingPrice: product.sellingPrice,
        reorderPoint: product.reorderPoint,
        isRxOnly: product.isRxOnly ?? false,
        requiresRefrigeration: product.requiresRefrigeration ?? false,
      },
      update: {},
      select: { id: true },
    });

    for (const [lotNumber, offsetDays, quantity, cost] of product.batches) {
      const existing = await prisma.batch.findUnique({
        where: {
          productId_lotNumber: { productId: row.id, lotNumber },
        },
        select: { id: true },
      });
      if (existing) continue;

      await receiveStock({
        productId: row.id,
        lotNumber,
        expiryDate: dateOffset(offsetDays),
        costPerUnit: cost,
        quantity,
        userId: pharmacist.id,
        notes: "Opening stock (seed)",
      });
      batchCount += 1;
    }
  }
  console.log(`  products      ${PRODUCTS.length}`);
  console.log(`  batches       ${batchCount} (received through the ledger)`);

  console.log(`\nSign in as: ${owner.email}`);
  console.log(`Password:   ${ownerPassword}`);
  console.log(
    "\nAlso created: pharmacist@happymed.local and staff@happymed.local (same password).",
  );
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
