CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Device" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "scriptVersion" TEXT,
  "capabilities" JSONB,
  "lastSeenAt" TIMESTAMP(3),
  "online" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Snapshot" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetricPoint" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "category" TEXT,
  "value" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetricPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutocraftRule" (
  "id" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT,
  "target" TEXT,
  "payload" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutocraftRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommandQueue" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "result" TEXT,
  "requestedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "ackedAt" TIMESTAMP(3),
  CONSTRAINT "CommandQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertEvent" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppConfig" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "Snapshot_deviceId_createdAt_idx" ON "Snapshot"("deviceId", "createdAt");
CREATE INDEX "MetricPoint_deviceId_metric_createdAt_idx" ON "MetricPoint"("deviceId", "metric", "createdAt");
CREATE UNIQUE INDEX "AutocraftRule_index_key" ON "AutocraftRule"("index");
CREATE INDEX "CommandQueue_deviceId_status_createdAt_idx" ON "CommandQueue"("deviceId", "status", "createdAt");
CREATE INDEX "AlertEvent_deviceId_createdAt_idx" ON "AlertEvent"("deviceId", "createdAt");

ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommandQueue" ADD CONSTRAINT "CommandQueue_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
