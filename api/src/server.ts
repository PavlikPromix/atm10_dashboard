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

type ClientSocket = {
  send: (message: string) => void;
  close: () => void;
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
  ]),
  payload: z.record(z.any()).default({}),
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

function normalizeSnapshot(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return {};

  return {
    ...snapshot,
    storages: asArray(snapshot.storages),
    alerts: asArray(snapshot.alerts),
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
  await prisma.alertEvent.deleteMany({ where: { createdAt: { lt: historyCutoff } } });
}

async function persistSnapshot(deviceId: string, snapshot: any) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);

  await prisma.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), online: true },
  });

  await prisma.snapshot.create({
    data: {
      deviceId,
      payload: normalizedSnapshot,
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

  broadcast("snapshot", { deviceId, snapshot: normalizedSnapshot });
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
        online: device.online && deviceConnections.has(device.id),
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
      socket.close();
      return;
    }

    browserClients.add(socket);
    sendJson(socket, { type: "ready" });
    socket.on("close", () => browserClients.delete(socket));
    socket.on("error", () => browserClients.delete(socket));
  });

  app.get("/cc/ws", { websocket: true }, (connection, request) => {
    const socket = getSocket(connection);
    const headerDeviceId = String(request.headers["x-atm10-device-id"] ?? env.deviceId);
    let deviceId = headerDeviceId;

    const closeDevice = async () => {
      deviceConnections.delete(deviceId);
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
