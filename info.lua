-- RS Storage Monitor for CC:Tweaked + Advanced Peripherals
-- Target: All The Mods 10 / Minecraft 1.21.1+
-- Shows free/used/total storage for items, fluids and Mekanism chemicals.

local CONFIG = {
    refreshSeconds = 1,
    monitorTextScale = 0.5,

    -- getItems/getFluids/getChemicals may be heavy on huge RS networks.
    -- Set false if the computer/monitor starts lagging.
    showResourceTypeCounts = true,

    -- External storage support may be unavailable for RS Bridge depending on AP/RS2 version.
    showExternalIfAvailable = true,

    web = {
        enabled = false,
        url = "wss://your-domain.example/cc/ws",
        deviceId = "atm10-main",
        token = "change-me",
        reconnectSeconds = 10,
        sendSnapshots = true,
        configPath = "atm10_dashboard_config.json",
        scriptVersion = "2.0.0",
    },
}

CONFIG.autocraft = CONFIG.autocraft or {
    enabled = true,

    -- Автокрафт проверяется реже, чем основной refresh.
    intervalSeconds = 60,

    -- Чтобы не завалить RS сеть очередями.
    maxJobsPerCycle = 3,

    -- Минимальный и максимальный размер одного craftItem-запроса по target item.
    minOutputsPerJob = 64,
    maxOutputsPerJob = 10000000,
    roundTo = 64,

    -- Резерв исходной эссенции:
    -- reserve = clamp(sourceAmount * reservePercent, reserveMin, reserveMax)
    reservePercent = 0.10,
    reserveMin = 20000,
    reserveMax = 50000,
	
	-- Если 0, то один и тот же ресурс может крафтиться снова,
	-- но только после прохода по остальным правилам.
	perRuleCooldownSeconds = 180,

    rules = {
		{ enabled = true, label = "Iron", source = "mysticalagriculture:iron_essence", target = "minecraft:iron_ingot", sourcePerCraft = 8, fixedReserve = 50000, outputPerCraft = 6 },
		{ enabled = true, label = "Gold", source = "mysticalagriculture:gold_essence", target = "minecraft:gold_ingot", sourcePerCraft = 8, fixedReserve = 50000, outputPerCraft = 4 },
		{ enabled = true, label = "Copper", source = "mysticalagriculture:copper_essence", target = "minecraft:copper_ingot", sourcePerCraft = 8, fixedReserve = 2000, outputPerCraft = 6 },

		{ enabled = true, label = "Coal", source = "mysticalagriculture:coal_essence", target = "minecraft:coal", sourcePerCraft = 8, fixedReserve = 20000, outputPerCraft = 12 },
		{ enabled = true, label = "Redstone", source = "mysticalagriculture:redstone_essence", target = "minecraft:redstone", sourcePerCraft = 8, fixedReserve = 50000, outputPerCraft = 12 },
		{ enabled = true, label = "Lapis", source = "mysticalagriculture:lapis_lazuli_essence", target = "minecraft:lapis_lazuli", sourcePerCraft = 8, fixedReserve = 50000, outputPerCraft = 12 },

		{ enabled = true, label = "Diamond", source = "mysticalagriculture:diamond_essence", target = "minecraft:diamond", sourcePerCraft = 9, fixedReserve = 20000, outputPerCraft = 1 },
		{ enabled = true, label = "Emerald", source = "mysticalagriculture:emerald_essence", target = "minecraft:emerald", sourcePerCraft = 9, fixedReserve = 5000, outputPerCraft = 1 },

		{ enabled = true, label = "Quartz", source = "mysticalagriculture:nether_quartz_essence", target = "minecraft:quartz", sourcePerCraft = 8, fixedReserve = 20000, outputPerCraft = 12 },
		{ enabled = true, label = "Glowstone", source = "mysticalagriculture:glowstone_essence", target = "minecraft:glowstone_dust", sourcePerCraft = 8, fixedReserve = 20000, outputPerCraft = 12 },

		-- Ниже лучше проверить target ID в твоём ATM10, потому что часть ресурсов может идти из AllTheOres/Mekanism.
		{ enabled = true, label = "Osmium", source = "mysticalagriculture:osmium_essence", target = "alltheores:osmium_ingot", sourcePerCraft = 8, fixedReserve = 0, outputPerCraft = 4 },
		{ enabled = true, label = "Uraninite", source = "mysticalagriculture:uraninite_essence", target = "powah:uraninite", sourcePerCraft = 8, fixedReserve = 0, outputPerCraft = 2 },
		{ enabled = false, label = "Tin", source = "mysticalagriculture:tin_essence", target = "alltheores:tin_ingot", sourcePerCraft = 8, fixedReserve = 0, outputPerCraft = 4 },

		-- { enabled = false, label = "Lead", source = "mysticalagriculture:lead_essence", target = "alltheores:lead_ingot", sourcePerCraft = 2, outputPerCraft = 1 },
		-- { enabled = false, label = "Silver", source = "mysticalagriculture:silver_essence", target = "alltheores:silver_ingot", sourcePerCraft = 2, outputPerCraft = 1 },

		{ enabled = true, label = "Nickel", source = "mysticalagriculture:nickel_essence", target = "alltheores:nickel_ingot", sourcePerCraft = 2, fixedReserve = 0, outputPerCraft = 1 },
		{ enabled = true, label = "Netherite", source = "mysticalagriculture:netherite_essence", target = "minecraft:netherite_ingot", sourcePerCraft = 8, fixedReserve = 0, outputPerCraft = 1 },
	},
}

local function jsonEncode(value)
    if textutils and textutils.serialiseJSON then
        return textutils.serialiseJSON(value)
    end

    if textutils and textutils.serializeJSON then
        return textutils.serializeJSON(value)
    end

    return nil, "JSON encode is not available"
end

local function jsonDecode(value)
    if textutils and textutils.unserialiseJSON then
        return textutils.unserialiseJSON(value)
    end

    if textutils and textutils.unserializeJSON then
        return textutils.unserializeJSON(value)
    end

    return nil, "JSON decode is not available"
end

local function mergeTable(target, source)
    if type(target) ~= "table" or type(source) ~= "table" then return target end

    for key, value in pairs(source) do
        if type(value) == "table" and type(target[key]) == "table" then
            mergeTable(target[key], value)
        else
            target[key] = value
        end
    end

    return target
end

local function getRuntimeConfig()
    return {
        refreshSeconds = CONFIG.refreshSeconds,
        alarmWarningStorage = CONFIG.alarmWarningStorage,
        alarmCriticalStorage = CONFIG.alarmCriticalStorage,
        alarmForecastWarningSeconds = CONFIG.alarmForecastWarningSeconds,
        alarmForecastCriticalSeconds = CONFIG.alarmForecastCriticalSeconds,
        alarmCooldownSeconds = CONFIG.alarmCooldownSeconds,
        alarmSpeaker = CONFIG.alarmSpeaker,
        alarmVisual = CONFIG.alarmVisual,
        autocraft = CONFIG.autocraft,
    }
end

local function applyRuntimeConfig(config)
    if type(config) ~= "table" then return false, "config must be a table" end

    local numericKeys = {
        "refreshSeconds",
        "alarmWarningStorage",
        "alarmCriticalStorage",
        "alarmForecastWarningSeconds",
        "alarmForecastCriticalSeconds",
        "alarmCooldownSeconds",
    }

    for _, key in ipairs(numericKeys) do
        if config[key] ~= nil then
            local value = tonumber(config[key])
            if value == nil then return false, key .. " must be numeric" end
            CONFIG[key] = value
        end
    end

    if config.alarmSpeaker ~= nil then CONFIG.alarmSpeaker = config.alarmSpeaker == true end
    if config.alarmVisual ~= nil then CONFIG.alarmVisual = config.alarmVisual == true end

    if type(config.autocraft) == "table" then
        CONFIG.autocraft = CONFIG.autocraft or {}
        mergeTable(CONFIG.autocraft, config.autocraft)
    end

    return true
end

local function saveRuntimeConfigCache()
    if not fs or not fs.open or not CONFIG.web or not CONFIG.web.configPath then
        return false, "fs unavailable"
    end

    local encoded, encodeErr = jsonEncode(getRuntimeConfig())
    if not encoded then return false, encodeErr end

    local handle, err = fs.open(CONFIG.web.configPath, "w")
    if not handle then return false, err end

    handle.write(encoded)
    handle.close()
    return true
end

local function loadRuntimeConfigCache()
    if not fs or not fs.exists or not fs.open or not CONFIG.web or not CONFIG.web.configPath then
        return
    end

    if not fs.exists(CONFIG.web.configPath) then return end

    local handle = fs.open(CONFIG.web.configPath, "r")
    if not handle then return end

    local raw = handle.readAll()
    handle.close()

    local decoded = jsonDecode(raw)
    applyRuntimeConfig(decoded)
end

loadRuntimeConfigCache()

local COLOR = colors or colours

local function color(name, fallback)
    if COLOR and COLOR[name] then return COLOR[name] end
    if COLOR and fallback and COLOR[fallback] then return COLOR[fallback] end
    return nil
end

local monitor = peripheral.find("monitor")
local screen = monitor or term.current()

if monitor and screen.setTextScale then
    pcall(screen.setTextScale, CONFIG.monitorTextScale)
end

local function setFg(c)
    if c and screen.setTextColor then screen.setTextColor(c) end
end

local function setBg(c)
    if c and screen.setBackgroundColor then screen.setBackgroundColor(c) end
end

local function clearScreen()
    setBg(color("black"))
    setFg(color("white"))
    screen.clear()
    screen.setCursorPos(1, 1)
end

local function writeLine(y, text, fg, bg)
    local w, h = screen.getSize()
    if y < 1 or y > h then return end

    setBg(bg or color("black"))
    setFg(fg or color("white"))

    screen.setCursorPos(1, y)
    screen.clearLine()
    screen.write(tostring(text):sub(1, w))

    setBg(color("black"))
    setFg(color("white"))
end

local function clamp(n, lo, hi)
    if n < lo then return lo end
    if n > hi then return hi end
    return n
end

local function fmtNumber(n)
    if n == nil then return "n/a" end
    n = math.floor(tonumber(n) or 0)

    local sign = ""
    if n < 0 then
        sign = "-"
        n = -n
    end

    local s = tostring(n)
    local out = ""

    while #s > 3 do
        out = " " .. s:sub(-3) .. out
        s = s:sub(1, -4)
    end

    return sign .. s .. out
end

local function fmtCompact(n)
    n = tonumber(n) or 0
    local abs = math.abs(n)

    if abs >= 100 then
        return string.format("%.0f", n)
    elseif abs >= 10 then
        return string.format("%.1f", n)
    else
        return string.format("%.2f", n)
    end
end

local function fmtValue(n, unit)
    if n == nil then return "n/a" end
    n = tonumber(n) or 0

    if unit == "mB" then
        if math.abs(n) >= 1000 then
            return fmtCompact(n / 1000) .. " buckets"
        end
        return fmtNumber(n) .. " mB"
    end

    return fmtNumber(n) .. " " .. unit
end

local function countPairs(t)
    if type(t) ~= "table" then return nil end
    local c = 0
    for _ in pairs(t) do c = c + 1 end
    return c
end

local function getPeripheralTypes(name)
    return { peripheral.getType(name) }
end

local function buildMethodSet(name)
    local set = {}
    local ok, methods = pcall(peripheral.getMethods, name)

    if ok and type(methods) == "table" then
        for _, method in ipairs(methods) do
            set[method] = true
        end
    end

    return set
end

local function findRsBridge()
    local preferredTypes = {
        "rs_bridge",                 -- Advanced Peripherals, MC 1.21.1+
        "rsBridge",                  -- Advanced Peripherals, older versions
        "refined_storage",
        "refinedStorage",
        "refined_storage_peripheral",
        "rs_peripheral",
    }

    for _, wantedType in ipairs(preferredTypes) do
        for _, name in ipairs(peripheral.getNames()) do
            for _, actualType in ipairs(getPeripheralTypes(name)) do
                if actualType == wantedType then
                    return peripheral.wrap(name), name, actualType, buildMethodSet(name)
                end
            end
        end
    end

    -- Fallback: find something that looks like an RS/AP storage bridge by methods.
    for _, name in ipairs(peripheral.getNames()) do
        local methods = buildMethodSet(name)

        local looksLikeBridge =
            methods.getAvailableItemStorage or
            methods.getTotalItemStorage or
            methods.getMaxItemDiskStorage or
            (methods.getItems and methods.getFluids) or
            (methods.listItems and methods.listFluids)

        if looksLikeBridge then
            local pType = peripheral.getType(name) or "unknown"
            return peripheral.wrap(name), name, pType, methods
        end
    end

    return nil, nil, nil, nil
end

local bridge, bridgeName, bridgeType, methodSet = findRsBridge()

local function has(method)
    return methodSet and methodSet[method] == true or type(bridge and bridge[method]) == "function"
end

local function call(method, ...)
    if not bridge or not has(method) then
        return nil, "missing method: " .. method
    end

    local fn = bridge[method]
    local ok, a, b, c = pcall(fn, ...)

    if ok then
        return a, b, c
    end

    return nil, tostring(a)
end

local function firstNumber(methods)
    for _, method in ipairs(methods) do
        local value = call(method)
        value = tonumber(value)

        if value ~= nil then
            return value
        end
    end

    return nil
end

local function getList(newMethod, legacyMethod)
    local data, err

    if has(newMethod) then
        data, err = call(newMethod, {})
        if type(data) == "table" then return data end

        data, err = call(newMethod)
        if type(data) == "table" then return data end
    end

    if legacyMethod and has(legacyMethod) then
        data, err = call(legacyMethod)
        if type(data) == "table" then return data end
    end

    return nil
end

local function stackAmount(stack)
    if type(stack) ~= "table" then return 0 end

    return tonumber(
        stack.amount or
        stack.count or
        stack.size or
        stack.quantity or
        stack.qty or
        stack.stored or
        0
    ) or 0
end

local function sumAmounts(list)
    if type(list) ~= "table" then return nil end

    local total = 0
    for _, stack in pairs(list) do
        total = total + stackAmount(stack)
    end

    return total
end

local RESOURCE_TYPES = {
    {
        key = "Item",
        title = "Items",
        unit = "items",
        listNew = "getItems",
        listOld = "listItems",
        legacyMax = "getMaxItemDiskStorage",
    },
    {
        key = "Fluid",
        title = "Fluids",
        unit = "mB",
        listNew = "getFluids",
        listOld = "listFluids",
        legacyMax = "getMaxFluidDiskStorage",
    },
    {
        key = "Chemical",
        title = "Chemicals",
        unit = "mB",
        listNew = "getChemicals",
        listOld = nil,
        legacyMax = nil,
    },
}

local function readStorage(def)
    local total = firstNumber({ "getTotal" .. def.key .. "Storage" })
    local used = firstNumber({ "getUsed" .. def.key .. "Storage" })
    local free = firstNumber({ "getAvailable" .. def.key .. "Storage" })

    if total == nil and def.legacyMax then
        total = firstNumber({ def.legacyMax })
    end

    local list = nil
    local typeCount = nil

    if used == nil or CONFIG.showResourceTypeCounts then
        list = getList(def.listNew, def.listOld)

        if used == nil then
            used = sumAmounts(list)
        end

        if CONFIG.showResourceTypeCounts then
            typeCount = countPairs(list)
        end
    end

    if free == nil and total ~= nil and used ~= nil then
        free = math.max(total - used, 0)
    end

    return {
        title = def.title,
        key = def.key,
        unit = def.unit,
        total = total,
        used = used,
        free = free,
        typeCount = typeCount,
    }
end

local function readExternalStorage(def)
    if not CONFIG.showExternalIfAvailable then return nil end

    local total = firstNumber({ "getTotalExtern" .. def.key .. "Storage" })
    local used = firstNumber({ "getUsedExtern" .. def.key .. "Storage" })
    local free = firstNumber({ "getAvailableExtern" .. def.key .. "Storage" })

    if total == nil and used == nil and free == nil then
        return nil
    end

    return {
        title = "External " .. def.title,
        key = def.key,
        unit = def.unit,
        total = total,
        used = used,
        free = free,
    }
end

local function readEnergy()
    local stored = firstNumber({ "getStoredEnergy", "getEnergyStorage" })
    local capacity = firstNumber({ "getEnergyCapacity", "getMaxEnergyStorage" })
    local usage = firstNumber({ "getEnergyUsage" })

    if stored == nil and capacity == nil and usage == nil then
        return nil
    end

    return {
        stored = stored,
        capacity = capacity,
        usage = usage,
    }
end

local function readCells()
    if not has("getCells") then return nil end

    local cells = call("getCells")
    if type(cells) ~= "table" then return nil end

    local count = 0
    local states = {}

    for _, cell in pairs(cells) do
        count = count + 1

        local state = tostring(cell.state or "unknown")
        states[state] = (states[state] or 0) + 1
    end

    local parts = {}
    for state, n in pairs(states) do
        table.insert(parts, state .. "=" .. n)
    end
    table.sort(parts)

    return {
        count = count,
        statesText = table.concat(parts, ", "),
    }
end

local function colorByUsedPercent(p)
    if p == nil then return color("lightGray") end
    if p >= 0.95 then return color("red") end
    if p >= 0.80 then return color("orange", "yellow") end
    if p >= 0.65 then return color("yellow") end
    return color("lime", "green")
end

local function drawBar(y, usedPercent)
    local w, h = screen.getSize()
    if y > h then return end

    if usedPercent == nil then
        writeLine(y, "[no capacity data]", color("lightGray"))
        return
    end

    usedPercent = clamp(usedPercent, 0, 1)

    local barW = math.max(math.min(w - 2, 50), 1)
    local filled = math.floor(barW * usedPercent + 0.5)
    local empty = barW - filled

    local bar = "[" .. string.rep("#", filled) .. string.rep(".", empty) .. "]"
    writeLine(y, bar, colorByUsedPercent(usedPercent))
end

local function drawStorageBlock(y, data)
    local usedPercent = nil
    local freePercent = nil

    if data.total and data.total > 0 then
        if data.used ~= nil then
            usedPercent = data.used / data.total
            freePercent = 1 - usedPercent
        elseif data.free ~= nil then
            freePercent = data.free / data.total
            usedPercent = 1 - freePercent
        end
    end

    local pctText = ""
    if freePercent ~= nil then
        pctText = string.format(" (%.1f%% free)", clamp(freePercent, 0, 1) * 100)
    end

    writeLine(
        y,
        data.title .. ": free " .. fmtValue(data.free, data.unit) ..
        " / " .. fmtValue(data.total, data.unit) .. pctText,
        colorByUsedPercent(usedPercent)
    )
    y = y + 1

    local extra = ""
    if data.typeCount ~= nil then
        extra = " | types: " .. data.typeCount
    end

    writeLine(y, "  used: " .. fmtValue(data.used, data.unit) .. extra, color("lightGray"))
    y = y + 1

    drawBar(y, usedPercent)
    y = y + 1

    return y
end

local function boolText(value)
    if value == true then return "yes" end
    if value == false then return "no" end
    return "n/a"
end

-- =========================
-- Advanced RS Dashboard UI
-- Features:
-- - Forecast to full / empty
-- - Top growing resources
-- - Top decreasing resources
-- - Touch pages on Advanced Monitor
-- - Session min/max/peak history
-- - Visual + speaker alarms
-- =========================

-- Extra config defaults.
CONFIG.trendSamples = CONFIG.trendSamples or 10
CONFIG.topRows = CONFIG.topRows or 8
CONFIG.tpsSamples = CONFIG.tpsSamples or 10

CONFIG.alarmWarningStorage = CONFIG.alarmWarningStorage or 0.80
CONFIG.alarmCriticalStorage = CONFIG.alarmCriticalStorage or 0.95
CONFIG.alarmForecastWarningSeconds = CONFIG.alarmForecastWarningSeconds or (30 * 60)
CONFIG.alarmForecastCriticalSeconds = CONFIG.alarmForecastCriticalSeconds or (5 * 60)
CONFIG.alarmCooldownSeconds = CONFIG.alarmCooldownSeconds or 30
CONFIG.alarmVolume = CONFIG.alarmVolume or 1.0

if CONFIG.alarmSpeaker == nil then CONFIG.alarmSpeaker = true end
if CONFIG.alarmVisual == nil then CONFIG.alarmVisual = true end

local speaker = nil
if peripheral and peripheral.find then
    speaker = peripheral.find("speaker")
end

local PAGES = {
    "Overview",
    "Items",
    "Fluids",
    "Chemicals",
    "Top",
    "Autocraft",
    "Alerts",
}

local currentPage = 1
local BUTTONS = {}
local lastSnapshot = nil
local lastAlarmAt = 0
local sampleIndex = 0

local TPS = {
    samples = {},
    maxSamples = CONFIG.tpsSamples,
    current = nil,
    scheduledSeconds = nil,
    startedAt = nil,
}

local TRENDS = {
    items = {},
    fluids = {},
    chemicals = {},
    energy = {},
    maxSamples = CONFIG.trendSamples,
}

local RESOURCE_TRENDS = {
    Item = {},
    Fluid = {},
    Chemical = {},
}

local SESSION = {
    Item = { min = nil, max = nil, peakUp = nil, peakDown = nil },
    Fluid = { min = nil, max = nil, peakUp = nil, peakDown = nil },
    Chemical = { min = nil, max = nil, peakUp = nil, peakDown = nil },
    Energy = { min = nil, max = nil, peakUp = nil, peakDown = nil },
}

local AUTOCRAFT = {
    lastRunAt = 0,
    lastStatus = "Waiting",
    lastError = nil,
    history = {},
    forceRun = false,
    ruleOffset = 0,
	-- Round-robin cursor.
    -- Следующий проход начнётся с этого правила, а не всегда с первого.
    nextRuleIndex = 1,

    -- Optional cooldown per rule.
    ruleCooldownUntil = {},
}

local WEB = {
    ws = nil,
    connected = false,
    authenticated = false,
    lastError = nil,
    lastMessageAt = nil,
    lastSendAt = nil,
    nextConnectAt = 0,
    reconnects = 0,
    configVersion = nil,
}

local RESOURCE_DEFS_BY_KEY = {}
for _, def in ipairs(RESOURCE_TYPES) do
    RESOURCE_DEFS_BY_KEY[def.key] = def
end

local function nowMillis()
    if os.epoch then
        return os.epoch("utc")
    end

    return math.floor(os.clock() * 1000)
end

local function logAutocraft(message)
    message = tostring(message or "")

    AUTOCRAFT.lastStatus = message

    table.insert(AUTOCRAFT.history, 1, os.date("%H:%M:%S") .. " " .. message)

    while #AUTOCRAFT.history > 8 do
        table.remove(AUTOCRAFT.history)
    end
end

local function webSend(kind, payload)
    if not CONFIG.web or CONFIG.web.enabled ~= true then return false, "web disabled" end
    if not WEB.ws then return false, "websocket disconnected" end

    local message = payload or {}
    message.type = kind

    local encoded, encodeErr = jsonEncode(message)
    if not encoded then
        WEB.lastError = encodeErr
        return false, encodeErr
    end

    local ok, err = pcall(function()
        WEB.ws.send(encoded)
    end)

    if ok then
        WEB.lastSendAt = os.date("%H:%M:%S")
        return true
    end

    WEB.lastError = tostring(err)
    WEB.connected = false
    WEB.authenticated = false
    WEB.ws = nil
    return false, WEB.lastError
end

local function webSendHello()
    return webSend("hello", {
        deviceId = CONFIG.web.deviceId,
        token = CONFIG.web.token,
        scriptVersion = CONFIG.web.scriptVersion,
        capabilities = {
            snapshots = true,
            configSync = true,
            commands = {
                "run_now",
                "set_autocraft_enabled",
                "set_rule_enabled",
                "update_rule",
                "delete_rule",
                "create_rule",
                "update_thresholds",
            },
        },
    })
end

local function webConnectIfNeeded()
    if not CONFIG.web or CONFIG.web.enabled ~= true then return end
    if WEB.ws then return end

    local now = nowMillis()
    if WEB.nextConnectAt and now < WEB.nextConnectAt then return end

    if not http or not http.websocket then
        WEB.lastError = "http.websocket unavailable"
        WEB.nextConnectAt = now + ((CONFIG.web.reconnectSeconds or 10) * 1000)
        return
    end

    local ok, wsOrErr, err = pcall(http.websocket, CONFIG.web.url, {
        ["X-ATM10-Device-Id"] = CONFIG.web.deviceId or "",
        ["X-ATM10-Token"] = CONFIG.web.token or "",
    })

    if ok and wsOrErr then
        WEB.ws = wsOrErr
        WEB.connected = true
        WEB.authenticated = false
        WEB.lastError = nil
        WEB.lastMessageAt = os.date("%H:%M:%S")
        WEB.reconnects = WEB.reconnects + 1
        webSendHello()
        webSend("config_request", { deviceId = CONFIG.web.deviceId })
        return
    end

    WEB.ws = nil
    WEB.connected = false
    WEB.authenticated = false
    WEB.lastError = tostring(err or wsOrErr or "connect failed")
    WEB.nextConnectAt = now + ((CONFIG.web.reconnectSeconds or 10) * 1000)
end

local function ackCommand(commandId, status, message)
    if not commandId then return end
    webSend("command_ack", {
        commandId = commandId,
        status = status,
        message = tostring(message or status),
    })
end

local function replaceRule(index, patch)
    index = tonumber(index)
    if not index or index < 1 then return false, "invalid rule index" end
    if type(patch) ~= "table" then return false, "rule must be a table" end
    if not CONFIG.autocraft or type(CONFIG.autocraft.rules) ~= "table" then return false, "rules unavailable" end
    if not CONFIG.autocraft.rules[index] then return false, "rule not found" end

    CONFIG.autocraft.rules[index] = mergeTable(CONFIG.autocraft.rules[index], patch)
    AUTOCRAFT.forceRun = true
    return true
end

local function handleWebCommand(command)
    if type(command) ~= "table" then return false, "command must be a table" end

    local action = command.action
    local payload = command.payload or {}

    if action == "run_now" then
        AUTOCRAFT.forceRun = true
        logAutocraft("Manual run queued from web")
        return true, "manual run queued"
    elseif action == "set_autocraft_enabled" then
        CONFIG.autocraft.enabled = payload.enabled == true
        AUTOCRAFT.forceRun = true
        logAutocraft("Autocraft " .. (CONFIG.autocraft.enabled and "enabled" or "disabled") .. " from web")
        saveRuntimeConfigCache()
        return true, "autocraft updated"
    elseif action == "set_rule_enabled" then
        local index = tonumber(payload.index)
        if not index or not CONFIG.autocraft.rules or not CONFIG.autocraft.rules[index] then
            return false, "rule not found"
        end

        CONFIG.autocraft.rules[index].enabled = payload.enabled == true
        AUTOCRAFT.forceRun = true
        logAutocraft((CONFIG.autocraft.rules[index].label or "Rule") .. " " .. (payload.enabled and "enabled" or "disabled") .. " from web")
        saveRuntimeConfigCache()
        return true, "rule updated"
    elseif action == "update_rule" then
        local ok, err = replaceRule(payload.index, payload.rule)
        if ok then saveRuntimeConfigCache() end
        return ok, err or "rule updated"
    elseif action == "delete_rule" then
        local index = tonumber(payload.index)
        if not index or not CONFIG.autocraft.rules or not CONFIG.autocraft.rules[index] then
            return false, "rule not found"
        end

        table.remove(CONFIG.autocraft.rules, index)
        AUTOCRAFT.forceRun = true
        saveRuntimeConfigCache()
        return true, "rule deleted"
    elseif action == "create_rule" then
        if type(payload.rule) ~= "table" then return false, "rule must be a table" end
        CONFIG.autocraft.rules = CONFIG.autocraft.rules or {}
        table.insert(CONFIG.autocraft.rules, payload.rule)
        AUTOCRAFT.forceRun = true
        saveRuntimeConfigCache()
        return true, "rule created"
    elseif action == "update_thresholds" then
        local ok, err = applyRuntimeConfig(payload)
        if ok then saveRuntimeConfigCache() end
        return ok, err or "thresholds updated"
    end

    return false, "unknown action: " .. tostring(action)
end

local function handleWebMessage(raw)
    local message, decodeErr = jsonDecode(raw)
    if type(message) ~= "table" then
        WEB.lastError = tostring(decodeErr or "invalid message")
        return
    end

    WEB.lastMessageAt = os.date("%H:%M:%S")

    if message.type == "hello_ack" then
        WEB.authenticated = message.ok == true
        WEB.configVersion = message.configVersion
    elseif message.type == "config_update" then
        local ok, err = applyRuntimeConfig(message.config or {})
        if ok then
            WEB.configVersion = message.version or WEB.configVersion
            saveRuntimeConfigCache()
            webSend("config_ack", {
                version = WEB.configVersion,
                status = "ok",
            })
        else
            webSend("config_ack", {
                version = message.version,
                status = "error",
                message = err,
            })
        end
    elseif message.type == "command" then
        local ok, result = handleWebCommand(message)
        ackCommand(message.commandId, ok and "ok" or "error", result)
    elseif message.type == "ping" then
        webSend("pong", { at = os.date("%H:%M:%S") })
    end
end

local function webReceiveAvailable()
    if not WEB.ws then return end

    for _ = 1, 5 do
        local ok, dataOrErr = pcall(function()
            return WEB.ws.receive(0)
        end)

        if not ok then
            WEB.lastError = tostring(dataOrErr)
            WEB.ws = nil
            WEB.connected = false
            WEB.authenticated = false
            return
        end

        if dataOrErr == nil then
            return
        end

        handleWebMessage(dataOrErr)
    end
end

local function webSendSnapshot(snapshot)
    if not snapshot or not CONFIG.web or CONFIG.web.sendSnapshots ~= true then return end

    webSend("snapshot", {
        deviceId = CONFIG.web.deviceId,
        sentAt = os.date("%Y-%m-%dT%H:%M:%S"),
        snapshot = snapshot,
    })
end

local function webStatus()
    return {
        enabled = CONFIG.web and CONFIG.web.enabled == true,
        connected = WEB.connected == true and WEB.ws ~= nil,
        authenticated = WEB.authenticated == true,
        lastError = WEB.lastError,
        lastMessageAt = WEB.lastMessageAt,
        lastSendAt = WEB.lastSendAt,
        reconnects = WEB.reconnects,
        configVersion = WEB.configVersion,
    }
end

local function amountByItemName(list, itemName)
    if type(list) ~= "table" or not itemName then return 0 end

    local total = 0

    for _, stack in pairs(list) do
        if type(stack) == "table" then
            local name = stack.name or stack.id

            if name == itemName then
                total = total + stackAmount(stack)
            end
        end
    end

    return total
end

local function roundDownTo(n, step)
    n = math.floor(tonumber(n) or 0)
    step = tonumber(step) or 1

    if step <= 1 then return n end

    return math.floor(n / step) * step
end

local function calcAutocraftReserve(rule, sourceAmount)
    local cfg = CONFIG.autocraft or {}

    sourceAmount = tonumber(sourceAmount) or 0

    -- Fixed per-rule reserve.
    -- Completely bypasses global reservePercent/reserveMin/reserveMax.
    --
    -- Example:
    -- fixedReserve = 5000
    -- or legacy alias:
    -- keepSource = 5000
    local fixedReserve = rule.fixedReserve
    if fixedReserve == nil then
        fixedReserve = rule.keepSource
    end

    if fixedReserve ~= nil then
        return clamp(tonumber(fixedReserve) or 0, 0, sourceAmount)
    end

    -- Per-rule dynamic reserve overrides global values.
    local reservePercent = tonumber(rule.reservePercent or cfg.reservePercent or 0) or 0
    local reserveMin = tonumber(rule.reserveMin or cfg.reserveMin or 0) or 0
    local reserveMax = tonumber(rule.reserveMax or cfg.reserveMax or sourceAmount) or sourceAmount

    local reserve = math.floor(sourceAmount * reservePercent + 0.5)

    if reserve < reserveMin then reserve = reserveMin end
    if reserve > reserveMax then reserve = reserveMax end

    return clamp(reserve, 0, sourceAmount)
end

local function makeAutocraftTargetFilter(rule, count)
    local filter = {
        name = rule.target,
        count = count,
    }

    if rule.targetNbt then
        filter.nbt = rule.targetNbt
    end

    if rule.targetFingerprint then
        filter.fingerprint = rule.targetFingerprint
        filter.name = nil
    end

    return filter
end

local function autocraftIsCrafting(rule)
    local filter = makeAutocraftTargetFilter(rule, 1)

    if has("isCrafting") then
        local value = call("isCrafting", filter)
        return value == true
    end

    if has("isItemCrafting") then
        local value = call("isItemCrafting", filter)
        return value == true
    end

    return false
end

local function autocraftIsCraftable(rule)
    local filter = makeAutocraftTargetFilter(rule, 1)

    if has("isCraftable") then
        local value = call("isCraftable", filter)
        if value ~= nil then return value == true end
    end

    if has("isItemCraftable") then
        local value = call("isItemCraftable", filter)
        if value ~= nil then return value == true end
    end

    -- Fallback для старых/нестабильных версий API:
    -- если прямой проверки нет, пробуем поставить job и доверяем craftItem.
    return true
end

local function buildAutocraftRows(itemList)
    local cfg = CONFIG.autocraft or {}
    local rows = {}

    for index, rule in ipairs(cfg.rules or {}) do
        local enabled = rule.enabled ~= false
        local sourceAmount = amountByItemName(itemList, rule.source)
        local targetAmount = amountByItemName(itemList, rule.target)
        local reserve = calcAutocraftReserve(rule, sourceAmount)
        local sourceToConvert = math.max(sourceAmount - reserve, 0)

        if rule.maxSourcePerJob then
            sourceToConvert = math.min(sourceToConvert, tonumber(rule.maxSourcePerJob) or sourceToConvert)
        end

        local outputCount = 0

		-- Preferred mode: whole recipe batches.
		-- Example: 8 essence -> 12 redstone
		-- sourcePerCraft = 8
		-- outputPerCraft = 12
		local sourcePerCraft = tonumber(rule.sourcePerCraft)
		local outputPerCraft = tonumber(rule.outputPerCraft)

		if sourcePerCraft and outputPerCraft and sourcePerCraft > 0 and outputPerCraft > 0 then
			local maxBatchesBySource = math.floor(sourceToConvert / sourcePerCraft)

			local maxOutputs = tonumber(rule.maxOutputsPerJob or cfg.maxOutputsPerJob)
			if maxOutputs and maxOutputs > 0 then
				local maxBatchesByOutput = math.floor(maxOutputs / outputPerCraft)
				maxBatchesBySource = math.min(maxBatchesBySource, maxBatchesByOutput)
			end

			if rule.targetLimit then
				local room = math.max((tonumber(rule.targetLimit) or 0) - targetAmount, 0)
				local maxBatchesByRoom = math.floor(room / outputPerCraft)
				maxBatchesBySource = math.min(maxBatchesBySource, maxBatchesByRoom)
			end

			outputCount = maxBatchesBySource * outputPerCraft
		else
			-- Legacy mode: ratio per one output.
			-- Works with decimals, but less exact for recipes like 8 -> 12.
			local sourcePerOutput = tonumber(rule.sourcePerOutput or 1) or 1
			if sourcePerOutput <= 0 then sourcePerOutput = 1 end

			outputCount = math.floor(sourceToConvert / sourcePerOutput)

			local maxOutputs = tonumber(rule.maxOutputsPerJob or cfg.maxOutputsPerJob or outputCount) or outputCount
			outputCount = math.min(outputCount, maxOutputs)

			if rule.targetLimit then
				local room = math.max((tonumber(rule.targetLimit) or 0) - targetAmount, 0)
				outputCount = math.min(outputCount, room)
			end

			outputCount = roundDownTo(outputCount, rule.roundTo or cfg.roundTo or 1)
		end

        local minOutputs = tonumber(rule.minOutputsPerJob or cfg.minOutputsPerJob or 1) or 1

        local state = "ready"
        local message = "ready"

        if not enabled then
            state = "disabled"
            message = "disabled"
        elseif sourceAmount <= reserve then
            state = "reserve"
            message = "reserve"
        elseif outputCount < minOutputs then
            state = "small"
            message = "below min"
        end

        table.insert(rows, {
            index = index,
            rule = rule,
            enabled = enabled,
            label = rule.label or rule.target or ("Rule " .. tostring(index)),
            source = rule.source,
            target = rule.target,
            sourceAmount = sourceAmount,
            targetAmount = targetAmount,
            reserve = reserve,
            sourceToConvert = sourceToConvert,
            outputCount = outputCount,
            state = state,
            message = message,
        })
    end

    return rows
end

local function processAutocraft(itemList)
    local cfg = CONFIG.autocraft or {}
    local rows = buildAutocraftRows(itemList)

    local result = {
        enabled = cfg.enabled == true,
        available = bridge ~= nil and has("craftItem"),
        rows = rows,
        lastStatus = AUTOCRAFT.lastStatus,
        lastError = AUTOCRAFT.lastError,
        history = AUTOCRAFT.history,
        nextRunSeconds = nil,
    }

    if cfg.enabled ~= true then
        result.lastStatus = "Disabled"
        return result
    end

    if not bridge or not has("craftItem") then
        AUTOCRAFT.lastError = "craftItem method is not available"
        result.lastStatus = AUTOCRAFT.lastError
        return result
    end

    local now = nowMillis()
    local intervalMs = (tonumber(cfg.intervalSeconds) or 30) * 1000
    local elapsed = now - (AUTOCRAFT.lastRunAt or 0)

    if not AUTOCRAFT.forceRun and elapsed < intervalMs then
        result.nextRunSeconds = math.ceil((intervalMs - elapsed) / 1000)
        result.lastStatus = AUTOCRAFT.lastStatus
        return result
    end

    AUTOCRAFT.forceRun = false
    AUTOCRAFT.lastRunAt = now
    AUTOCRAFT.lastError = nil

    local ruleCount = #rows

    if ruleCount == 0 then
        logAutocraft("No autocraft rules configured")
        result.lastStatus = AUTOCRAFT.lastStatus
        return result
    end

    if AUTOCRAFT.nextRuleIndex == nil
        or AUTOCRAFT.nextRuleIndex < 1
        or AUTOCRAFT.nextRuleIndex > ruleCount
    then
        AUTOCRAFT.nextRuleIndex = 1
    end

    local maxJobs = tonumber(cfg.maxJobsPerCycle) or 1
    local cooldownMs = (tonumber(cfg.perRuleCooldownSeconds) or 0) * 1000
    local started = 0
    local checked = 0
    local startIndex = AUTOCRAFT.nextRuleIndex

    -- Round-robin:
    -- начинаем не с rules[1], а с AUTOCRAFT.nextRuleIndex.
    -- После успешного запуска двигаем курсор на следующее правило.
    for step = 0, ruleCount - 1 do
        if started >= maxJobs then break end

        local index = ((startIndex + step - 2) % ruleCount) + 1
        local row = rows[index]

        checked = checked + 1

        if row then
            local rule = row.rule
            local cooldownUntil = AUTOCRAFT.ruleCooldownUntil[index] or 0

            if now < cooldownUntil then
				row.state = "cooldown"

				local cooldownLeft = math.ceil((cooldownUntil - now) / 1000)
				row.message = "cooldown " .. tostring(cooldownLeft) .. "s"
            elseif row.enabled and row.state == "ready" and row.outputCount > 0 then
                if autocraftIsCrafting(rule) then
                    row.state = "waiting"
                    row.message = "already crafting"

                    -- Не даём одному зависшему ресурсу блокировать очередь.
                    AUTOCRAFT.nextRuleIndex = (index % ruleCount) + 1
                elseif not autocraftIsCraftable(rule) then
                    row.state = "no_pattern"
                    row.message = "not craftable"

                    -- Если паттерна нет, тоже уходим дальше.
                    AUTOCRAFT.nextRuleIndex = (index % ruleCount) + 1
                else
                    local filter = makeAutocraftTargetFilter(rule, row.outputCount)
                    local job, err = call("craftItem", filter)

                    if job ~= nil and job ~= false then
                        started = started + 1
                        row.state = "started"
                        row.message = "started x" .. fmtNumber(row.outputCount)

                        if cooldownMs > 0 then
                            AUTOCRAFT.ruleCooldownUntil[index] = now + cooldownMs
                        end

                        -- Главный фикс:
                        -- следующий autocraft cycle начнётся со следующего правила.
                        AUTOCRAFT.nextRuleIndex = (index % ruleCount) + 1

                        logAutocraft(
                            row.label ..
                            ": started x" ..
                            fmtNumber(row.outputCount) ..
                            " | next rule #" ..
                            tostring(AUTOCRAFT.nextRuleIndex)
                        )
                    else
                        row.state = "error"
                        row.message = tostring(err or "craftItem failed")
                        AUTOCRAFT.lastError = row.label .. ": " .. row.message

                        -- Ошибочное правило не должно стопорить весь список.
                        AUTOCRAFT.nextRuleIndex = (index % ruleCount) + 1

                        logAutocraft(AUTOCRAFT.lastError)
                    end
                end
            end
        end
    end

    if started == 0 and not AUTOCRAFT.lastError then
        logAutocraft(
            "No autocraft jobs needed | next rule #" ..
            tostring(AUTOCRAFT.nextRuleIndex)
        )
    end

    result.lastStatus = AUTOCRAFT.lastStatus
    result.lastError = AUTOCRAFT.lastError
    result.nextRunSeconds = math.ceil(intervalMs / 1000)

    return result
end

local function autocraftStateColor(state)
    if state == "started" then return color("lime", "green") end
    if state == "ready" then return color("cyan") end
    if state == "waiting" then return color("yellow") end
    if state == "cooldown" then return color("orange", "yellow") end
    if state == "reserve" then return color("gray", "lightGray") end
    if state == "small" then return color("gray", "lightGray") end
    if state == "error" or state == "no_pattern" then return color("red") end
    if state == "disabled" then return color("gray", "lightGray") end
    return color("lightGray")
end

local function pushTpsSample(value)
    value = tonumber(value)
    if value == nil then return end

    -- Реальный TPS сервера выше 20 быть не должен.
    value = clamp(value, 0, 20)

    table.insert(TPS.samples, value)

    while #TPS.samples > TPS.maxSamples do
        table.remove(TPS.samples, 1)
    end

    TPS.current = value
end

local function getAverageTps()
    if #TPS.samples == 0 then
        return nil
    end

    local sum = 0

    for _, value in ipairs(TPS.samples) do
        sum = sum + value
    end

    return sum / #TPS.samples
end

local function fmtTps(value)
    value = tonumber(value)

    if value == nil then
        return "n/a"
    end

    return string.format("%.1f", value)
end

local function tpsColor(value)
    value = tonumber(value)

    if value == nil then
        return color("gray", "lightGray")
    elseif value >= 18 then
        return color("lime", "green")
    elseif value >= 15 then
        return color("yellow")
    elseif value >= 10 then
        return color("orange", "yellow")
    end

    return color("red")
end

local function startRefreshTimer(seconds)
    TPS.scheduledSeconds = tonumber(seconds) or 0
    TPS.startedAt = nowMillis()

    return os.startTimer(TPS.scheduledSeconds)
end

local function sampleTpsFromTimer()
    local scheduled = tonumber(TPS.scheduledSeconds)
    local startedAt = tonumber(TPS.startedAt)

    -- Первый таймер у нас мгновенный, его в TPS не считаем.
    if scheduled == nil or scheduled <= 0 or startedAt == nil then
        return
    end

    local realSeconds = (nowMillis() - startedAt) / 1000

    if realSeconds <= 0 then
        return
    end

    -- 20 тиков в секунду. Если таймер был на 5 секунд,
    -- он должен пройти за 100 игровых тиков.
    local expectedTicks = scheduled * 20
    local measuredTps = expectedTicks / realSeconds

    pushTpsSample(measuredTps)
end

local function pct(n)
    if n == nil then return nil end
    return clamp(n, 0, 1)
end

local function getCategoryTrendList(key)
    if key == "Item" then return TRENDS.items end
    if key == "Fluid" then return TRENDS.fluids end
    if key == "Chemical" then return TRENDS.chemicals end
    return nil
end

local function storageUsedPercent(data)
    if data and data.total and data.total > 0 then
        if data.used ~= nil then
            return pct(data.used / data.total)
        elseif data.free ~= nil then
            return pct(1 - (data.free / data.total))
        end
    end

    return nil
end

local function pushTrendSample(list, value, timestamp)
    value = tonumber(value)
    if value == nil then return end

    table.insert(list, {
        value = value,
        time = timestamp or nowMillis(),
    })

    while #list > TRENDS.maxSamples do
        table.remove(list, 1)
    end
end

local function getAverageRate(list)
    if type(list) ~= "table" or #list < 2 then
        return nil, #list or 0, nil
    end

    local first = list[1]
    local last = list[#list]

    local seconds = (last.time - first.time) / 1000
    if seconds <= 0 then
        return nil, #list, nil
    end

    local rate = (last.value - first.value) / seconds
    return rate, #list, seconds
end

local function fmtRateNumber(n)
    n = tonumber(n) or 0

    if n < 10 then
        return string.format("%.2f", n)
    elseif n < 100 then
        return string.format("%.1f", n)
    end

    return fmtNumber(n)
end

local function fmtRate(rate, unit)
    if rate == nil then
        return "n/a"
    end

    local sign = ""
    if rate > 0 then
        sign = "+"
    elseif rate < 0 then
        sign = "-"
    end

    local absRate = math.abs(rate)

    if unit == "mB" then
        if absRate >= 1000 then
            return sign .. fmtRateNumber(absRate / 1000) .. " buckets/s"
        end

        return sign .. fmtRateNumber(absRate) .. " mB/s"
    end

    return sign .. fmtRateNumber(absRate) .. " " .. unit .. "/s"
end

local function rateColor(rate)
    if rate == nil then return color("gray", "lightGray") end
    if rate > 0 then return color("lime", "green") end
    if rate < 0 then return color("red") end
    return color("lightGray")
end

local function fmtDuration(seconds)
    seconds = tonumber(seconds)

    if seconds == nil then return "n/a" end
    if seconds <= 0 then return "now" end

    local d = math.floor(seconds / 86400)
    seconds = seconds - d * 86400

    local h = math.floor(seconds / 3600)
    seconds = seconds - h * 3600

    local m = math.floor(seconds / 60)
    local s = math.floor(seconds - m * 60)

    if d > 0 then
        return string.format("%dd %02dh", d, h)
    elseif h > 0 then
        return string.format("%dh %02dm", h, m)
    elseif m > 0 then
        return string.format("%dm %02ds", m, s)
    end

    return tostring(s) .. "s"
end

local function getForecast(data, rate)
    if not data or rate == nil then
        return {
            text = "Forecast: n/a",
            seconds = nil,
            mode = "none",
        }
    end

    if math.abs(rate) < 0.0001 then
        return {
            text = "Forecast: stable",
            seconds = nil,
            mode = "stable",
        }
    end

    if data.total == nil or data.used == nil then
        return {
            text = "Forecast: n/a",
            seconds = nil,
            mode = "none",
        }
    end

    if rate > 0 then
        local free = data.free
        if free == nil then
            free = data.total - data.used
        end

        if free <= 0 then
            return {
                text = "Full: now",
                seconds = 0,
                mode = "full",
            }
        end

        local seconds = free / rate

        return {
            text = "Full in: " .. fmtDuration(seconds),
            seconds = seconds,
            mode = "full",
        }
    end

    local used = data.used or 0

    if used <= 0 then
        return {
            text = "Empty: now",
            seconds = 0,
            mode = "empty",
        }
    end

    local seconds = used / math.abs(rate)

    return {
        text = "Empty in: " .. fmtDuration(seconds),
        seconds = seconds,
        mode = "empty",
    }
end

local function updateSessionStat(key, value, rate)
    local stat = SESSION[key]
    value = tonumber(value)

    if not stat or value == nil then return end

    if stat.min == nil or value < stat.min then stat.min = value end
    if stat.max == nil or value > stat.max then stat.max = value end

    if rate ~= nil then
        if rate > 0 and (stat.peakUp == nil or rate > stat.peakUp) then
            stat.peakUp = rate
        elseif rate < 0 and (stat.peakDown == nil or rate < stat.peakDown) then
            stat.peakDown = rate
        end
    end
end

local function fillRect(x, y, w, h, bg)
    if w <= 0 or h <= 0 then return end

    setBg(bg or color("black"))
    setFg(bg or color("black"))

    local line = string.rep(" ", w)

    for yy = y, y + h - 1 do
        screen.setCursorPos(x, yy)
        screen.write(line)
    end

    setBg(color("black"))
    setFg(color("white"))
end

local function textAt(x, y, text, fg, bg, maxW)
    local w, h = screen.getSize()
    if y < 1 or y > h or x > w then return end

    text = tostring(text or "")

    local available = w - x + 1
    local limit = maxW or available
    limit = math.min(limit, available)

    if limit <= 0 then return end

    text = text:sub(1, limit)

    setBg(bg or color("black"))
    setFg(fg or color("white"))

    screen.setCursorPos(x, y)
    screen.write(text)

    setBg(color("black"))
    setFg(color("white"))
end

local function drawBox(x, y, w, h, title, borderColor, bgColor)
    if w < 4 or h < 3 then return end

    borderColor = borderColor or color("gray", "lightGray")
    bgColor = bgColor or color("black")

    fillRect(x, y, w, h, bgColor)

    textAt(x, y, "+" .. string.rep("-", w - 2) .. "+", borderColor, bgColor, w)
    for yy = y + 1, y + h - 2 do
        textAt(x, yy, "|", borderColor, bgColor, 1)
        textAt(x + w - 1, yy, "|", borderColor, bgColor, 1)
    end
    textAt(x, y + h - 1, "+" .. string.rep("-", w - 2) .. "+", borderColor, bgColor, w)

    if title and title ~= "" then
        local label = " " .. title .. " "
        textAt(x + 2, y, label:sub(1, w - 4), borderColor, bgColor, w - 4)
    end
end

local function fitPair(left, right, width)
    left = tostring(left or "")
    right = tostring(right or "")

    if #left + #right + 1 > width then
        local leftMax = math.max(1, width - #right - 1)
        left = left:sub(1, leftMax)
    end

    local spaces = math.max(1, width - #left - #right)
    return left .. string.rep(" ", spaces) .. right
end

local function drawProgressBar(x, y, w, value, fgGood, fgWarn, fgBad)
    if w <= 0 then return end

    local bg = color("gray", "lightGray")
    local fillColor = color("green")

    if value == nil then
        fillRect(x, y, w, 1, bg)
        textAt(x + 1, y, "n/a", color("white"), bg, w - 2)
        return
    end

    value = pct(value)

    if value >= 0.95 then
        fillColor = fgBad or color("red")
    elseif value >= 0.80 then
        fillColor = fgWarn or color("orange", "yellow")
    else
        fillColor = fgGood or color("lime", "green")
    end

    local filled = math.floor(w * value + 0.5)
    local empty = w - filled

    if filled > 0 then fillRect(x, y, filled, 1, fillColor) end
    if empty > 0 then fillRect(x + filled, y, empty, 1, bg) end

    local label = string.format("%3d%%", math.floor(value * 100 + 0.5))
    local labelX = x + math.floor((w - #label) / 2)
    local labelBg = bg

    if filled >= w / 2 then
        labelBg = fillColor
    end

    textAt(labelX, y, label, color("black"), labelBg, #label)
end

local function readStorageDetailed(def)
    local total = firstNumber({ "getTotal" .. def.key .. "Storage" })
    local used = firstNumber({ "getUsed" .. def.key .. "Storage" })
    local free = firstNumber({ "getAvailable" .. def.key .. "Storage" })

    if total == nil and def.legacyMax then
        total = firstNumber({ def.legacyMax })
    end

    local list = getList(def.listNew, def.listOld)

    if used == nil then
        used = sumAmounts(list)
    end

    if free == nil and total ~= nil and used ~= nil then
        free = math.max(total - used, 0)
    end

    return {
        title = def.title,
        key = def.key,
        unit = def.unit,
        total = total,
        used = used,
        free = free,
        typeCount = countPairs(list),
        list = list,
    }
end

local function stackLabel(stack)
    if type(stack) ~= "table" then return nil end

    return stack.displayName
        or stack.label
        or stack.name
        or stack.id
        or stack.fluid
        or stack.chemical
        or "unknown"
end

local function stackKey(stack)
    if type(stack) ~= "table" then return nil end

    local base = stack.name
        or stack.id
        or stack.fluid
        or stack.chemical
        or stack.displayName
        or stack.label

    if not base then return nil end

    local nbt = stack.nbt or stack.nbtHash or stack.damage or stack.metadata or ""
    return tostring(base) .. "#" .. tostring(nbt)
end

local function updateResourceTrends(categoryKey, list, timestamp)
    local tracked = RESOURCE_TRENDS[categoryKey]
    local def = RESOURCE_DEFS_BY_KEY[categoryKey]

    if type(tracked) ~= "table" or type(list) ~= "table" or not def then
        return
    end

    local amounts = {}
    local labels = {}

    for _, stack in pairs(list) do
        local key = stackKey(stack)

        if key then
            local amount = stackAmount(stack)
            amounts[key] = (amounts[key] or 0) + amount
            labels[key] = stackLabel(stack) or key
        end
    end

    for key, amount in pairs(amounts) do
        if not tracked[key] then
            tracked[key] = {
                label = labels[key] or key,
                unit = def.unit,
                samples = {
                    {
                        value = 0,
                        time = timestamp - (CONFIG.refreshSeconds * 1000),
                    },
                },
                lastSeen = sampleIndex,
            }
        end

        tracked[key].label = labels[key] or tracked[key].label
        tracked[key].unit = def.unit
    end

    for key, entry in pairs(tracked) do
        local amount = amounts[key] or 0

        pushTrendSample(entry.samples, amount, timestamp)

        if amount > 0 then
            entry.lastSeen = sampleIndex
        end

        if amount == 0 and entry.lastSeen and sampleIndex - entry.lastSeen > TRENDS.maxSamples * 2 then
            tracked[key] = nil
        end
    end
end

local function getTopResourceRates(categoryKey, direction, limit)
    local result = {}
    local keys = {}

    if categoryKey then
        table.insert(keys, categoryKey)
    else
        table.insert(keys, "Item")
        table.insert(keys, "Fluid")
        table.insert(keys, "Chemical")
    end

    for _, key in ipairs(keys) do
        local tracked = RESOURCE_TRENDS[key]

        for _, entry in pairs(tracked) do
            local rate = getAverageRate(entry.samples)

            if rate ~= nil then
                local keep = false

                if direction == "up" and rate > 0.0001 then
                    keep = true
                elseif direction == "down" and rate < -0.0001 then
                    keep = true
                end

                if keep then
                    local prefix = "?"
                    if key == "Item" then prefix = "I" end
                    if key == "Fluid" then prefix = "F" end
                    if key == "Chemical" then prefix = "C" end

                    table.insert(result, {
                        label = "[" .. prefix .. "] " .. tostring(entry.label),
                        rate = rate,
                        unit = entry.unit,
                        categoryKey = key,
                    })
                end
            end
        end
    end

    table.sort(result, function(a, b)
        if direction == "up" then
            return a.rate > b.rate
        end

        return a.rate < b.rate
    end)

    while #result > limit do
        table.remove(result)
    end

    return result
end

local function buildAlerts(snapshot)
    local alerts = {}

    local function add(severity, text)
        table.insert(alerts, {
            severity = severity,
            text = text,
        })
    end

    if not snapshot.bridgeFound then
        add("CRITICAL", "RS Bridge not found")
        return alerts
    end

    if snapshot.connected == false then
        add("CRITICAL", "RS Bridge disconnected")
    end

    if snapshot.online == false then
        add("CRITICAL", "RS Bridge offline")
    end

    for _, data in ipairs(snapshot.storages or {}) do
        local usedPct = storageUsedPercent(data)
        local trendList = getCategoryTrendList(data.key)
        local rate = getAverageRate(trendList)
        local forecast = getForecast(data, rate)

        if usedPct ~= nil then
            if usedPct >= CONFIG.alarmCriticalStorage then
                add("CRITICAL", data.title .. " storage critical: " .. string.format("%.1f%% used", usedPct * 100))
            elseif usedPct >= CONFIG.alarmWarningStorage then
                add("WARNING", data.title .. " storage high: " .. string.format("%.1f%% used", usedPct * 100))
            end
        end

        if forecast.mode == "full" and forecast.seconds ~= nil then
            if forecast.seconds <= CONFIG.alarmForecastCriticalSeconds then
                add("CRITICAL", data.title .. " will fill in " .. fmtDuration(forecast.seconds))
            elseif forecast.seconds <= CONFIG.alarmForecastWarningSeconds then
                add("WARNING", data.title .. " will fill in " .. fmtDuration(forecast.seconds))
            end
        end
    end

    return alerts
end

local function highestSeverity(alerts)
    local hasWarning = false

    for _, alert in ipairs(alerts or {}) do
        if alert.severity == "CRITICAL" then
            return "CRITICAL"
        elseif alert.severity == "WARNING" then
            hasWarning = true
        end
    end

    if hasWarning then return "WARNING" end
    return nil
end

local function processAlarms(alerts)
    if not CONFIG.alarmSpeaker or not speaker or #alerts == 0 then
        return
    end

    local now = nowMillis()
    if now - lastAlarmAt < CONFIG.alarmCooldownSeconds * 1000 then
        return
    end

    local severity = highestSeverity(alerts)
    if not severity then return end

    lastAlarmAt = now

    if severity == "CRITICAL" then
        if speaker.playSound then
            pcall(speaker.playSound, "minecraft:block.note_block.bass", CONFIG.alarmVolume, 0.6)
        elseif speaker.playNote then
            pcall(speaker.playNote, "bass", CONFIG.alarmVolume, 5)
        end
    else
        if speaker.playSound then
            pcall(speaker.playSound, "minecraft:block.note_block.pling", CONFIG.alarmVolume, 1.4)
        elseif speaker.playNote then
            pcall(speaker.playNote, "pling", CONFIG.alarmVolume, 12)
        end
    end
end

local function collectSnapshot()
    sampleIndex = sampleIndex + 1

    if not bridge then
        local snapshot = {
            bridgeFound = false,
            error = "RS Bridge not found",
        fetchedAt = os.date("%H:%M:%S"),
        storages = {},
        externalStorages = {},
        alerts = {},
        tps = getAverageTps(),
        web = webStatus(),
			autocraft = processAutocraft(nil),
        }

        snapshot.alerts = buildAlerts(snapshot)
        return snapshot
    end

    local sampleTime = nowMillis()

    local snapshot = {
        bridgeFound = true,
        bridgeName = bridgeName,
        bridgeType = bridgeType,
        connected = nil,
        online = nil,
        energy = nil,
        storages = {},
        externalStorages = {},
        cells = nil,
        fetchedAt = os.date("%H:%M:%S"),
        alerts = {},
        topGrowing = {},
        topDecreasing = {},
        session = SESSION,
        tps = getAverageTps(),
        web = webStatus(),
		autocraft = nil,
    }

    if has("isConnected") then
        snapshot.connected = call("isConnected")
    end

    if has("isOnline") then
        snapshot.online = call("isOnline")
    end

    snapshot.energy = readEnergy()
	local itemListForAutocraft = nil
    for _, def in ipairs(RESOURCE_TYPES) do
        local data = readStorageDetailed(def)
		if data.key == "Item" then
			itemListForAutocraft = data.list
		end
        table.insert(snapshot.storages, data)

        local categoryTrend = getCategoryTrendList(data.key)
        if categoryTrend then
            pushTrendSample(categoryTrend, data.used, sampleTime)
            local rate = getAverageRate(categoryTrend)
            updateSessionStat(data.key, data.used, rate)
            data.usedPercent = storageUsedPercent(data)
            data.rate = rate
            data.forecast = getForecast(data, rate)
        end

        updateResourceTrends(data.key, data.list, sampleTime)

        -- Do not keep huge lists in snapshot after top calculations.
        data.list = nil

        local external = readExternalStorage(def)
        if external then
            table.insert(snapshot.externalStorages, external)
        end
    end

    if snapshot.energy and snapshot.energy.stored ~= nil then
        pushTrendSample(TRENDS.energy, snapshot.energy.stored, sampleTime)
        local energyRate = getAverageRate(TRENDS.energy)
        updateSessionStat("Energy", snapshot.energy.stored, energyRate)
    end

    snapshot.cells = readCells()
	snapshot.autocraft = processAutocraft(itemListForAutocraft)
    snapshot.topGrowing = getTopResourceRates(nil, "up", CONFIG.topRows + 4)
    snapshot.topDecreasing = getTopResourceRates(nil, "down", CONFIG.topRows + 4)
    snapshot.tps = getAverageTps()
    snapshot.web = webStatus()
    snapshot.alerts = buildAlerts(snapshot)

    return snapshot
end

local function registerButton(id, x, y, w, h, label, selected, onClick)
    table.insert(BUTTONS, {
        id = id,
        x = x,
        y = y,
        w = w,
        h = h,
        label = label,
        onClick = onClick,
    })

    local bg = selected and color("cyan") or color("gray", "lightGray")
    local fg = selected and color("black") or color("white")
    fillRect(x, y, w, h, bg)

    local text = tostring(label or "")
    local tx = x + math.floor((w - #text) / 2)
    if tx < x then tx = x end

    textAt(tx, y, text, fg, bg, w)
end

local function setPage(index)
    if index < 1 then
        index = #PAGES
    elseif index > #PAGES then
        index = 1
    end

    currentPage = index
end

local function drawHeader(snapshot)
    local w, h = screen.getSize()

    fillRect(1, 1, w, 3, color("gray", "lightGray"))

    local statusText = "ONLINE"
    local statusColor = color("lime", "green")

    if not snapshot.bridgeFound or snapshot.online == false or snapshot.connected == false then
        statusText = "ALARM"
        statusColor = color("red")
    elseif snapshot.online == nil and snapshot.connected == nil then
        statusText = "UNKNOWN"
        statusColor = color("yellow")
    elseif #(snapshot.alerts or {}) > 0 then
        statusText = highestSeverity(snapshot.alerts) or "WARNING"
        statusColor = statusText == "CRITICAL" and color("red") or color("yellow")
    end

    textAt(3, 1, "REFINED STORAGE DASHBOARD", color("cyan"), color("gray", "lightGray"), w - 4)
    textAt(w - #statusText - 2, 1, statusText, statusColor, color("gray", "lightGray"), #statusText)

    local bridgeText = "Bridge: n/a"
    if snapshot.bridgeFound then
        bridgeText = tostring(snapshot.bridgeName) .. " / " .. tostring(snapshot.bridgeType)
    end

    local webText = ""
    if snapshot.web and snapshot.web.enabled then
        webText = snapshot.web.connected and " | Web: connected" or " | Web: offline"
    end

    textAt(3, 2, bridgeText .. webText, color("white"), color("gray", "lightGray"), w - 6)

    if CONFIG.alarmVisual and #(snapshot.alerts or {}) > 0 then
        local alert = snapshot.alerts[1]
        local bg = alert.severity == "CRITICAL" and color("red") or color("orange", "yellow")
        local fg = alert.severity == "CRITICAL" and color("white") or color("black")

        fillRect(1, 3, w, 1, bg)
        textAt(3, 3, alert.severity .. ": " .. alert.text, fg, bg, w - 6)
    else
        textAt(3, 3, "Page: " .. PAGES[currentPage], color("lightGray"), color("gray", "lightGray"), w - 6)
    end
end

local function drawNavBar()
    local w, h = screen.getSize()
    BUTTONS = {}

    local y = 4

    registerButton("prev", 2, y, 8, 1, "< Prev", false, function()
        setPage(currentPage - 1)
    end)

    registerButton("next", w - 9, y, 8, 1, "Next >", false, function()
        setPage(currentPage + 1)
    end)

    local x = 12
    local maxX = w - 11

    for i, name in ipairs(PAGES) do
        local pageNo = i
        local bw = math.min(#name + 2, 13)

        if x + bw <= maxX then
            registerButton("page_" .. tostring(i), x, y, bw, 1, name, i == currentPage, function()
                setPage(pageNo)
            end)

            x = x + bw + 1
        end
    end
end

local function handleTouch(x, y)
    for _, button in ipairs(BUTTONS) do
        if x >= button.x
            and x <= button.x + button.w - 1
            and y >= button.y
            and y <= button.y + button.h - 1
        then
            if button.onClick then
                button.onClick()
                return true
            end
        end
    end

    return false
end

local function drawStorageCard(x, y, w, h, data, trendList)
    local usedPct = storageUsedPercent(data)
    local freePct = usedPct and (1 - usedPct) or nil

    local rate, samples, seconds = getAverageRate(trendList)
    local forecast = getForecast(data, rate)
    local session = SESSION[data.key]

    local border = colorByUsedPercent(usedPct)
    drawBox(x, y, w, h, data.title, border, color("black"))

    local innerX = x + 2
    local innerW = w - 4
    local line = y + 1
    local lastLine = y + h - 2 -- последняя строка внутри рамки

    local function hasSpace(lines)
        return line + (lines or 1) - 1 <= lastLine
    end

    local function put(left, right, fg)
        if not hasSpace(1) then return false end

        textAt(
            innerX,
            line,
            fitPair(left, right, innerW),
            fg or color("lightGray"),
            color("black"),
            innerW
        )

        line = line + 1
        return true
    end

    local function putText(text, fg)
        if not hasSpace(1) then return false end

        textAt(
            innerX,
            line,
            tostring(text),
            fg or color("lightGray"),
            color("black"),
            innerW
        )

        line = line + 1
        return true
    end

    put("Free", fmtValue(data.free, data.unit), color("white"))
    put("Used", fmtValue(data.used, data.unit), color("lightGray"))
    put("Total", fmtValue(data.total, data.unit), color("lightGray"))
    put("Types", data.typeCount or "n/a", color("cyan"))

    if hasSpace(1) then
        drawProgressBar(innerX, line, innerW, usedPct)
        line = line + 1
    end

    local freeLabel = "Free: n/a"
    if freePct ~= nil then
        freeLabel = "Free: " .. string.format("%.1f%%", freePct * 100)
    end

    putText(freeLabel, color("lightGray"))

    put("Avg", fmtRate(rate, data.unit), rateColor(rate))

    local forecastColor = color("lightGray")
    if forecast.mode == "full" then
        forecastColor = color("orange", "yellow")
        if forecast.seconds ~= nil and forecast.seconds <= CONFIG.alarmForecastCriticalSeconds then
            forecastColor = color("red")
        end
    elseif forecast.mode == "empty" then
        forecastColor = color("yellow")
    end

    putText(forecast.text, forecastColor)

    local windowText = tostring(samples) .. "/" .. tostring(TRENDS.maxSamples)
    if seconds ~= nil then
        windowText = windowText .. ", " .. string.format("%.0f", seconds) .. "s"
    end

    put("Window", windowText, color("gray", "lightGray"))

    -- Session-блок показываем только если осталось достаточно места.
    -- Иначе карточка не будет ломать рамку.
    if session and hasSpace(3) then
        put("Min", fmtValue(session.min, data.unit), color("lightGray"))
        put("Max", fmtValue(session.max, data.unit), color("lightGray"))

        local up = session.peakUp and fmtRate(session.peakUp, data.unit) or "n/a"
        local down = session.peakDown and fmtRate(session.peakDown, data.unit) or "n/a"

        putText("Peak: " .. up .. " / " .. down, color("gray", "lightGray"))
    elseif session and hasSpace(1) then
        -- Компактная версия, если места мало.
        local up = session.peakUp and fmtRate(session.peakUp, data.unit) or "n/a"
        put("Peak", up, color("gray", "lightGray"))
    end
end

local function drawEnergyCard(x, y, w, h, energy)
    drawBox(x, y, w, h, "Energy", color("cyan"), color("black"))

    local innerX = x + 2
    local innerW = w - 4
    local line = y + 1

    if not energy then
        textAt(innerX, line, "No energy API", color("gray", "lightGray"), color("black"), innerW)
        return
    end

    local rate, samples, seconds = getAverageRate(TRENDS.energy)
    local session = SESSION.Energy

    textAt(innerX, line, fitPair("Stored", fmtValue(energy.stored, "FE"), innerW), color("white"), color("black"), innerW)
    line = line + 1

    textAt(innerX, line, fitPair("Capacity", fmtValue(energy.capacity, "FE"), innerW), color("lightGray"), color("black"), innerW)
    line = line + 1

    textAt(innerX, line, fitPair("Usage", fmtValue(energy.usage, "FE/t"), innerW), color("lightGray"), color("black"), innerW)
    line = line + 1

    local ePct = nil
    if energy.stored ~= nil and energy.capacity ~= nil and energy.capacity > 0 then
        ePct = pct(energy.stored / energy.capacity)
    end

    drawProgressBar(innerX, line, innerW, ePct, color("cyan"), color("yellow"), color("red"))
    line = line + 2

    textAt(innerX, line, fitPair("Avg change", fmtRate(rate, "FE"), innerW), rateColor(rate), color("black"), innerW)
    line = line + 1

    local windowText = "Window: " .. tostring(samples) .. "/" .. tostring(TRENDS.maxSamples)
    if seconds ~= nil then
        windowText = windowText .. ", " .. string.format("%.0f", seconds) .. "s"
    end

    textAt(innerX, line, windowText, color("gray", "lightGray"), color("black"), innerW)
    line = line + 1

    textAt(innerX, line, fitPair("Session min", fmtValue(session.min, "FE"), innerW), color("lightGray"), color("black"), innerW)
    line = line + 1

    textAt(innerX, line, fitPair("Session max", fmtValue(session.max, "FE"), innerW), color("lightGray"), color("black"), innerW)
    line = line + 1

    local up = session.peakUp and fmtRate(session.peakUp, "FE") or "n/a"
    local down = session.peakDown and fmtRate(session.peakDown, "FE") or "n/a"

    textAt(innerX, line, "Peak: " .. up .. " / " .. down, color("gray", "lightGray"), color("black"), innerW)
end

local function drawSystemCard(x, y, w, h, snapshot)
    drawBox(x, y, w, h, "System", color("cyan"), color("black"))

    local innerX = x + 2
    local innerW = w - 4
    local line = y + 1

    local statusColor = color("lime", "green")
    if snapshot.connected == false or snapshot.online == false then
        statusColor = color("red")
    end

    textAt(innerX, line, fitPair("Connected", boolText(snapshot.connected), innerW), statusColor, color("black"), innerW)
    line = line + 1

    textAt(innerX, line, fitPair("Online", boolText(snapshot.online), innerW), statusColor, color("black"), innerW)
    line = line + 1

    textAt(innerX, line, "Bridge:", color("lightGray"), color("black"), innerW)
    line = line + 1

    textAt(innerX, line, tostring(snapshot.bridgeName), color("white"), color("black"), innerW)
    line = line + 1

    textAt(innerX, line, tostring(snapshot.bridgeType), color("gray", "lightGray"), color("black"), innerW)
    line = line + 2

    if snapshot.cells then
        textAt(innerX, line, "Cells: " .. tostring(snapshot.cells.count), color("white"), color("black"), innerW)
        line = line + 1

        if snapshot.cells.statesText and snapshot.cells.statesText ~= "" then
            textAt(innerX, line, snapshot.cells.statesText, color("lightGray"), color("black"), innerW)
            line = line + 1
        end
    else
        textAt(innerX, line, "Cells: n/a", color("gray", "lightGray"), color("black"), innerW)
        line = line + 1
    end

    textAt(innerX, y + h - 2, "Fetched: " .. tostring(snapshot.fetchedAt), color("gray", "lightGray"), color("black"), innerW)
end

local function drawTopList(x, y, w, h, title, rows)
    drawBox(x, y, w, h, title, color("cyan"), color("black"))

    local innerX = x + 2
    local innerW = w - 4
    local line = y + 1

    if #rows == 0 then
        textAt(innerX, line, "No trend data yet", color("gray", "lightGray"), color("black"), innerW)
        return
    end

    for i, row in ipairs(rows) do
        if line >= y + h - 1 then break end

        local labelW = math.max(8, innerW - 18)
        local label = tostring(row.label):sub(1, labelW)
        local rateText = fmtRate(row.rate, row.unit)

        textAt(
            innerX,
            line,
            fitPair(label, rateText, innerW),
            rateColor(row.rate),
            color("black"),
            innerW
        )

        line = line + 1
    end
end

local function drawOverviewPage(snapshot, contentY, contentH)
    local w, h = screen.getSize()

    local gap = 1
    local cardW = math.floor((w - 4 - gap * 2) / 3)
    local cardH = math.min(16, math.max(12, math.floor(contentH * 0.68)))

    local x1 = 2
    local x2 = x1 + cardW + gap
    local x3 = x2 + cardW + gap

    local storageByKey = {}
    for _, data in ipairs(snapshot.storages) do
        storageByKey[data.key] = data
    end

    drawStorageCard(x1, contentY, cardW, cardH, storageByKey.Item or {
        title = "Items",
        key = "Item",
        unit = "items",
    }, TRENDS.items)

    drawStorageCard(x2, contentY, cardW, cardH, storageByKey.Fluid or {
        title = "Fluids",
        key = "Fluid",
        unit = "mB",
    }, TRENDS.fluids)

    drawStorageCard(x3, contentY, w - x3 - 1, cardH, storageByKey.Chemical or {
        title = "Chemicals",
        key = "Chemical",
        unit = "mB",
    }, TRENDS.chemicals)

    local bottomY = contentY + cardH + 1
    local bottomH = contentY + contentH - bottomY

    if bottomH >= 7 then
        local systemW = math.floor((w - 3) * 0.40)
        drawSystemCard(2, bottomY, systemW, bottomH, snapshot)
        drawEnergyCard(3 + systemW, bottomY, w - systemW - 4, bottomH, snapshot.energy)
    end
end

local function drawCategoryPage(snapshot, categoryKey, contentY, contentH)
    local w, h = screen.getSize()

    local storageData = nil
    for _, data in ipairs(snapshot.storages) do
        if data.key == categoryKey then
            storageData = data
            break
        end
    end

    local trendList = getCategoryTrendList(categoryKey)
    local def = RESOURCE_DEFS_BY_KEY[categoryKey]

    storageData = storageData or {
        title = def and def.title or categoryKey,
        key = categoryKey,
        unit = def and def.unit or "items",
    }

    local leftW = math.floor((w - 4) * 0.42)
    local rightX = 3 + leftW
    local rightW = w - rightX - 1

    drawStorageCard(2, contentY, leftW, contentH, storageData, trendList)

    local boxH = math.floor((contentH - 1) / 2)

    drawTopList(
        rightX,
        contentY,
        rightW,
        boxH,
        "Top growing " .. storageData.title,
        getTopResourceRates(categoryKey, "up", CONFIG.topRows)
    )

    drawTopList(
        rightX,
        contentY + boxH + 1,
        rightW,
        contentH - boxH - 1,
        "Top decreasing " .. storageData.title,
        getTopResourceRates(categoryKey, "down", CONFIG.topRows)
    )
end

local function drawTopPage(snapshot, contentY, contentH)
    local w, h = screen.getSize()

    local leftW = math.floor((w - 5) / 2)
    local rightX = 3 + leftW
    local rightW = w - rightX - 1

    drawTopList(
        2,
        contentY,
        leftW,
        contentH,
        "Top growing resources",
        getTopResourceRates(nil, "up", CONFIG.topRows + 4)
    )

    drawTopList(
        rightX,
        contentY,
        rightW,
        contentH,
        "Top decreasing resources",
        getTopResourceRates(nil, "down", CONFIG.topRows + 4)
    )
end

local function drawAutocraftPage(snapshot, contentY, contentH)
    local w, h = screen.getSize()
    local ac = snapshot.autocraft or {}

    drawBox(2, contentY, w - 3, contentH, "Autocraft", color("cyan"), color("black"))

    local innerX = 4
    local innerW = w - 7
    local line = contentY + 1

    local enabledText = CONFIG.autocraft.enabled and "ON" or "OFF"
    local availableText = ac.available and "craftItem OK" or "craftItem missing"

    textAt(
        innerX,
        line,
        "Autocraft: " .. enabledText .. " | " .. availableText .. " | Last: " .. tostring(ac.lastStatus or "n/a"),
        CONFIG.autocraft.enabled and color("lime", "green") or color("yellow"),
        color("black"),
        innerW
    )
    line = line + 1

    local nextText = ac.nextRunSeconds and ("Next check: " .. tostring(ac.nextRunSeconds) .. "s") or "Next check: now"
    textAt(innerX, line, nextText, color("gray", "lightGray"), color("black"), innerW)
    line = line + 1

    registerButton(
        "ac_toggle",
        innerX,
        line,
        12,
        1,
        CONFIG.autocraft.enabled and "Disable" or "Enable",
        CONFIG.autocraft.enabled,
        function()
            CONFIG.autocraft.enabled = not CONFIG.autocraft.enabled
            AUTOCRAFT.forceRun = true
            logAutocraft("Autocraft " .. (CONFIG.autocraft.enabled and "enabled" or "disabled"))
        end
    )

    registerButton(
        "ac_run_now",
        innerX + 14,
        line,
        10,
        1,
        "Run now",
        false,
        function()
            AUTOCRAFT.forceRun = true
            logAutocraft("Manual run queued")
        end
    )

    registerButton(
        "ac_prev_rules",
        w - 24,
        line,
        10,
        1,
        "< Rules",
        false,
        function()
            AUTOCRAFT.ruleOffset = math.max((AUTOCRAFT.ruleOffset or 0) - 10, 0)
        end
    )

    registerButton(
        "ac_next_rules",
        w - 13,
        line,
        10,
        1,
        "Rules >",
        false,
        function()
            AUTOCRAFT.ruleOffset = (AUTOCRAFT.ruleOffset or 0) + 10
        end
    )

    line = line + 2

    textAt(
        innerX,
        line,
        "Rule                Essence      Reserve      Craft target         State",
        color("cyan"),
        color("black"),
        innerW
    )
    line = line + 1

    local rows = ac.rows or {}
    local visible = math.max(contentH - 9, 1)

    if AUTOCRAFT.ruleOffset >= #rows then
        AUTOCRAFT.ruleOffset = math.max(#rows - visible, 0)
    end

    local first = (AUTOCRAFT.ruleOffset or 0) + 1
    local last = math.min(#rows, first + visible - 1)

    for i = first, last do
        local row = rows[i]
        if not row then break end

        if line >= contentY + contentH - 2 then break end

        registerButton(
            "ac_rule_toggle_" .. tostring(i),
            innerX,
            line,
            4,
            1,
            row.enabled and "ON" or "OFF",
            row.enabled,
            function()
                row.rule.enabled = not row.rule.enabled
                AUTOCRAFT.forceRun = true
                logAutocraft((row.rule.label or row.rule.target or "Rule") .. " " .. (row.rule.enabled and "enabled" or "disabled"))
            end
        )

        local label = tostring(row.label):sub(1, 14)
        local essence = fmtNumber(row.sourceAmount)
        local reserve = fmtNumber(row.reserve)
        local craft = tostring(row.target):sub(1, 18) .. " x" .. fmtNumber(row.outputCount)
        local state = tostring(row.message or row.state)

        local text =
            string.format(
                "%-14s %11s %11s %-24s %s",
                label,
                essence,
                reserve,
                craft,
                state
            )

        textAt(
            innerX + 5,
            line,
            text,
            autocraftStateColor(row.state),
            color("black"),
            innerW - 5
        )

        line = line + 1
    end

    local historyY = contentY + contentH - 2
    if ac.history and ac.history[1] then
        textAt(innerX, historyY, "History: " .. tostring(ac.history[1]), color("gray", "lightGray"), color("black"), innerW)
    end
end

local function drawAlertsPage(snapshot, contentY, contentH)
    local w, h = screen.getSize()

    drawBox(2, contentY, w - 3, contentH, "Alerts", color("cyan"), color("black"))

    local innerX = 4
    local innerW = w - 7
    local line = contentY + 1

    if #(snapshot.alerts or {}) == 0 then
        textAt(innerX, line, "No active alerts", color("lime", "green"), color("black"), innerW)
        line = line + 2
    else
        for _, alert in ipairs(snapshot.alerts) do
            if line >= contentY + contentH - 6 then break end

            local c = alert.severity == "CRITICAL" and color("red") or color("yellow")
            textAt(innerX, line, alert.severity .. ": " .. alert.text, c, color("black"), innerW)
            line = line + 1
        end

        line = line + 1
    end

    textAt(innerX, line, "Alarm settings", color("cyan"), color("black"), innerW)
    line = line + 1

    textAt(
        innerX,
        line,
        "Storage warning: " .. string.format("%.0f%%", CONFIG.alarmWarningStorage * 100) ..
        " | critical: " .. string.format("%.0f%%", CONFIG.alarmCriticalStorage * 100),
        color("lightGray"),
        color("black"),
        innerW
    )
    line = line + 1

    textAt(
        innerX,
        line,
        "Forecast warning: " .. fmtDuration(CONFIG.alarmForecastWarningSeconds) ..
        " | critical: " .. fmtDuration(CONFIG.alarmForecastCriticalSeconds),
        color("lightGray"),
        color("black"),
        innerW
    )
    line = line + 1

    textAt(
        innerX,
        line,
        "Speaker: " .. tostring(CONFIG.alarmSpeaker and speaker ~= nil) ..
        " | cooldown: " .. tostring(CONFIG.alarmCooldownSeconds) .. "s",
        color("lightGray"),
        color("black"),
        innerW
    )
end

local function drawSmallLayout(snapshot)
    clearScreen()

    local w, h = screen.getSize()

    if not snapshot.bridgeFound then
        writeLine(1, "RS Bridge not found", color("red"))
        writeLine(2, "Attach RS Bridge via modem/cable", color("yellow"))
        return
    end

    local y = 1

    writeLine(y, "RS Dashboard", color("cyan"))
    y = y + 1

    writeLine(y, "Page: " .. PAGES[currentPage] .. " | Alerts: " .. tostring(#(snapshot.alerts or {})), color("lightGray"))
    y = y + 1

    if currentPage == 5 then
        writeLine(y, "Growing:", color("lime", "green"))
        y = y + 1

        for _, row in ipairs(getTopResourceRates(nil, "up", 5)) do
            writeLine(y, tostring(row.label):sub(1, 18) .. " " .. fmtRate(row.rate, row.unit), rateColor(row.rate))
            y = y + 1
        end

        y = y + 1
        writeLine(y, "Decreasing:", color("red"))
        y = y + 1

        for _, row in ipairs(getTopResourceRates(nil, "down", 5)) do
            writeLine(y, tostring(row.label):sub(1, 18) .. " " .. fmtRate(row.rate, row.unit), rateColor(row.rate))
            y = y + 1
        end
	elseif currentPage == 6 then
        local ac = snapshot.autocraft or {}

        writeLine(y, "Autocraft: " .. tostring(CONFIG.autocraft.enabled and "ON" or "OFF"), color("cyan"))
        y = y + 1

        writeLine(y, tostring(ac.lastStatus or "n/a"), color("lightGray"))
        y = y + 1

        for _, row in ipairs(ac.rows or {}) do
            if y >= h then break end
            writeLine(
                y,
                tostring(row.label):sub(1, 12) .. " -> " .. fmtNumber(row.outputCount) .. " " .. tostring(row.state),
                autocraftStateColor(row.state)
            )
            y = y + 1
        end
    else
        for _, data in ipairs(snapshot.storages) do
            local usedPct = storageUsedPercent(data)
            local rate = getAverageRate(getCategoryTrendList(data.key))
            local forecast = getForecast(data, rate)

            writeLine(y, data.title .. ": " .. fmtRate(rate, data.unit), rateColor(rate))
            y = y + 1

            writeLine(y, forecast.text, color("lightGray"))
            y = y + 1

            drawBar(y, usedPct)
            y = y + 1
        end
    end

	writeLine(
		h,
		"Fetched " .. tostring(snapshot.fetchedAt) .. " | TPS " .. fmtTps(getAverageTps()),
		tpsColor(getAverageTps())
	)
end

local function drawSnapshot(snapshot)
    local w, h = screen.getSize()

    if w < 50 or h < 20 then
        drawSmallLayout(snapshot)
        return
    end

    clearScreen()
    fillRect(1, 1, w, h, color("black"))

    drawHeader(snapshot)
    drawNavBar()

    local contentY = 6
    local contentH = h - contentY - 1

    if not snapshot.bridgeFound then
        drawBox(2, contentY, w - 3, 6, "Error", color("red"), color("black"))
        textAt(4, contentY + 2, "RS Bridge not found", color("red"), color("black"), w - 6)
        textAt(4, contentY + 3, "Attach RS Bridge via modem/cable", color("yellow"), color("black"), w - 6)
    elseif currentPage == 1 then
        drawOverviewPage(snapshot, contentY, contentH)
    elseif currentPage == 2 then
        drawCategoryPage(snapshot, "Item", contentY, contentH)
    elseif currentPage == 3 then
        drawCategoryPage(snapshot, "Fluid", contentY, contentH)
    elseif currentPage == 4 then
        drawCategoryPage(snapshot, "Chemical", contentY, contentH)
    elseif currentPage == 5 then
        drawTopPage(snapshot, contentY, contentH)
    elseif currentPage == 6 then
		drawAutocraftPage(snapshot, contentY, contentH)
	elseif currentPage == 7 then
		drawAlertsPage(snapshot, contentY, contentH)
	end

    fillRect(1, h, w, 1, color("gray", "lightGray"))

	local tpsValue = getAverageTps()
	local tpsText = "TPS " .. fmtTps(tpsValue)

	local footerText =
		"Fetched " .. tostring(snapshot.fetchedAt) ..
		" | Refresh " .. tostring(CONFIG.refreshSeconds) ..
		"s | Page " .. tostring(currentPage) .. "/" .. tostring(#PAGES) ..
		" | Ctrl+T stop"

	local footerMaxW = w - #tpsText - 5
	if footerMaxW < 10 then footerMaxW = w - 2 end

	textAt(
		2,
		h,
		footerText,
		color("white"),
		color("gray", "lightGray"),
		footerMaxW
	)

	textAt(
		w - #tpsText - 1,
		h,
		tpsText,
		tpsColor(tpsValue),
		color("gray", "lightGray"),
		#tpsText
	)
end

local function showFetchError(err)
    local w, h = screen.getSize()

    fillRect(1, h - 1, w, 2, color("black"))
    writeLine(h - 1, "Fetch/draw error:", color("red"))
    writeLine(h, tostring(err):sub(1, w), color("yellow"))
end

local function redrawLastSnapshot()
    if lastSnapshot then
        local ok, err = pcall(drawSnapshot, lastSnapshot)

        if not ok then
            if tostring(err) == "Terminated" then
                error(err, 0)
            end

            showFetchError(err)
        end
    end
end

local timerId = startRefreshTimer(0)

while true do
    local event = { os.pullEvent() }
    local eventName = event[1]

    if eventName == "timer" and event[2] == timerId then
        sampleTpsFromTimer()
        webConnectIfNeeded()
        webReceiveAvailable()
		
		local ok, snapshotOrErr = pcall(collectSnapshot)

        if ok then
            lastSnapshot = snapshotOrErr
            webSendSnapshot(lastSnapshot)
            webReceiveAvailable()

            local drawOk, drawErr = pcall(drawSnapshot, lastSnapshot)

            if drawOk then
                processAlarms(lastSnapshot.alerts or {})
            else
                if tostring(drawErr) == "Terminated" then
                    error(drawErr, 0)
                end

                showFetchError(drawErr)
            end
        else
            if tostring(snapshotOrErr) == "Terminated" then
                error(snapshotOrErr, 0)
            end

            showFetchError(snapshotOrErr)
        end

        timerId = startRefreshTimer(CONFIG.refreshSeconds)
    elseif eventName == "monitor_touch" then
        local x = event[3]
        local y = event[4]

        if handleTouch(x, y) then
            redrawLastSnapshot()
        end
    elseif eventName == "mouse_click" then
        local x = event[3]
        local y = event[4]

        if handleTouch(x, y) then
            redrawLastSnapshot()
        end
    elseif eventName == "key" and keys then
        local key = event[2]

        if key == keys.left then
            setPage(currentPage - 1)
            redrawLastSnapshot()
        elseif key == keys.right then
            setPage(currentPage + 1)
            redrawLastSnapshot()
        elseif key == keys.one then
            setPage(1)
            redrawLastSnapshot()
        elseif key == keys.two then
            setPage(2)
            redrawLastSnapshot()
        elseif key == keys.three then
            setPage(3)
            redrawLastSnapshot()
        elseif key == keys.four then
            setPage(4)
            redrawLastSnapshot()
        elseif key == keys.five then
            setPage(5)
            redrawLastSnapshot()
        elseif key == keys.six then
            setPage(6)
            redrawLastSnapshot()
		elseif key == keys.seven then
            setPage(7)
            redrawLastSnapshot()
        end
    end
end
