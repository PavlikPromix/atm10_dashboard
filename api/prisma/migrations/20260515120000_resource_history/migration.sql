CREATE TABLE "ResourceCurrent" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "name" TEXT,
  "displayName" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "unit" TEXT,
  "fingerprint" TEXT,
  "nbtHash" TEXT,
  "craftable" BOOLEAN NOT NULL DEFAULT false,
  "lastRate" DOUBLE PRECISION,
  "payload" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceCurrent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceSample" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceSample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CraftPattern" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "outputName" TEXT,
  "displayName" TEXT,
  "outputAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "ingredients" JSONB,
  "payload" JSONB NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CraftPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceCurrent_deviceId_category_resourceKey_key" ON "ResourceCurrent"("deviceId", "category", "resourceKey");
CREATE INDEX "ResourceCurrent_deviceId_category_amount_idx" ON "ResourceCurrent"("deviceId", "category", "amount");
CREATE INDEX "ResourceCurrent_deviceId_category_lastRate_idx" ON "ResourceCurrent"("deviceId", "category", "lastRate");
CREATE INDEX "ResourceCurrent_deviceId_category_displayName_idx" ON "ResourceCurrent"("deviceId", "category", "displayName");

CREATE INDEX "ResourceSample_deviceId_category_resourceKey_createdAt_idx" ON "ResourceSample"("deviceId", "category", "resourceKey", "createdAt");
CREATE INDEX "ResourceSample_deviceId_category_createdAt_idx" ON "ResourceSample"("deviceId", "category", "createdAt");

CREATE UNIQUE INDEX "CraftPattern_deviceId_category_resourceKey_key" ON "CraftPattern"("deviceId", "category", "resourceKey");
CREATE INDEX "CraftPattern_deviceId_category_displayName_idx" ON "CraftPattern"("deviceId", "category", "displayName");

ALTER TABLE "ResourceCurrent" ADD CONSTRAINT "ResourceCurrent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceSample" ADD CONSTRAINT "ResourceSample_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CraftPattern" ADD CONSTRAINT "CraftPattern_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
