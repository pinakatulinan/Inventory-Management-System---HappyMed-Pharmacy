-- Not everything the pharmacy stocks is a medicine. Existing rows are all
-- medicines, so MEDICINE is the default.
CREATE TYPE "ItemType" AS ENUM ('MEDICINE', 'SUPPLEMENT', 'PERSONAL_CARE', 'MEDICAL_SUPPLY', 'OTHER');

ALTER TABLE "Product" ADD COLUMN "itemType" "ItemType" NOT NULL DEFAULT 'MEDICINE';
