import "dotenv/config";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import bcrypt from "bcryptjs";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const env = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  deviceId: process.env.DEVICE_ID ?? "atm10-main",
  deviceName: process.env.DEVICE_NAME ?? "ATM10 Main",
  deviceToken: process.env.DEVICE_TOKEN ?? "change-me",
};
const LIVE_DEVICE_WINDOW_MS = 15_000;
const DEVICE_TOUCH_THROTTLE_MS = 5_000;

type ClientSocket = {
  send: (message: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: "message" | "close" | "error", cb: (...args: any[]) => void) => void;
  readyState?: number;
};

type DeviceConnection = {
  deviceId: string;
  socket: ClientSocket;
  authenticated: boolean;
};

const deviceConnections = new Map<string, DeviceConnection>();
const browserClients = new Set<ClientSocket>();
const deviceLastTouchAt = new Map<string, number>();
const resourceSyncInFlight = new Set<string>();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const commandSchema = z.object({
  deviceId: z.string().default(env.deviceId),
  action: z.enum([
    "run_now",
    "set_autocraft_enabled",
    "set_rule_enabled",
    "update_rule",
    "delete_rule",
    "create_rule",
    "update_thresholds",
    "craft_resource",
  ]),
  payload: z.record(z.any()).default({}),
});

const resourceQuerySchema = z.object({
  deviceId: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["amount", "rate", "name"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

const resourceHistoryQuerySchema = z.object({
  deviceId: z.string().optional(),
  category: z.string(),
  key: z.string(),
  range: z.string().optional(),
});

const craftPreviewQuerySchema = z.object({
  deviceId: z.string().optional(),
  category: z.string(),
  key: z.string(),
  amount: z.coerce.number().positive().optional(),
});

const craftResourceSchema = z.object({
  deviceId: z.string().default(env.deviceId),
  category: z.string(),
  key: z.string(),
  amount: z.number().positive(),
});

const configSchema = z.object({
  refreshSeconds: z.number().positive().optional(),
  alarmWarningStorage: z.number().min(0).max(1).optional(),
  alarmCriticalStorage: z.number().min(0).max(1).optional(),
  alarmForecastWarningSeconds: z.number().positive().optional(),
  alarmForecastCriticalSeconds: z.number().positive().optional(),
  alarmCooldownSeconds: z.number().nonnegative().optional(),
  alarmSpeaker: z.boolean().optional(),
  alarmVisual: z.boolean().optional(),
  autocraft: z.record(z.any()).optional(),
});

const defaultRuntimeConfig = {
  refreshSeconds: 1,
  alarmWarningStorage: 0.8,
  alarmCriticalStorage: 0.95,
  alarmForecastWarningSeconds: 30 * 60,
  alarmForecastCriticalSeconds: 5 * 60,
  alarmCooldownSeconds: 30,
  alarmSpeaker: true,
  alarmVisual: true,
  autocraft: {
    enabled: true,
    intervalSeconds: 60,
    maxJobsPerCycle: 3,
    minOutputsPerJob: 64,
    maxOutputsPerJob: 10000000,
    roundTo: 64,
    reservePercent: 0.1,
    reserveMin: 20000,
    reserveMax: 50000,
    perRuleCooldownSeconds: 180,
    rules: [
      { enabled: true, label: "Iron", source: "mysticalagriculture:iron_essence", target: "minecraft:iron_ingot", sourcePerCraft: 8, fixedReserve: 50000, outputPerCraft: 6 },
      { enabled: true, label: "Gold", source: "mysticalagriculture:gold_essence", target: "minecraft:gold_ingot", sourcePerCraft: 8, fixedReserve: 50000, outputPerCraft: 4 },
      { enabled: true, label: "Copper", source: "mysticalagriculture:copper_essence", target: "minecraft:copper_ingot", sourcePerCraft: 8, fixedReserve: 2000, outputPerCraft: 6 },
      { enabled: true, label: "Coal", source: "mysticalagriculture:coal_essence", target: "minecraft:coal", sourcePerCraft: 8, fixedReserve: 20000, outputPerCraft: 12 },
      { enabled: true, label: "Redstone", source: "mysticalagriculture:redstone_essence", target: "minecraft:redstone", sourcePerCraft: 8, fixedReserve: 50000, outputPerCraft: 12 },
      { enabled: true, label: "Lapis", source: "mysticalagriculture:lapis_lazuli_essence", target: "minecraft:lapis_lazuli", sourcePerCraft: 8, fixedReserve: 50000, outputPerCraft: 12 },
      { enabled: true, label: "Diamond", source: "mysticalagriculture:diamond_essence", target: "minecraft:diamond", sourcePerCraft: 9, fixedReserve: 20000, outputPerCraft: 1 },
      { enabled: true, label: "Emerald", source: "mysticalagriculture:emerald_essence", target: "minecraft:emerald", sourcePerCraft: 9, fixedReserve: 5000, outputPerCraft: 1 },
      { enabled: true, label: "Quartz", source: "mysticalagriculture:nether_quartz_essence", target: "minecraft:quartz", sourcePerCraft: 8, fixedReserve: 20000, outputPerCraft: 12 },
      { enabled: true, label: "Glowstone", source: "mysticalagriculture:glowstone_essence", target: "minecraft:glowstone_dust", sourcePerCraft: 8, fixedReserve: 20000, outputPerCraft: 12 },
      { enabled: true, label: "Osmium", source: "mysticalagriculture:osmium_essence", target: "alltheores:osmium_ingot", sourcePerCraft: 8, fixedReserve: 0, outputPerCraft: 4 },
      { enabled: true, label: "Uraninite", source: "mysticalagriculture:uraninite_essence", target: "powah:uraninite", sourcePerCraft: 8, fixedReserve: 0, outputPerCraft: 2 },
      { enabled: false, label: "Tin", source: "mysticalagriculture:tin_essence", target: "alltheores:tin_ingot", sourcePerCraft: 8, fixedReserve: 0, outputPerCraft: 4 },
      { enabled: true, label: "Nickel", source: "mysticalagriculture:nickel_essence", target: "alltheores:nickel_ingot", sourcePerCraft: 2, fixedReserve: 0, outputPerCraft: 1 },
      { enabled: true, label: "Netherite", source: "mysticalagriculture:netherite_essence", target: "minecraft:netherite_ingot", sourcePerCraft: 8, fixedReserve: 0, outputPerCraft: 1 },
    ],
  },
};

function sendJson(socket: ClientSocket, payload: unknown) {
  socket.send(JSON.stringify(payload));
}

function getSocket(connection: unknown): ClientSocket {
  return ((connection as { socket?: ClientSocket }).socket ?? connection) as ClientSocket;
}

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const entries = Object.entries(value);
  if (entries.length === 0) return [];

  if (entries.every(([key]) => /^\d+$/.test(key))) {
    return entries.sort(([a], [b]) => Number(a) - Number(b)).map(([, item]) => item);
  }

  return Object.values(value);
}

const RESOURCE_CATEGORIES = ["Item", "Fluid", "Chemical"] as const;
type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

const categoryMeta: Record<ResourceCategory, { unit: string; craftAction: string }> = {
  Item: { unit: "items", craftAction: "craftItem" },
  Fluid: { unit: "mB", craftAction: "craftFluid" },
  Chemical: { unit: "mB", craftAction: "craftChemical" },
};

type NormalizedResource = {
  category: ResourceCategory;
  resourceKey: string;
  name: string | null;
  displayName: string | null;
  amount: number;
  unit: string;
  fingerprint: string | null;
  nbtHash: string | null;
  payload: Record<string, unknown>;
  craftable: boolean;
};

function normalizeCategory(value: unknown): ResourceCategory | null {
  const text = String(value ?? "");
  return RESOURCE_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase()) ?? null;
}

function scalarString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

function resourceAmount(value: any): number {
  const amount = Number(value?.amount ?? value?.count ?? value?.size ?? value?.quantity ?? value?.qty ?? value?.stored ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function resourceName(value: any): string | null {
  return scalarString(value?.name ?? value?.id ?? value?.fluid ?? value?.chemical ?? value?.resource ?? value?.item);
}

function resourceLabel(value: any, fallback: string | null): string | null {
  return scalarString(value?.displayName ?? value?.label ?? value?.name ?? value?.id ?? fallback);
}

function resourceVariant(value: any): { fingerprint: string | null; nbtHash: string | null } {
  const fingerprint = scalarString(value?.fingerprint ?? value?.fingerPrint);
  const nbtHash = scalarString(value?.nbtHash ?? value?.nbt ?? value?.damage ?? value?.metadata);
  return { fingerprint, nbtHash };
}

function makeResourceKey(name: string | null, fingerprint: string | null, nbtHash: string | null, fallback: string): string {
  const base = name ?? fallback;
  const variant = fingerprint ?? nbtHash;
  return variant ? `${base}#${variant}` : base;
}

function normalizeResourceEntry(entry: any, category: ResourceCategory, unitOverride?: string, craftable = false): NormalizedResource | null {
  if (!entry || typeof entry !== "object") return null;
  const name = resourceName(entry);
  const { fingerprint, nbtHash } = resourceVariant(entry);
  const displayName = resourceLabel(entry, name);
  const fallback = displayName ?? category.toLowerCase();
  const resourceKey = scalarString(entry.key ?? entry.resourceKey) ?? makeResourceKey(name, fingerprint, nbtHash, fallback);
  const amount = resourceAmount(entry);
  const unit = scalarString(entry.unit) ?? unitOverride ?? categoryMeta[category].unit;

  return {
    category,
    resourceKey,
    name,
    displayName,
    amount,
    unit,
    fingerprint,
    nbtHash,
    payload: entry,
    craftable,
  };
}

function normalizeResourceList(list: unknown, category: ResourceCategory, unitOverride?: string, craftable = false): NormalizedResource[] {
  const byKey = new Map<string, NormalizedResource>();

  for (const item of asArray(list)) {
    const normalized = normalizeResourceEntry(item, category, unitOverride, craftable);
    if (!normalized) continue;

    const existing = byKey.get(normalized.resourceKey);
    if (existing) {
      existing.amount += normalized.amount;
      existing.craftable = existing.craftable || normalized.craftable;
      if (!existing.displayName && normalized.displayName) existing.displayName = normalized.displayName;
    } else {
      byKey.set(normalized.resourceKey, normalized);
    }
  }

  return [...byKey.values()];
}

function resourceWhere(deviceId: string, category: string, resourceKey: string) {
  return {
    deviceId_category_resourceKey: {
      deviceId,
      category,
      resourceKey,
    },
  };
}

function stripHeavySnapshotFields(snapshot: any) {
  const cloned = normalizeSnapshot(snapshot);
  for (const storage of cloned.storages ?? []) {
    if (storage && typeof storage === "object") {
      delete storage.list;
      delete storage.resources;
      delete storage.craftables;
      delete storage._hasResourceList;
      delete storage.resourcesFull;
      delete storage.resourcesChanged;
      delete storage.resourceCount;
      delete storage.craftablesFull;
    }
  }
  delete cloned.craftables;
  delete cloned.patterns;
  delete cloned.craftPatterns;
  return cloned;
}

function normalizeSnapshot(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return {};

  return {
    ...snapshot,
    storages: asArray(snapshot.storages).map((storage) => {
      const source = storage && typeof storage === "object" ? storage : {};
      return {
        ...source,
        _hasResourceList: Object.prototype.hasOwnProperty.call(source, "resources") || Object.prototype.hasOwnProperty.call(source, "list"),
        resourcesFull: Boolean((source as any).resourcesFull),
        resourcesChanged: Number((source as any).resourcesChanged ?? 0),
        resourceCount: Number((source as any).resourceCount ?? 0),
        craftablesFull: Boolean((source as any).craftablesFull),
        resources: asArray((source as any).resources ?? (source as any).list),
        craftables: asArray((source as any).craftables),
      };
    }),
    alerts: asArray(snapshot.alerts),
    patterns: asArray(snapshot.patterns ?? snapshot.craftPatterns),
    autocraft: snapshot.autocraft
      ? {
          ...snapshot.autocraft,
          rows: asArray(snapshot.autocraft.rows),
        }
      : snapshot.autocraft,
  };
}

function broadcast(type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload });
  for (const socket of [...browserClients]) {
    try {
      socket.send(message);
    } catch {
      browserClients.delete(socket);
    }
  }
}

async function ensureBootstrapData() {
  if (!env.adminPassword || env.adminPassword === "admin") {
    throw new Error("ADMIN_PASSWORD must be set to a non-default value");
  }

  const admin = await prisma.user.findUnique({ where: { username: env.adminUsername } });
  if (!admin) {
    await prisma.user.create({
      data: {
        username: env.adminUsername,
        passwordHash: await bcrypt.hash(env.adminPassword, 12),
      },
    });
  } else if (!(await bcrypt.compare(env.adminPassword, admin.passwordHash))) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(env.adminPassword, 12) },
    });
  }

  const device = await prisma.device.findUnique({ where: { id: env.deviceId } });
  if (!device) {
    await prisma.device.create({
      data: {
        id: env.deviceId,
        name: env.deviceName,
        tokenHash: await bcrypt.hash(env.deviceToken, 12),
      },
    });
  } else if (!(await bcrypt.compare(env.deviceToken, device.tokenHash))) {
    await prisma.device.update({
      where: { id: env.deviceId },
      data: {
        name: env.deviceName,
        tokenHash: await bcrypt.hash(env.deviceToken, 12),
      },
    });
  }

  await prisma.appConfig.upsert({
    where: { key: "runtime" },
    create: { key: "runtime", value: defaultRuntimeConfig as any, version: 1 },
    update: {},
  });
}

async function getRuntimeConfig() {
  return prisma.appConfig.findUniqueOrThrow({ where: { key: "runtime" } });
}

async function syncAutocraftRules(config: any) {
  const rules = config?.autocraft?.rules;
  if (!Array.isArray(rules)) return;

  await prisma.autocraftRule.deleteMany({});
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i] ?? {};
    await prisma.autocraftRule.create({
      data: {
        index: i + 1,
        label: typeof rule.label === "string" ? rule.label : null,
        enabled: rule.enabled !== false,
        source: typeof rule.source === "string" ? rule.source : null,
        target: typeof rule.target === "string" ? rule.target : null,
        payload: rule,
      },
    });
  }
}

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

function getRangeStart(range: string) {
  const now = Date.now();
  const ranges: Record<string, number> = {
    "5m": 5 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  return new Date(now - (ranges[range] ?? ranges["24h"]));
}

async function pruneOldData() {
  const rawCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const historyCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  await prisma.snapshot.deleteMany({ where: { createdAt: { lt: rawCutoff } } });
  await prisma.metricPoint.deleteMany({ where: { createdAt: { lt: historyCutoff } } });
  await prisma.resourceSample.deleteMany({ where: { createdAt: { lt: historyCutoff } } });
  await prisma.alertEvent.deleteMany({ where: { createdAt: { lt: historyCutoff } } });
}

function getCraftableLists(snapshot: any, category: ResourceCategory, storage: any) {
  const craftables = snapshot?.craftables;
  const byCategory = craftables?.[category] ?? craftables?.[category.toLowerCase()] ?? craftables?.[`${category.toLowerCase()}s`];
  return normalizeResourceList(storage?.craftables?.length ? storage.craftables : byCategory, category, storage?.unit, true);
}

function extractPatternOutput(pattern: any, fallbackCategory?: ResourceCategory): NormalizedResource | null {
  if (!pattern || typeof pattern !== "object") return null;
  const category = normalizeCategory(pattern.category ?? pattern.categoryKey ?? fallbackCategory ?? "Item") ?? "Item";
  const output = pattern.output ?? pattern.result ?? pattern.outputs?.[1] ?? pattern.outputs?.[0] ?? pattern;
  return normalizeResourceEntry(output, category, pattern.unit, true);
}

function extractPatternIngredients(pattern: any) {
  const sources = [
    pattern?.ingredients,
    pattern?.inputs,
    pattern?.input,
    pattern?.pattern?.ingredients,
    pattern?.pattern?.inputs,
  ];

  for (const source of sources) {
    const values = asArray(source)
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const category = normalizeCategory((entry as any).category ?? (entry as any).categoryKey ?? "Item") ?? "Item";
        const normalized = normalizeResourceEntry(entry, category);
        if (!normalized) return null;
        return {
          category: normalized.category,
          key: normalized.resourceKey,
          name: normalized.name,
          displayName: normalized.displayName,
          amount: normalized.amount || 1,
          unit: normalized.unit,
        };
      })
      .filter(Boolean);

    if (values.length) return values;
  }

  return null;
}

async function syncCraftPatterns(deviceId: string, snapshot: any, now: Date) {
  const patterns = asArray(snapshot?.patterns ?? snapshot?.craftPatterns);
  const operations: any[] = [];

  for (const pattern of patterns) {
    const output = extractPatternOutput(pattern);
    if (!output) continue;

    operations.push(
      prisma.craftPattern.upsert({
        where: resourceWhere(deviceId, output.category, output.resourceKey),
        create: {
          deviceId,
          category: output.category,
          resourceKey: output.resourceKey,
          outputName: output.name,
          displayName: output.displayName,
          outputAmount: output.amount > 0 ? output.amount : 1,
          ingredients: extractPatternIngredients(pattern) as any,
          payload: pattern,
          lastSeenAt: now,
        },
        update: {
          outputName: output.name,
          displayName: output.displayName,
          outputAmount: output.amount > 0 ? output.amount : 1,
          ingredients: extractPatternIngredients(pattern) as any,
          payload: pattern,
          lastSeenAt: now,
        },
      }),
    );
  }

  for (let i = 0; i < operations.length; i += 100) {
    await prisma.$transaction(operations.slice(i, i + 100));
  }
}

function isDeviceSocketOnline(deviceId: string) {
  return deviceConnections.get(deviceId)?.authenticated === true;
}

function isDeviceRecentlySeen(device: { online: boolean; lastSeenAt: Date | string | null }, now: Date) {
  return (
    device.online &&
    device.lastSeenAt !== null &&
    now.getTime() - new Date(device.lastSeenAt).getTime() <= LIVE_DEVICE_WINDOW_MS
  );
}

async function markDeviceSeen(deviceId: string, force = false) {
  const nowMs = Date.now();
  const previous = deviceLastTouchAt.get(deviceId) ?? 0;
  if (!force && nowMs - previous < DEVICE_TOUCH_THROTTLE_MS) return;

  deviceLastTouchAt.set(deviceId, nowMs);
  await prisma.device.updateMany({
    where: { id: deviceId },
    data: { online: true, lastSeenAt: new Date(nowMs) },
  });
  broadcast("device", { deviceId, online: true });
}

async function persistResourceRows(deviceId: string, rows: NormalizedResource[], categoriesWithFullLists: Set<ResourceCategory>, now: Date) {
  const categories = [...new Set([...categoriesWithFullLists, ...rows.map((row) => row.category)])];
  if (!categories.length) return;

  const existingRows = await prisma.resourceCurrent.findMany({
    where: {
      deviceId,
      category: { in: categories },
    },
  });
  const existingByKey = new Map(existingRows.map((row) => [`${row.category}:${row.resourceKey}`, row]));
  const nextByKey = new Map<string, NormalizedResource>();

  for (const row of rows) {
    const key = `${row.category}:${row.resourceKey}`;
    const existing = nextByKey.get(key);
    const current = existingByKey.get(key);
    const nextRow = row.craftable && row.amount === 0 && current ? { ...row, amount: current.amount } : row;
    if (existing) {
      if (!(row.craftable && row.amount === 0)) existing.amount += row.amount;
      existing.craftable = existing.craftable || nextRow.craftable;
    } else {
      nextByKey.set(key, { ...nextRow });
    }
  }

  for (const existing of existingRows) {
    const existingCategory = normalizeCategory(existing.category);
    if (!existingCategory || !categoriesWithFullLists.has(existingCategory)) continue;

    const key = `${existing.category}:${existing.resourceKey}`;
    if (!nextByKey.has(key) && existing.amount !== 0) {
      nextByKey.set(key, {
        category: existingCategory,
        resourceKey: existing.resourceKey,
        name: existing.name,
        displayName: existing.displayName,
        amount: 0,
        unit: existing.unit ?? categoryMeta[existingCategory].unit,
        fingerprint: existing.fingerprint,
        nbtHash: existing.nbtHash,
        payload: (existing.payload as Record<string, unknown>) ?? {},
        craftable: existing.craftable,
      });
    }
  }

  const operations: any[] = [];
  const samples: Array<{ deviceId: string; category: string; resourceKey: string; amount: number; createdAt: Date }> = [];

  for (const row of nextByKey.values()) {
    const existing = existingByKey.get(`${row.category}:${row.resourceKey}`);
    const amountChanged = !existing || Math.abs(existing.amount - row.amount) > 0.000001;
    const seconds = existing ? Math.max((now.getTime() - existing.lastChangedAt.getTime()) / 1000, 1) : 1;
    const lastRate = amountChanged && existing ? (row.amount - existing.amount) / seconds : existing?.lastRate ?? 0;

    if (amountChanged) {
      samples.push({
        deviceId,
        category: row.category,
        resourceKey: row.resourceKey,
        amount: row.amount,
        createdAt: now,
      });
    }

    operations.push(
      prisma.resourceCurrent.upsert({
        where: resourceWhere(deviceId, row.category, row.resourceKey),
        create: {
          deviceId,
          category: row.category,
          resourceKey: row.resourceKey,
          name: row.name,
          displayName: row.displayName,
          amount: row.amount,
          unit: row.unit,
          fingerprint: row.fingerprint,
          nbtHash: row.nbtHash,
          craftable: row.craftable,
          lastRate,
          payload: row.payload as any,
          firstSeenAt: now,
          lastChangedAt: now,
          lastSeenAt: now,
        },
        update: {
          name: row.name,
          displayName: row.displayName,
          amount: row.amount,
          unit: row.unit,
          fingerprint: row.fingerprint,
          nbtHash: row.nbtHash,
          craftable: row.craftable,
          lastRate,
          payload: row.payload as any,
          lastChangedAt: amountChanged ? now : existing?.lastChangedAt,
          lastSeenAt: now,
        },
      }),
    );
  }

  if (samples.length) {
    operations.push(prisma.resourceSample.createMany({ data: samples }));
  }

  for (let i = 0; i < operations.length; i += 250) {
    await prisma.$transaction(operations.slice(i, i + 250));
  }
}

async function persistResourcesFromSnapshot(deviceId: string, snapshot: any, now: Date) {
  const rows: NormalizedResource[] = [];
  const categoriesWithFullLists = new Set<ResourceCategory>();

  for (const storage of snapshot.storages ?? []) {
    const category = normalizeCategory(storage?.key);
    if (!category) continue;

    if (storage._hasResourceList) {
      if (storage.resourcesFull) categoriesWithFullLists.add(category);
      rows.push(...normalizeResourceList(storage.resources, category, storage.unit));
    }

    const craftables = getCraftableLists(snapshot, category, storage);
    if (craftables.length) {
      rows.push(...craftables);
    }
  }

  await persistResourceRows(deviceId, rows, categoriesWithFullLists, now);
  await syncCraftPatterns(deviceId, snapshot, now);
}

function publicResource(row: any, pattern?: any) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    category: row.category,
    key: row.resourceKey,
    name: row.name,
    displayName: row.displayName,
    amount: row.amount,
    unit: row.unit,
    fingerprint: row.fingerprint,
    nbtHash: row.nbtHash,
    craftable: row.craftable || Boolean(pattern),
    lastRate: row.lastRate,
    firstSeenAt: row.firstSeenAt,
    lastChangedAt: row.lastChangedAt,
    lastSeenAt: row.lastSeenAt,
    pattern: pattern
      ? {
          outputAmount: pattern.outputAmount,
          ingredients: pattern.ingredients,
          updatedAt: pattern.updatedAt,
        }
      : null,
  };
}

function numericRuleValue(rule: any, key: string, fallback?: number) {
  const value = Number(rule?.[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function calcRuleReserve(rule: any, config: any, sourceAmount: number) {
  const fixedReserve = numericRuleValue(rule, "fixedReserve", numericRuleValue(rule, "keepSource"));
  if (fixedReserve !== undefined) return Math.max(0, Math.min(fixedReserve, sourceAmount));

  const reservePercent = numericRuleValue(rule, "reservePercent", numericRuleValue(config, "reservePercent", 0)) ?? 0;
  const reserveMin = numericRuleValue(rule, "reserveMin", numericRuleValue(config, "reserveMin", 0)) ?? 0;
  const reserveMax = numericRuleValue(rule, "reserveMax", numericRuleValue(config, "reserveMax", sourceAmount)) ?? sourceAmount;
  return Math.max(0, Math.min(Math.max(Math.round(sourceAmount * reservePercent), reserveMin), reserveMax, sourceAmount));
}

function findAutocraftRule(config: any, resource: any) {
  const rules = config?.rules ?? config?.autocraft?.rules;
  if (!Array.isArray(rules)) return null;
  return (
    rules.find((rule) => {
      const target = scalarString(rule?.target);
      return target && (target === resource.name || target === resource.resourceKey);
    }) ?? null
  );
}

async function findResourceByName(deviceId: string, category: ResourceCategory, name: string) {
  return prisma.resourceCurrent.findFirst({
    where: {
      deviceId,
      category,
      OR: [{ resourceKey: name }, { name }],
    },
  });
}

function normalizeIngredientRows(ingredients: any, outputAmount = 1) {
  return asArray(ingredients)
    .map((ingredient) => {
      if (!ingredient || typeof ingredient !== "object") return null;
      const category = normalizeCategory(ingredient.category ?? ingredient.categoryKey ?? "Item") ?? "Item";
      const key = scalarString(ingredient.key ?? ingredient.resourceKey) ?? makeResourceKey(resourceName(ingredient), null, null, "ingredient");
      return {
        category,
        key,
        name: resourceName(ingredient),
        displayName: resourceLabel(ingredient, resourceName(ingredient)),
        amount: Number(ingredient.amount || 1) / Math.max(outputAmount, 1),
        unit: scalarString(ingredient.unit) ?? categoryMeta[category].unit,
      };
    })
    .filter(Boolean) as Array<{ category: ResourceCategory; key: string; name: string | null; displayName: string | null; amount: number; unit: string }>;
}

async function buildCraftPreview(deviceId: string, category: ResourceCategory, key: string, requestedAmount = 1) {
  const resource = await prisma.resourceCurrent.findUnique({
    where: resourceWhere(deviceId, category, key),
  });
  if (!resource) return null;

  const pattern = await prisma.craftPattern.findUnique({
    where: resourceWhere(deviceId, category, key),
  });

  const runtime = await getRuntimeConfig();
  const autocraft = (runtime.value as any)?.autocraft ?? {};
  const rule = findAutocraftRule(autocraft, resource);

  if (rule?.source) {
    const source = await findResourceByName(deviceId, "Item", String(rule.source));
    const sourceAmount = Number(source?.amount ?? 0);
    const reserve = calcRuleReserve(rule, autocraft, sourceAmount);
    const sourcePerCraft = numericRuleValue(rule, "sourcePerCraft", numericRuleValue(rule, "sourcePerOutput", 1)) ?? 1;
    const outputPerCraft = numericRuleValue(rule, "outputPerCraft", 1) ?? 1;
    const maxBatches = Math.max(Math.floor((sourceAmount - reserve) / Math.max(sourcePerCraft, 1)), 0);
    let maxAmount = maxBatches * Math.max(outputPerCraft, 1);
    const maxOutputs = numericRuleValue(rule, "maxOutputsPerJob", numericRuleValue(autocraft, "maxOutputsPerJob"));
    if (maxOutputs && maxOutputs > 0) maxAmount = Math.min(maxAmount, maxOutputs);
    if (rule.targetLimit) maxAmount = Math.min(maxAmount, Math.max(Number(rule.targetLimit) - resource.amount, 0));
    const batches = Math.ceil(requestedAmount / Math.max(outputPerCraft, 1));

    return {
      resource: publicResource(resource, pattern),
      mode: "rule",
      craftable: true,
      maxAmount,
      requestedAmount,
      ingredients: [
        {
          category: "Item",
          key: String(rule.source),
          name: String(rule.source),
          displayName: source?.displayName ?? String(rule.source),
          amount: batches * sourcePerCraft,
          available: sourceAmount,
          reserve,
          unit: source?.unit ?? "items",
        },
      ],
      patternAvailable: Boolean(pattern),
      warnings: [],
    };
  }

  const outputAmount = Number(pattern?.outputAmount ?? 1) || 1;
  const ingredients = normalizeIngredientRows(pattern?.ingredients, outputAmount);
  let maxAmount: number | null = null;

  if (ingredients.length) {
    const limits = [];
    for (const ingredient of ingredients) {
      const current = await prisma.resourceCurrent.findFirst({
        where: {
          deviceId,
          category: ingredient.category,
          OR: [{ resourceKey: ingredient.key }, { name: ingredient.name ?? ingredient.key }],
        },
      });
      const available = Number(current?.amount ?? 0);
      (ingredient as any).available = available;
      limits.push(Math.floor(available / Math.max(ingredient.amount, 0.000001)));
    }
    maxAmount = Math.max(0, Math.min(...limits));
  }

  return {
    resource: publicResource(resource, pattern),
    mode: pattern ? "pattern" : "direct",
    craftable: resource.craftable || Boolean(pattern),
    maxAmount,
    requestedAmount,
    ingredients: ingredients.length ? ingredients.map((ingredient) => ({ ...ingredient, amount: ingredient.amount * requestedAmount })) : null,
    patternAvailable: Boolean(pattern),
    warnings: ingredients.length ? [] : ["ingredients unavailable from bridge pattern data"],
  };
}

async function persistSnapshot(deviceId: string, snapshot: any) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const now = new Date();
  const publicSnapshot = stripHeavySnapshotFields(normalizedSnapshot);

  await prisma.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: now, online: true },
  });

  await prisma.snapshot.create({
    data: {
      deviceId,
      payload: publicSnapshot,
    },
  });

  const metricRows: Array<{ deviceId: string; metric: string; category?: string; value: number }> = [];
  for (const storage of normalizedSnapshot.storages) {
    const category = String(storage.key ?? storage.title ?? "storage");
    for (const metric of ["used", "free", "total", "usedPercent", "rate"]) {
      const value = Number(storage[metric]);
      if (Number.isFinite(value)) metricRows.push({ deviceId, metric, category, value });
    }
  }

  const energyStored = Number(snapshot?.energy?.stored);
  if (Number.isFinite(energyStored)) {
    metricRows.push({ deviceId, metric: "energyStored", value: energyStored });
  }

  const tps = Number(snapshot?.tps);
  if (Number.isFinite(tps)) {
    metricRows.push({ deviceId, metric: "tps", value: tps });
  }

  if (metricRows.length > 0) {
    await prisma.metricPoint.createMany({ data: metricRows });
  }

  for (const alert of normalizedSnapshot.alerts) {
    if (alert?.severity && alert?.text) {
      await prisma.alertEvent.create({
        data: {
          deviceId,
          severity: String(alert.severity),
          text: String(alert.text),
        },
      });
    }
  }

  broadcast("snapshot", { deviceId, snapshot: publicSnapshot });

  if (resourceSyncInFlight.has(deviceId)) return;
  resourceSyncInFlight.add(deviceId);
  try {
    await persistResourcesFromSnapshot(deviceId, normalizedSnapshot, now);
  } finally {
    resourceSyncInFlight.delete(deviceId);
  }
}

async function sendPendingCommands(deviceId: string) {
  const connection = deviceConnections.get(deviceId);
  if (!connection?.authenticated) return;

  const commands = await prisma.commandQueue.findMany({
    where: { deviceId, status: "queued" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const command of commands) {
    sendJson(connection.socket, {
      type: "command",
      commandId: command.id,
      action: command.action,
      payload: command.payload,
    });

    await prisma.commandQueue.update({
      where: { id: command.id },
      data: { status: "sent", sentAt: new Date() },
    });
  }
}

async function sendConfig(deviceId: string) {
  const connection = deviceConnections.get(deviceId);
  if (!connection?.authenticated) return;

  const config = await getRuntimeConfig();
  sendJson(connection.socket, {
    type: "config_update",
    version: config.version,
    config: config.value,
  });
}

async function main() {
  await ensureBootstrapData();

  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.jwtSecret,
    cookie: { cookieName: "atm10_token", signed: false },
  });
  await app.register(websocket);

  app.get("/health", async () => ({ ok: true }));

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid login payload" });

    const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }

    const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: "12h" });
    reply.setCookie("atm10_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return { token, user: { id: user.id, username: user.username } };
  });

  app.post("/api/auth/logout", { preHandler: authenticate }, async (_request, reply) => {
    reply.clearCookie("atm10_token", { path: "/" });
    return { ok: true };
  });

  app.get("/api/dashboard/latest", { preHandler: authenticate }, async () => {
    const now = new Date();
    const snapshot = await prisma.snapshot.findFirst({ orderBy: { createdAt: "desc" } });
    const devices = await prisma.device.findMany({ orderBy: { updatedAt: "desc" } });
    const config = await getRuntimeConfig();
    return {
      snapshot,
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        scriptVersion: device.scriptVersion,
        lastSeenAt: device.lastSeenAt,
        online: isDeviceSocketOnline(device.id) || isDeviceRecentlySeen(device, now),
      })),
      config,
    };
  });

  app.get("/api/history", { preHandler: authenticate }, async (request) => {
    const query = request.query as { metric?: string; category?: string; range?: string; deviceId?: string };
    const metric = query.metric ?? "usedPercent";
    const range = query.range ?? "24h";
    const points = await prisma.metricPoint.findMany({
      where: {
        deviceId: query.deviceId ?? env.deviceId,
        metric,
        category: query.category,
        createdAt: { gte: getRangeStart(range) },
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    return { points };
  });

  app.get("/api/resources", { preHandler: authenticate }, async (request, reply) => {
    const parsed = resourceQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid query", issues: parsed.error.issues });

    const category = parsed.data.category ? normalizeCategory(parsed.data.category) : null;
    if (parsed.data.category && !category) return reply.code(400).send({ error: "invalid category" });

    const sort = parsed.data.sort ?? "amount";
    const order = parsed.data.order ?? "desc";
    const limit = parsed.data.limit ?? 500;
    const where: any = {
      deviceId: parsed.data.deviceId ?? env.deviceId,
    };
    if (category) where.category = category;
    if (parsed.data.q?.trim()) {
      const contains = parsed.data.q.trim();
      where.OR = [
        { resourceKey: { contains, mode: "insensitive" } },
        { name: { contains, mode: "insensitive" } },
        { displayName: { contains, mode: "insensitive" } },
      ];
    }

    const orderBy =
      sort === "rate"
        ? { lastRate: order }
        : sort === "name"
          ? { displayName: order }
          : { amount: order };

    const resources = await prisma.resourceCurrent.findMany({
      where,
      orderBy,
      take: limit,
    });

    const patterns = await prisma.craftPattern.findMany({
      where: {
        deviceId: where.deviceId,
        category: category ? category : undefined,
        resourceKey: { in: resources.map((resource) => resource.resourceKey) },
      },
    });
    const patternByKey = new Map(patterns.map((pattern) => [`${pattern.category}:${pattern.resourceKey}`, pattern]));

    return {
      resources: resources.map((resource) => publicResource(resource, patternByKey.get(`${resource.category}:${resource.resourceKey}`))),
    };
  });

  app.get("/api/resources/top", { preHandler: authenticate }, async (request, reply) => {
    const parsed = resourceQuerySchema.extend({ kind: z.enum(["amount", "growth", "decline"]).optional() }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid query", issues: parsed.error.issues });

    const category = parsed.data.category ? normalizeCategory(parsed.data.category) : null;
    if (parsed.data.category && !category) return reply.code(400).send({ error: "invalid category" });

    const kind = parsed.data.kind ?? "amount";
    const where: any = { deviceId: parsed.data.deviceId ?? env.deviceId };
    if (category) where.category = category;
    if (kind === "growth") where.lastRate = { gt: 0 };
    if (kind === "decline") where.lastRate = { lt: 0 };

    const resources = await prisma.resourceCurrent.findMany({
      where,
      orderBy: kind === "growth" ? { lastRate: "desc" } : kind === "decline" ? { lastRate: "asc" } : { amount: "desc" },
      take: parsed.data.limit ?? 12,
    });

    return { resources: resources.map((resource) => publicResource(resource)) };
  });

  app.get("/api/resources/history", { preHandler: authenticate }, async (request, reply) => {
    const parsed = resourceHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid query", issues: parsed.error.issues });

    const category = normalizeCategory(parsed.data.category);
    if (!category) return reply.code(400).send({ error: "invalid category" });

    const deviceId = parsed.data.deviceId ?? env.deviceId;
    const start = getRangeStart(parsed.data.range ?? "1h");
    const where = {
      deviceId,
      category,
      resourceKey: parsed.data.key,
    };
    const [previous, points, current] = await Promise.all([
      prisma.resourceSample.findFirst({
        where: { ...where, createdAt: { lt: start } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.resourceSample.findMany({
        where: { ...where, createdAt: { gte: start } },
        orderBy: { createdAt: "asc" },
        take: 5000,
      }),
      prisma.resourceCurrent.findUnique({ where: resourceWhere(deviceId, category, parsed.data.key) }),
    ]);

    const result = previous ? [previous, ...points] : points;
    if (result.length === 0 && current) {
      result.push({ id: current.id, deviceId, category, resourceKey: current.resourceKey, amount: current.amount, createdAt: current.lastSeenAt } as any);
    }

    return {
      points: result.map((point) => ({ createdAt: point.createdAt, value: point.amount })),
      resource: current ? publicResource(current) : null,
    };
  });

  app.get("/api/resources/craft-preview", { preHandler: authenticate }, async (request, reply) => {
    const parsed = craftPreviewQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid query", issues: parsed.error.issues });

    const category = normalizeCategory(parsed.data.category);
    if (!category) return reply.code(400).send({ error: "invalid category" });

    const preview = await buildCraftPreview(parsed.data.deviceId ?? env.deviceId, category, parsed.data.key, parsed.data.amount ?? 1);
    if (!preview) return reply.code(404).send({ error: "resource not found" });
    return preview;
  });

  app.post("/api/resources/craft", { preHandler: authenticate }, async (request, reply) => {
    const parsed = craftResourceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid craft request", issues: parsed.error.issues });

    const category = normalizeCategory(parsed.data.category);
    if (!category) return reply.code(400).send({ error: "invalid category" });

    const preview = await buildCraftPreview(parsed.data.deviceId, category, parsed.data.key, parsed.data.amount);
    if (!preview) return reply.code(404).send({ error: "resource not found" });
    if (!preview.craftable) return reply.code(400).send({ error: "resource is not craftable" });
    if (preview.maxAmount !== null && parsed.data.amount > preview.maxAmount) {
      return reply.code(400).send({ error: "requested amount exceeds direct max", maxAmount: preview.maxAmount });
    }

    const command = await prisma.commandQueue.create({
      data: {
        deviceId: parsed.data.deviceId,
        action: "craft_resource",
        payload: {
          category,
          key: parsed.data.key,
          name: preview.resource.name,
          fingerprint: preview.resource.fingerprint,
          nbtHash: preview.resource.nbtHash,
          amount: parsed.data.amount,
        },
        requestedBy: (request.user as any)?.username,
      },
    });

    await sendPendingCommands(parsed.data.deviceId);
    return command;
  });

  app.get("/api/config", { preHandler: authenticate }, async () => getRuntimeConfig());

  app.put("/api/config", { preHandler: authenticate }, async (request) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return { error: "invalid config", issues: parsed.error.issues };

    const current = await getRuntimeConfig();
    const value = { ...(current.value as any), ...parsed.data };
    const updated = await prisma.appConfig.update({
      where: { key: "runtime" },
      data: { value, version: { increment: 1 } },
    });

    await syncAutocraftRules(value);
    for (const deviceId of deviceConnections.keys()) await sendConfig(deviceId);
    broadcast("config", updated);
    return updated;
  });

  app.post("/api/commands", { preHandler: authenticate }, async (request, reply) => {
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid command", issues: parsed.error.issues });

    const command = await prisma.commandQueue.create({
      data: {
        deviceId: parsed.data.deviceId,
        action: parsed.data.action,
        payload: parsed.data.payload,
        requestedBy: (request.user as any)?.username,
      },
    });

    await sendPendingCommands(parsed.data.deviceId);
    return command;
  });

  app.get("/api/events", { websocket: true }, (connection, request) => {
    const socket = getSocket(connection);
    const token = (request.query as any)?.token || request.cookies?.atm10_token;
    try {
      app.jwt.verify(token);
    } catch {
      socket.close(1008, "unauthorized");
      return;
    }

    browserClients.add(socket);
    sendJson(socket, { type: "ready" });
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw));
        if (message?.type === "ping") {
          try {
            sendJson(socket, { type: "pong", at: new Date().toISOString() });
          } catch {
            browserClients.delete(socket);
          }
        }
      } catch {
        // Ignore non-JSON websocket messages from browser clients.
      }
    });
    socket.on("close", () => browserClients.delete(socket));
    socket.on("error", () => browserClients.delete(socket));
  });

  app.get("/cc/ws", { websocket: true }, (connection, request) => {
    const socket = getSocket(connection);
    const headerDeviceId = String(request.headers["x-atm10-device-id"] ?? env.deviceId);
    let deviceId = headerDeviceId;

    const closeDevice = async () => {
      deviceConnections.delete(deviceId);
      deviceLastTouchAt.delete(deviceId);
      await prisma.device.updateMany({ where: { id: deviceId }, data: { online: false } });
      broadcast("device", { deviceId, online: false });
    };

    socket.on("message", async (raw) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendJson(socket, { type: "error", message: "invalid json" });
        return;
      }

      try {
        if (message.type === "hello") {
          deviceId = String(message.deviceId ?? headerDeviceId);
          const device = await prisma.device.findUnique({ where: { id: deviceId } });
          const token = String(message.token ?? request.headers["x-atm10-token"] ?? "");

          if (!device || !(await bcrypt.compare(token, device.tokenHash))) {
            sendJson(socket, { type: "hello_ack", ok: false, message: "invalid device token" });
            socket.close();
            return;
          }

          deviceConnections.set(deviceId, { deviceId, socket, authenticated: true });
          deviceLastTouchAt.set(deviceId, Date.now());
          await prisma.device.update({
            where: { id: deviceId },
            data: {
              online: true,
              lastSeenAt: new Date(),
              scriptVersion: message.scriptVersion ? String(message.scriptVersion) : undefined,
              capabilities: message.capabilities ?? undefined,
            },
          });

          const config = await getRuntimeConfig();
          sendJson(socket, { type: "hello_ack", ok: true, configVersion: config.version });
          await sendConfig(deviceId);
          await sendPendingCommands(deviceId);
          broadcast("device", { deviceId, online: true });
          return;
        }

        const connectionState = deviceConnections.get(deviceId);
        if (!connectionState?.authenticated) {
          sendJson(socket, { type: "error", message: "hello required" });
          return;
        }

        await markDeviceSeen(deviceId);

        if (message.type === "snapshot") {
          await persistSnapshot(deviceId, message.snapshot);
          await sendPendingCommands(deviceId);
        } else if (message.type === "config_request") {
          await sendConfig(deviceId);
        } else if (message.type === "command_ack") {
          await prisma.commandQueue.updateMany({
            where: { id: String(message.commandId), deviceId },
            data: {
              status: message.status === "ok" ? "acked" : "error",
              result: String(message.message ?? message.status ?? ""),
              ackedAt: new Date(),
            },
          });
          broadcast("command_ack", { deviceId, commandId: message.commandId, status: message.status, message: message.message });
        } else if (message.type === "config_ack") {
          broadcast("config_ack", { deviceId, version: message.version, status: message.status, message: message.message });
        }
      } catch (error) {
        app.log.error({ err: error, deviceId, messageType: message?.type }, "device websocket message failed");
        sendJson(socket, { type: "error", message: "server error" });
      }
    });

    socket.on("close", () => void closeDevice());
    socket.on("error", () => void closeDevice());
  });

  setInterval(() => {
    void pruneOldData().catch((error) => app.log.error(error));
  }, 60 * 60 * 1000);

  await app.listen({ host: env.host, port: env.port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
