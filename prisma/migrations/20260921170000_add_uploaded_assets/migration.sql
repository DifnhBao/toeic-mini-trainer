-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('DOCUMENT', 'AUDIO', 'IMAGE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'REJECTED');

-- CreateTable
CREATE TABLE "uploaded_assets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "etag" TEXT,
    "failureCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_assets_objectKey_key" ON "uploaded_assets"("objectKey");

-- CreateIndex
CREATE INDEX "uploaded_assets_ownerId_status_idx" ON "uploaded_assets"("ownerId", "status");

-- CreateIndex
CREATE INDEX "uploaded_assets_createdAt_idx" ON "uploaded_assets"("createdAt");

-- AddForeignKey
ALTER TABLE "uploaded_assets" ADD CONSTRAINT "uploaded_assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
