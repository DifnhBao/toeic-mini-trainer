-- Published media must survive deletion of the contributor account. System
-- copies have no user owner; upload endpoints still only create owned assets.
ALTER TABLE "uploaded_assets" DROP CONSTRAINT "uploaded_assets_ownerId_fkey";
ALTER TABLE "uploaded_assets" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
