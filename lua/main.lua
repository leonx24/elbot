-- Leon X | main.lua
-- Noir UI version with splash screen + floating open button
-- Leon X Main Script

-- ═══════════════════════════════════════════════════════════════════════════
-- EARLY SETUP (line 1 — before ANY HTTP or game interaction)
-- NO hooks here — all hookfunction calls detected by Adonis integrity scan
-- AntiDetect module handles script destruction only (no function hooking)
-- ═══════════════════════════════════════════════════════════════════════════

if not game:IsLoaded() then
    pcall(function() game.Loaded:Wait() end)
end

_G._LeonX_AllowTeleport = function(allow)
    _G._LeonX_AllowTeleportActive = allow and true or false
end

-- Destroy old GUI instances to prevent duplicates and stuck screens when re-executing
pcall(function()
    if _G.LeonX_Cleanup then
        _G.LeonX_Cleanup()
    end
end)

-- Generate or reuse session-unique attribute key for GUI identification
pcall(function()
    if not _G._LX_AttrKey then
        _G._LX_AttrKey = "_" .. game:GetService("HttpService"):GenerateGUID(false):sub(1, 8)
    end
end)
if not _G._LX_AttrKey then _G._LX_AttrKey = "_LX" end

pcall(function()
    local players = game:GetService("Players")
    local lp = players and players.LocalPlayer
    local playerGui = lp and lp:FindFirstChild("PlayerGui")
    
    local function cleanupGui(guiParent)
        if not guiParent then return end
        for _, child in ipairs(guiParent:GetChildren()) do
            if child:IsA("ScreenGui") then
                local isLeon = false
                pcall(function()
                    if child:GetAttribute(_G._LX_AttrKey) then isLeon = true end
                end)
                if not isLeon then
                    local nm = child.Name:lower()
                    if nm:find("leonx") or nm == "leonxsplash" or nm == "leonxnoir" or nm == "leonxnotif" then
                        isLeon = true
                    end
                end
                if isLeon then
                    pcall(function() child:Destroy() end)
                end
            end
        end
    end
    
    cleanupGui(playerGui)
    
    local coreGui = game:GetService("CoreGui")
    if coreGui then
        cleanupGui(coreGui)
    end
end)

local BASE = (getgenv and getgenv().LeonX_BaseUrl) or "https://gitlab.com/affavanleon/leonx/-/raw/main/"
local AUTH_KEY = (getgenv and getgenv().LeonX_AuthKey) or ""

local function secureFetch(path)
    local fullUrl = BASE .. path .. (BASE:find("%?") and "&t=" or "?t=") .. tostring(os.time())
    if AUTH_KEY ~= "" and (not fullUrl:find("k=")) then
        fullUrl = fullUrl .. "&k=" .. AUTH_KEY
    end
    local ok, res = pcall(function()
        return game:HttpGet(fullUrl, true)
    end)
    if ok and res and #res >= 1 then return res end
    return nil
end

local raw_loadstring = loadstring or (getgenv and getgenv().loadstring) or (getfenv and getfenv(0).loadstring)



local CURRENT_VERSION = "0.2.9"
local remoteVersionFetched = false
pcall(function()
    local vSrc = secureFetch("version.txt")
    if vSrc and vSrc:match("^%s*([%d%.]+)%s*$") and not vSrc:find("<") and not vSrc:find("html") then
        CURRENT_VERSION = vSrc:match("^%s*([%d%.]+)%s*$")
        remoteVersionFetched = true
    end
end)

-- ══════════════════════════════════════════════════════════════════════════════
-- FAST LOCAL ENCRYPTED CACHE ENGINE (Hardware-Locked & Stealth)
-- ══════════════════════════════════════════════════════════════════════════════
local CACHE_ROOT = "Leon X/cache"
local CACHE_VER_FILE = CACHE_ROOT .. "/version.dat"

local function getDeviceHWID()
    local id = ""
    pcall(function()
        if gethwid then id = gethwid()
        elseif identifyexecutor then id = identifyexecutor() .. "_" .. tostring(lp and lp.UserId or "0")
        else id = tostring(lp and lp.UserId or "0") end
    end)
    return (id ~= "" and id) or tostring(lp and lp.UserId or "LX_CACHE_DEVICE")
end

local DEVICE_HWID = getDeviceHWID()
local IS_OWNER = (AUTH_KEY == "LEONX-OWNER-BYPASS-998")
local CACHE_KEY = IS_OWNER and ("LX_OWNER_SECRET_SALT_998_" .. CURRENT_VERSION) or (DEVICE_HWID .. "_" .. AUTH_KEY .. "_" .. CURRENT_VERSION)

-- Lightweight dynamic cipher (XOR stream + byte scramble, 100% Lua 5.1 & Luau compatible)
local function lx_xor(a, b)
    if bit32 and bit32.bxor then
        return bit32.bxor(a, b)
    elseif bit and bit.bxor then
        return bit.bxor(a, b)
    end
    -- Pure Lua 5.1 bitwise XOR fallback
    local res, p = 0, 1
    while a > 0 or b > 0 do
        local ra, rb = a % 2, b % 2
        if ra ~= rb then res = res + p end
        a = (a - ra) / 2
        b = (b - rb) / 2
        p = p * 2
    end
    return res
end

local function encryptString(str, key)
    local kLen = #key
    if kLen == 0 then return str end
    local res = {}
    for i = 1, #str do
        local b = str:byte(i)
        local kb = key:byte(((i - 1) % kLen) + 1)
        local enc = lx_xor(b, kb)
        res[i] = string.format("%02x", enc)
    end
    return table.concat(res)
end

local function decryptString(hexStr, key)
    local kLen = #key
    if kLen == 0 or (#hexStr % 2 ~= 0) then return nil end
    local res = {}
    local idx = 1
    for i = 1, #hexStr, 2 do
        local b = tonumber(hexStr:sub(i, i + 1), 16)
        if not b then return nil end
        local kb = key:byte(((idx - 1) % kLen) + 1)
        local dec = lx_xor(b, kb)
        res[idx] = string.char(dec)
        idx = idx + 1
    end
    return table.concat(res)
end

local function hashPath(p)
    local hash = 5381
    for i = 1, #p do
        hash = ((hash * 33) + p:byte(i)) % 4294967296
    end
    return string.format("%x", hash) .. ".lx"
end

local hasFS = (isfile and readfile and writefile and makefolder and isfolder) and true or false

local function ensureCacheFolders()
    if not hasFS then return end
    pcall(function()
        if not isfolder("Leon X") then makefolder("Leon X") end
        if not isfolder(CACHE_ROOT) then makefolder(CACHE_ROOT) end
    end)
end

local function clearLocalCache()
    if not hasFS then return end
    pcall(function()
        if delfile and isfolder and isfolder(CACHE_ROOT) then
            if listfiles then
                for _, f in ipairs(listfiles(CACHE_ROOT)) do
                    pcall(delfile, f)
                end
            end
        end
    end)
end

-- Invalidate cache automatically if version changed on server
pcall(function()
    if hasFS and remoteVersionFetched then
        ensureCacheFolders()
        if isfile(CACHE_VER_FILE) then
            local cachedVer = readfile(CACHE_VER_FILE):gsub("%s+", "")
            if cachedVer ~= CURRENT_VERSION then
                clearLocalCache()
                writefile(CACHE_VER_FILE, CURRENT_VERSION)
            end
        else
            clearLocalCache()
            writefile(CACHE_VER_FILE, CURRENT_VERSION)
        end
    end
end)

local function getCachedModule(path)
    if not hasFS then return nil end
    local fileName = CACHE_ROOT .. "/" .. hashPath(path)
    local ok, content = pcall(function()
        if isfile and isfile(fileName) then
            local raw = readfile(fileName)
            if raw and #raw > 10 then
                return decryptString(raw, CACHE_KEY)
            end
        end
        return nil
    end)
    if ok and content and #content > 10 then
        return content
    end
    return nil
end

local function saveCachedModule(path, code)
    if not hasFS or not code or #code < 10 then return end
    pcall(function()
        ensureCacheFolders()
        local fileName = CACHE_ROOT .. "/" .. hashPath(path)
        local enc = encryptString(code, CACHE_KEY)
        writefile(fileName, enc)
    end)
end

local Players      = game:GetService("Players")
local UIS          = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local RunService   = game:GetService("RunService")
local lp           = Players.LocalPlayer

local function getSafeGuiParent()
    local ok, res = pcall(function() return game:GetService("CoreGui") end)
    if ok and res then return res end
    return (lp and (lp:FindFirstChildOfClass("PlayerGui") or lp:WaitForChild("PlayerGui"))) or game:GetService("CoreGui")
end

local gui = getSafeGuiParent()
local isMobile = UIS.TouchEnabled and not UIS.KeyboardEnabled

-- ══════════════════════════════════════════════════════════════════════════════
-- SPLASH SCREEN (shown before UI loads — Cloaked)
-- ══════════════════════════════════════════════════════════════════════════════
local splashName = ""
pcall(function() splashName = game:GetService("HttpService"):GenerateGUID(false):sub(1, 10) end)
if splashName == "" then splashName = tostring(math.random(100000, 999999)) end

local SplashGui = Instance.new("ScreenGui")
SplashGui.Name             = splashName
SplashGui.ResetOnSpawn     = false
SplashGui.ZIndexBehavior   = Enum.ZIndexBehavior.Sibling
SplashGui.DisplayOrder     = 9999
SplashGui.IgnoreGuiInset   = true
pcall(function() SplashGui:SetAttribute(_G._LX_AttrKey or "_LX", true) end)
pcall(function()
    if syn and syn.protect_gui then syn.protect_gui(SplashGui) end
end)
SplashGui.Parent           = gui

local SplashBg = Instance.new("Frame")
SplashBg.Size                = UDim2.fromScale(1, 1)
SplashBg.BackgroundColor3    = Color3.fromRGB(6, 6, 10)
SplashBg.BackgroundTransparency = 0.15
SplashBg.BorderSizePixel     = 0
SplashBg.ZIndex              = 200
SplashBg.Parent              = SplashGui

-- Main Card Container (340x200)
local SplashCard = Instance.new("Frame")
SplashCard.Size                = UDim2.new(0, 340, 0, 200)
SplashCard.AnchorPoint         = Vector2.new(0.5, 0.5)
SplashCard.Position            = UDim2.fromScale(0.5, 0.5)
SplashCard.BackgroundColor3    = Color3.fromRGB(14, 14, 22)
SplashCard.BorderSizePixel     = 0
SplashCard.ZIndex              = 201
SplashCard.Parent              = SplashGui

local SplashCorner = Instance.new("UICorner")
SplashCorner.CornerRadius = UDim.new(0, 16)
SplashCorner.Parent       = SplashCard

local SplashStroke = Instance.new("UIStroke")
SplashStroke.Color     = Color3.fromRGB(45, 45, 65)
SplashStroke.Thickness = 1.2
SplashStroke.Parent    = SplashCard

-- Pulsing Ambient Border Glow
task.spawn(function()
    while SplashCard and SplashCard.Parent do
        TweenService:Create(SplashStroke, TweenInfo.new(3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut),
            {Color = Color3.fromRGB(100, 140, 255)}):Play()
        task.wait(3)
        TweenService:Create(SplashStroke, TweenInfo.new(3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut),
            {Color = Color3.fromRGB(45, 45, 65)}):Play()
        task.wait(3)
    end
end)

local cachedLogoAsset = nil
local function getCustomLogoAsset()
    if cachedLogoAsset then return cachedLogoAsset end
    pcall(function()
        local path = "Leon X/assets/logo.jpg"
        if isfile and isfile(path) and getcustomasset then
            cachedLogoAsset = getcustomasset(path)
            return
        end
        if makefolder and not isfolder("Leon X") then makefolder("Leon X") end
        if makefolder and not isfolder("Leon X/assets") then makefolder("Leon X/assets") end
        if writefile and game and getcustomasset then
            local data = secureFetch("assets/logo.jpg")
            if data and #data > 100 and not data:find("html") and not data:find("<") then
                writefile(path, data)
                cachedLogoAsset = getcustomasset(path)
            end
        end
    end)
    return cachedLogoAsset
end

-- Logo Icon Tile Box (38x38)
local LogoTile = Instance.new("Frame")
LogoTile.Size             = UDim2.fromOffset(38, 38)
LogoTile.Position         = UDim2.fromOffset(20, 20)
LogoTile.BackgroundTransparency = 1
LogoTile.BorderSizePixel  = 0
LogoTile.ClipsDescendants = true
LogoTile.ZIndex           = 202
LogoTile.Parent           = SplashCard

local TileCorner = Instance.new("UICorner")
TileCorner.CornerRadius = UDim.new(0, 10)
TileCorner.Parent       = LogoTile

local TileStroke = Instance.new("UIStroke")
TileStroke.Color        = Color3.fromRGB(45, 45, 65)
TileStroke.Thickness    = 1
TileStroke.Transparency = 0.6
TileStroke.Parent       = LogoTile

-- Logo Icon Image (Custom Metallic LX Logo)
local LogoImg = Instance.new("ImageLabel")
LogoImg.Name                   = "LogoIcon"
LogoImg.Size                   = UDim2.fromScale(1, 1)
LogoImg.AnchorPoint            = Vector2.new(0.5, 0.5)
LogoImg.Position               = UDim2.fromScale(0.5, 0.5)
LogoImg.BackgroundTransparency = 1
LogoImg.BorderSizePixel        = 0
LogoImg.ScaleType              = Enum.ScaleType.Fit
LogoImg.ZIndex                 = 203
LogoImg.Parent                 = LogoTile

task.spawn(function()
    local asset = getCustomLogoAsset()
    if asset then
        LogoImg.Image = asset
    end
end)

-- Title
local SplashTitle = Instance.new("TextLabel")
SplashTitle.Size                = UDim2.new(1, -140, 0, 22)
SplashTitle.Position            = UDim2.fromOffset(68, 20)
SplashTitle.BackgroundTransparency = 1
SplashTitle.Text                = "Leon X"
SplashTitle.TextColor3          = Color3.fromRGB(240, 242, 250)
SplashTitle.TextSize            = 18
SplashTitle.Font                = Enum.Font.GothamBold
SplashTitle.TextXAlignment      = Enum.TextXAlignment.Left
SplashTitle.ZIndex              = 202
SplashTitle.Parent              = SplashCard

-- Subtitle / Version Pill
local SplashVerPill = Instance.new("Frame")
SplashVerPill.Size             = UDim2.fromOffset(56, 18)
SplashVerPill.Position         = UDim2.new(1, -76, 0, 20)
SplashVerPill.BackgroundColor3 = Color3.fromRGB(28, 28, 40)
SplashVerPill.BorderSizePixel  = 0
SplashVerPill.ZIndex           = 202
SplashVerPill.Parent           = SplashCard

local PillCorner = Instance.new("UICorner")
PillCorner.CornerRadius = UDim.new(0, 6)
PillCorner.Parent       = SplashVerPill

local SplashVer = Instance.new("TextLabel")
SplashVer.Size                = UDim2.fromScale(1, 1)
SplashVer.BackgroundTransparency = 1
SplashVer.Text                = "v" .. CURRENT_VERSION
SplashVer.TextColor3          = Color3.fromRGB(100, 140, 255)
SplashVer.TextSize            = 10
SplashVer.Font                = Enum.Font.GothamBold
SplashVer.TextXAlignment      = Enum.TextXAlignment.Center
SplashVer.ZIndex              = 203
SplashVer.Parent              = SplashVerPill

-- Subtitle Tagline
local SplashSub = Instance.new("TextLabel")
SplashSub.Size                = UDim2.new(1, -140, 0, 14)
SplashSub.Position            = UDim2.fromOffset(68, 42)
SplashSub.BackgroundTransparency = 1
SplashSub.Text                = "CyberNoir Boot Engine"
SplashSub.TextColor3          = Color3.fromRGB(130, 135, 155)
SplashSub.TextSize            = 10
SplashSub.Font                = Enum.Font.GothamMedium
SplashSub.TextXAlignment      = Enum.TextXAlignment.Left
SplashSub.ZIndex              = 202
SplashSub.Parent              = SplashCard

-- Status Text Label
local SplashStatus = Instance.new("TextLabel")
SplashStatus.Size                = UDim2.new(1, -120, 0, 18)
SplashStatus.Position            = UDim2.fromOffset(20, 110)
SplashStatus.BackgroundTransparency = 1
SplashStatus.Text                = "Initializing system engine..."
SplashStatus.TextColor3          = Color3.fromRGB(180, 185, 205)
SplashStatus.TextSize            = 11
SplashStatus.Font                = Enum.Font.GothamMedium
SplashStatus.TextXAlignment      = Enum.TextXAlignment.Left
SplashStatus.ZIndex              = 202
SplashStatus.Parent              = SplashCard

-- Percentage Label (Right Aligned)
local SplashPct = Instance.new("TextLabel")
SplashPct.Size                = UDim2.new(0, 50, 0, 18)
SplashPct.Position            = UDim2.new(1, -70, 0, 110)
SplashPct.BackgroundTransparency = 1
SplashPct.Text                = "0%"
SplashPct.TextColor3          = Color3.fromRGB(100, 140, 255)
SplashPct.TextSize            = 11
SplashPct.Font                = Enum.Font.GothamBold
SplashPct.TextXAlignment      = Enum.TextXAlignment.Right
SplashPct.ZIndex              = 202
SplashPct.Parent              = SplashCard

-- Progress Bar Background Track
local SplashBarBg = Instance.new("Frame")
SplashBarBg.Size             = UDim2.new(1, -40, 0, 6)
SplashBarBg.Position         = UDim2.fromOffset(20, 140)
SplashBarBg.BackgroundColor3 = Color3.fromRGB(24, 24, 36)
SplashBarBg.BorderSizePixel  = 0
SplashBarBg.ZIndex           = 202
SplashBarBg.Parent           = SplashCard

local BarBgCorner = Instance.new("UICorner")
BarBgCorner.CornerRadius = UDim.new(0, 3)
BarBgCorner.Parent       = SplashBarBg

-- Progress Bar Fill
local SplashBarFill = Instance.new("Frame")
SplashBarFill.Size             = UDim2.new(0, 0, 1, 0)
SplashBarFill.BackgroundColor3 = Color3.fromRGB(100, 140, 255)
SplashBarFill.BorderSizePixel  = 0
SplashBarFill.ZIndex           = 203
SplashBarFill.Parent           = SplashBarBg

local BarFillCorner = Instance.new("UICorner")
BarFillCorner.CornerRadius = UDim.new(0, 3)
BarFillCorner.Parent       = SplashBarFill

-- Animated Loading Indicator (Pulsing dots)
local SplashDots = Instance.new("TextLabel")
SplashDots.Size                = UDim2.new(1, 0, 0, 14)
SplashDots.Position            = UDim2.fromOffset(0, 160)
SplashDots.BackgroundTransparency = 1
SplashDots.Text                = "●  ○  ○"
SplashDots.TextColor3          = Color3.fromRGB(100, 140, 255)
SplashDots.TextSize            = 9
SplashDots.Font                = Enum.Font.GothamBold
SplashDots.TextXAlignment      = Enum.TextXAlignment.Center
SplashDots.ZIndex              = 202
SplashDots.Parent              = SplashCard

-- Entrance animation
SplashCard.BackgroundTransparency = 1
SplashCard.Size = UDim2.new(0, 280, 0, 160)
local function tw(o, t, p)
    TweenService:Create(o, TweenInfo.new(t, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), p):Play()
end
tw(SplashCard, 0.25, {BackgroundTransparency = 0, Size = UDim2.new(0, 340, 0, 200)})
tw(SplashBg, 0.2, {BackgroundTransparency = 0.15})

for _, child in ipairs(SplashCard:GetDescendants()) do
    if child:IsA("TextLabel") then
        child.TextTransparency = 1
        TweenService:Create(child, TweenInfo.new(0.2), {TextTransparency = 0}):Play()
    elseif child:IsA("Frame") then
        child.BackgroundTransparency = 1
        TweenService:Create(child, TweenInfo.new(0.2), {BackgroundTransparency = 0}):Play()
    end
end

-- Animated dots & status step cycle
local dotFrames = {"●  ○  ○", "○  ●  ○", "○  ○  ●"}
local statusSteps = {
    "Initializing system engine...",
    "Loading UI core & components...",
    "Fetching modules from GitHub...",
    "Configuring game features...",
    "Finalizing initialization...",
}
local dotIdx, stepIdx = 1, 1

task.spawn(function()
    local lastDot, lastStep = tick(), tick()
    while SplashCard and SplashCard.Parent do
        local now = tick()
        if now - lastDot >= 0.25 then
            lastDot = now
            dotIdx = (dotIdx % #dotFrames) + 1
            pcall(function() SplashDots.Text = dotFrames[dotIdx] end)
        end
        if now - lastStep >= 0.5 then
            lastStep = now
            stepIdx = (stepIdx % #statusSteps) + 1
            pcall(function() SplashStatus.Text = statusSteps[stepIdx] end)
        end
        task.wait(0.05)
    end
end)

-- Splash progress API
local function setSplashProgress(pct)
    pcall(function()
        local clamped = math.clamp(pct, 0, 1)
        tw(SplashBarFill, 0.12, {Size = UDim2.new(clamped, 0, 1, 0)})
        SplashPct.Text = tostring(math.floor(clamped * 100)) .. "%"
    end)
end

-- ══════════════════════════════════════════════════════════════════════════════
-- LOAD CUSTOM UI LIBRARY (Noir)
-- ══════════════════════════════════════════════════════════════════════════════
-- Safety net: force-destroy splash after 60s no matter what
task.delay(60, function()
    pcall(function() if SplashGui and SplashGui.Parent then SplashGui:Destroy() end end)
end)

local loadErrors = {}
local MAX_RETRIES = 4
local function load(p)
    local shortName = p:match("([^/]+)%.lua$") or p

    -- 1. Check local HWID-encrypted cache first
    local cachedCode = getCachedModule(p)
    if cachedCode and #cachedCode > 10 then
        local okCache, fn = pcall(raw_loadstring, cachedCode)
        if okCache and fn then
            local runOk, result = pcall(fn)
            if runOk then
                return result
            end
        end
    end

    -- 2. Fallback to secure network fetch with automatic caching
    for attempt = 1, MAX_RETRIES do
        local ok, result = pcall(function()
            local src = secureFetch(p)
            if not src or #src < 10 then error("empty response ("..#tostring(src).." bytes)") end
            if src:find("Too Many Requests") or src:find("^%s*<!") or src:find("^%s*<html") then
                error("rate-limited (429 or HTML error page)")
            end
            local fn, err = raw_loadstring(src)
            if not fn then error("loadstring failed: "..tostring(err)) end
            saveCachedModule(p, src)
            return fn()
        end)
        if ok then
            return result
        end
        if attempt < MAX_RETRIES then
            local delay = attempt
            warn("[LeonX] RETRY " .. attempt .. "/" .. MAX_RETRIES .. ": " .. tostring(p) .. " — " .. tostring(result) .. " (waiting " .. delay .. "s)")
            pcall(function()
                SplashStatus.Text = "Retrying " .. shortName .. "... (" .. attempt .. "/" .. MAX_RETRIES .. ")"
                SplashPct.Text = delay .. "s"
            end)
            task.wait(delay)
        else
            warn("[LeonX] FAIL: " .. tostring(p) .. " — " .. tostring(result))
            loadErrors[#loadErrors + 1] = p .. ": " .. tostring(result)
            return nil
        end
    end
end

local Library = load("ui/library_v4.lua")
if not Library then warn("[LeonX] CRITICAL: UI library failed"); return end
setSplashProgress(0.05)

-- AntiDetect loads FIRST — DISABLED for testing (v7.3 script destroyer may trigger Adonis absence detection)
local AntiDetect
pcall(function()
    AntiDetect = load("modules/player/antidetect.lua")
    -- AntiDetect:Enable()  -- DISABLED: testing if Adonis kick comes from our code or executor itself
end)

-- Parallel module loader: fetch+compile all modules concurrently.
-- Splash waits only for the slowest one instead of ~42× sequential HTTP RTTs.
local MODULES_TO_LOAD = {
    { key = "ConfigMgr",      path = "modules/core/configmanager.lua" },
    { key = "Fly",            path = "modules/movements/fly.lua" },
    { key = "Speed",          path = "modules/movements/speed.lua" },
    { key = "InfJump",        path = "modules/movements/infinitejump.lua" },
    { key = "Noclip",         path = "modules/movements/noclip.lua" },
    { key = "AntiRagdoll",    path = "modules/movements/antiragdoll.lua" },
    { key = "Invisible",      path = "modules/movements/invisible.lua" },
    { key = "FreeCam",        path = "modules/movements/freecam.lua" },
    { key = "ClickTP",        path = "modules/movements/clickteleport.lua" },
    { key = "WalkOnWater",    path = "modules/movements/walkonwater.lua" },
    { key = "ESP",            path = "modules/visuals/esp.lua" },
    { key = "Tracer",         path = "modules/visuals/tracer.lua" },
    { key = "FullBright",     path = "modules/visuals/fullbright.lua" },
    { key = "PerfStats",      path = "modules/visuals/perfstats.lua" },
    { key = "RemoveFog",      path = "modules/visuals/removefog.lua" },
    { key = "AntiAFK",        path = "modules/player/antiafk.lua" },
    { key = "InfStamina",     path = "modules/player/infinitestamina.lua" },
    { key = "AntiFling",      path = "modules/player/antifling.lua" },
    { key = "Rejoin",         path = "modules/player/rejoin.lua" },
    { key = "ServerHop",      path = "modules/player/serverhop.lua" },
    { key = "Teleport",       path = "modules/player/teleport.lua" },
    { key = "HitboxExp",      path = "modules/player/hitboxexpander.lua" },
    { key = "Waypoint",       path = "modules/player/waypoint.lua" },
    { key = "GodMode",        path = "modules/player/godmode.lua" },
    { key = "NoFallDmg",      path = "modules/player/nofalldamage.lua" },
    { key = "InstantKill",    path = "modules/player/instantkill.lua" },
    { key = "KillAura",       path = "modules/combat/killaura.lua" },
    { key = "AutoClicker",    path = "modules/auto/autoclicker.lua" },
    { key = "QuickSwitch",    path = "modules/combat/quickswitch.lua" },
    { key = "MacroRec",       path = "modules/movements/macrorecorder.lua" },
    { key = "Backtracker",    path = "modules/movements/backtracker.lua" },
    { key = "AntiVoid",       path = "modules/player/antivoid.lua" },
    { key = "GamepassSpoof",  path = "modules/player/gamepassspoofer.lua" },
    { key = "AvatarSpoof",    path = "modules/player/avatarspoofer.lua" },
    { key = "MobileOverlay",  path = "modules/core/mobileoverlay.lua" },
    { key = "PerfBooster",    path = "modules/visuals/perfbooster.lua" },
    { key = "WebhookLogger",  path = "modules/core/webhooklogger.lua" },
    { key = "ServerUtils",    path = "modules/core/serverutils.lua" },
    { key = "FOVMod",         path = "modules/visuals/fovmodifier.lua" },
    { key = "InstantPrompts", path = "modules/auto/instantprompts.lua" },
    { key = "Orbit",          path = "modules/movements/orbit.lua" },
    { key = "Radar",          path = "modules/visuals/radar.lua" },
}
local moduleResults = {}
local moduleDone = 0
local MODULES_TOTAL = #MODULES_TO_LOAD
local function moduleProgress()
    moduleDone = moduleDone + 1
    setSplashProgress(0.05 + 0.90 * (moduleDone / MODULES_TOTAL))
end
for _, item in ipairs(MODULES_TO_LOAD) do
    local key, path = item.key, item.path
    task.spawn(function()
        local m = load(path)
        moduleResults[key] = m
        moduleProgress()
    end)
end
while moduleDone < MODULES_TOTAL do
    task.wait()
end

local ConfigMgr      = moduleResults.ConfigMgr
local Fly            = moduleResults.Fly
local Speed          = moduleResults.Speed
local InfJump        = moduleResults.InfJump
local Noclip         = moduleResults.Noclip
local AntiRagdoll    = moduleResults.AntiRagdoll
local Invisible      = moduleResults.Invisible
local FreeCam        = moduleResults.FreeCam
local ClickTP        = moduleResults.ClickTP
local WalkOnWater    = moduleResults.WalkOnWater
local ESP            = moduleResults.ESP
local Tracer         = moduleResults.Tracer
local FullBright     = moduleResults.FullBright
local PerfStats      = moduleResults.PerfStats
local RemoveFog      = moduleResults.RemoveFog
local AntiAFK        = moduleResults.AntiAFK
local InfStamina     = moduleResults.InfStamina
local AntiFling      = moduleResults.AntiFling
local Rejoin         = moduleResults.Rejoin
local ServerHop      = moduleResults.ServerHop
local Teleport       = moduleResults.Teleport
local HitboxExp      = moduleResults.HitboxExp
local Waypoint       = moduleResults.Waypoint
local GodMode        = moduleResults.GodMode
local NoFallDmg      = moduleResults.NoFallDmg
local InstantKill    = moduleResults.InstantKill
local KillAura       = moduleResults.KillAura
local AutoClicker    = moduleResults.AutoClicker
local QuickSwitch    = moduleResults.QuickSwitch
local MacroRec       = moduleResults.MacroRec
local Backtracker    = moduleResults.Backtracker
local AntiVoid       = moduleResults.AntiVoid
local GamepassSpoof  = moduleResults.GamepassSpoof
local AvatarSpoof    = moduleResults.AvatarSpoof
local MobileOverlay  = moduleResults.MobileOverlay
local PerfBooster    = moduleResults.PerfBooster
local WebhookLogger  = moduleResults.WebhookLogger
local ServerUtils    = moduleResults.ServerUtils
local FOVMod         = moduleResults.FOVMod
local InstantPrompts = moduleResults.InstantPrompts
local Orbit          = moduleResults.Orbit
local Radar          = moduleResults.Radar


-- Dummy stub for any module that failed to load
local DUMMY = {
    Enabled = false,
    Enable = function() end,
    Disable = function() end,
    Toggle = function() end,
    SetSpeed = function() end,
    SetPower = function() end,
    SetColor = function() end,
    Set = function() end,
    Get = function() return false end,
    Init = function() end,
    Refresh = function() end,
    Select = function() end,
    PlaceIds = {},
    WireUI = function() end,
    Name = "Dummy",
}
local function safe(m) return m or setmetatable({}, {__index = function() return DUMMY end}) end

ConfigMgr      = safe(ConfigMgr)
AntiDetect     = safe(AntiDetect)
Fly            = safe(Fly)
Speed          = safe(Speed)
InfJump        = safe(InfJump)
Noclip         = safe(Noclip)
AntiRagdoll    = safe(AntiRagdoll)
Invisible      = safe(Invisible)
FreeCam        = safe(FreeCam)
ClickTP        = safe(ClickTP)
WalkOnWater    = safe(WalkOnWater)
ESP            = safe(ESP)
Tracer         = safe(Tracer)
FullBright     = safe(FullBright)
PerfStats      = safe(PerfStats)
RemoveFog      = safe(RemoveFog)
AntiAFK        = safe(AntiAFK)
InfStamina     = safe(InfStamina)
AntiFling      = safe(AntiFling)
Rejoin         = safe(Rejoin)
ServerHop      = safe(ServerHop)
Teleport       = safe(Teleport)
HitboxExp      = safe(HitboxExp)
Waypoint       = safe(Waypoint)
GodMode        = safe(GodMode)
NoFallDmg      = safe(NoFallDmg)
InstantKill    = safe(InstantKill)
KillAura       = safe(KillAura)
AutoClicker    = safe(AutoClicker)
QuickSwitch    = safe(QuickSwitch)
MacroRec       = safe(MacroRec)
Backtracker    = safe(Backtracker)
pcall(function()
    Backtracker:SetMacroRecorder(MacroRec)
    Backtracker:SetNotifyCallback(N)
end)
AntiVoid       = safe(AntiVoid)
GamepassSpoof  = safe(GamepassSpoof)
AvatarSpoof    = safe(AvatarSpoof)
MobileOverlay  = safe(MobileOverlay)
PerfBooster    = safe(PerfBooster)
WebhookLogger  = safe(WebhookLogger)
ServerUtils    = safe(ServerUtils)
FOVMod         = safe(FOVMod)
InstantPrompts = safe(InstantPrompts)
Orbit          = safe(Orbit)
Radar          = safe(Radar)


-- ── Game-specific modules (Lazy-Loaded on Game Match) ─────────────────────────
local GAME_REGISTRY = {
    {
        Name = "Grow a Garden 2",
        PlaceIds = { 77085202503540, 97598239454123 },
        GameIds = { 10200395747 },
        Path = "modules/games/growagarden2.lua"
    },
    {
        Name = "Fish and Monsters",
        PlaceIds = { 111385005478215 },
        GameIds = { 10009809198 },
        Path = "modules/games/fishandmonsters.lua"
    },
    {
        Name = "Violence District",
        PlaceIds = { 93978595733734 },
        GameIds = { 6739698191 },
        Path = "modules/games/violencedistrict.lua"
    },
    {
        Name = "Steal an Egg",
        PlaceIds = { 107778070777162 },
        GameIds = { 10563114921 },
        Path = "modules/games/stealanegg.lua"
    },
    {
        Name = "Sniper Arena",
        PlaceIds = { 122446657157717 },
        GameIds = { 9534705677 },
        Path = "modules/games/sniperarena.lua"
    },
    {
        Name = "Ride a Pet",
        PlaceIds = { 124216119978534, "124216119978534", 77451396148528, "77451396148528", 73314521587550, "73314521587550" },
        GameIds = { 10035204815, "10035204815" },
        Path = "modules/games/rideapet.lua"
    },
}

local ActiveGameModule = nil
local curPlaceId = tostring(game.PlaceId)
local curGameId  = tostring(game.GameId)

-- DEV: log current game IDs so new games can be added to GAME_REGISTRY
warn("[LeonX] DEV PlaceId=" .. curPlaceId .. " | GameId=" .. curGameId)

local function idMatches(id1, id2)
    if id1 == nil or id2 == nil then return false end
    if tostring(id1) == tostring(id2) then return true end
    local n1, n2 = tonumber(id1), tonumber(id2)
    if n1 and n2 then
        if n1 == n2 then return true end
        if string.format("%.0f", n1) == string.format("%.0f", n2) then return true end
    end
    return false
end

for _, gameDef in ipairs(GAME_REGISTRY) do
    local isMatch = false
    if gameDef.PlaceIds then
        for _, pid in ipairs(gameDef.PlaceIds) do
            if idMatches(pid, curPlaceId) or idMatches(pid, game.PlaceId) then
                isMatch = true
                break
            end
        end
    end
    if not isMatch and gameDef.GameIds then
        for _, gid in ipairs(gameDef.GameIds) do
            if idMatches(gid, curGameId) or idMatches(gid, game.GameId) then
                isMatch = true
                break
            end
        end
    end
    if isMatch then
        warn("[LeonX] GAME MATCH FOUND: " .. tostring(gameDef.Name) .. " (" .. tostring(gameDef.Path) .. ")")
        local gm = load(gameDef.Path)
        if gm then
            ActiveGameModule = gm
            warn("[LeonX] SUCCESS: Loaded game module: " .. tostring(gameDef.Name))
        else
            warn("[LeonX] CRITICAL: Failed to load game module '" .. tostring(gameDef.Name) .. "' from " .. tostring(gameDef.Path))
        end
        break
    end
end

if Waypoint then Waypoint:Init() end

_G.LeonX_Cleanup = function()
    pcall(function()
        if ActiveGameModule and ActiveGameModule.Disable then
            ActiveGameModule:Disable()
        end
    end)
    pcall(function() if Fly and Fly.Disable then Fly:Disable() end end)
    pcall(function() if Speed and Speed.Disable then Speed:Disable() end end)
    pcall(function() if FreeCam and FreeCam.Disable then FreeCam:Disable() end end)
    pcall(function() if ESP and ESP.Disable then ESP:Disable() end end)
    pcall(function() if Tracer and Tracer.Disable then Tracer:Disable() end end)
    pcall(function() if FullBright and FullBright.Disable then FullBright:Disable() end end)
    pcall(function() if RemoveFog and RemoveFog.Disable then RemoveFog:Disable() end end)
    pcall(function() if AntiAFK and AntiAFK.Disable then AntiAFK:Disable() end end)
    pcall(function() if AutoClicker and AutoClicker.Disable then AutoClicker:Disable() end end)
    pcall(function() if FOVMod and FOVMod.Disable then FOVMod:Disable() end end)
    pcall(function() if InstantPrompts and InstantPrompts.Disable then InstantPrompts:Disable() end end)
    pcall(function() if Orbit and Orbit.Disable then Orbit:Disable() end end)
    pcall(function() if Radar and Radar.Disable then Radar:Disable() end end)
    pcall(function() if ConfigMgr and ConfigMgr.StopAutoSave then ConfigMgr:StopAutoSave() end end)
end

-- ── Determine window title based on game mode ─────────────────────────────────
local windowTitle = "Leon X v"..CURRENT_VERSION
local windowAuthor = "by leon"
if ActiveGameModule then
    windowTitle = "Leon X v"..CURRENT_VERSION.." | "..ActiveGameModule.Name
    windowAuthor = ActiveGameModule.Name
else
    windowAuthor = "Universal Mode"
end

-- ── Window ────────────────────────────────────────────────────────────────────
local _vp     = workspace.CurrentCamera.ViewportSize
local _winW   = isMobile and math.min(640, math.floor(_vp.X * 0.96)) or 640
local _winH   = isMobile and math.min(560, math.floor(_vp.Y * 0.88)) or 560
local Window = Library:CreateWindow({
    Title      = windowTitle,
    Author     = windowAuthor,
    Version    = CURRENT_VERSION,
    Size       = UDim2.new(0, _winW, 0, _winH),
    ToggleKey  = Enum.KeyCode.U,
    Theme      = "Default",
    GameName   = ActiveGameModule and ActiveGameModule.Name or nil,
    GameMode   = ActiveGameModule ~= nil,
})

-- Notification helper
local function N(title, state, duration)
    Library:Notify({
        Title    = title,
        Content  = state or "",
        Duration = duration or 2,
    })
end


local function showDebugError(title, err)
    pcall(function()
        warn("[LeonX ERROR in " .. tostring(title) .. "] " .. tostring(err))
        local sg = Instance.new("ScreenGui", game:GetService("CoreGui") or lp:WaitForChild("PlayerGui"))
        sg.Name = "LeonXInitErrorBanner"
        sg.DisplayOrder = 999999
        local f = Instance.new("Frame", sg)
        f.Size = UDim2.new(0.9, 0, 0, 110)
        f.Position = UDim2.new(0.05, 0, 0, 10)
        f.BackgroundColor3 = Color3.fromRGB(180, 20, 20)
        f.BorderSizePixel = 0
        f.ZIndex = 1000000
        local c = Instance.new("UICorner", f); c.CornerRadius = UDim.new(0, 8)
        local t = Instance.new("TextLabel", f)
        t.Size = UDim2.new(1, -20, 1, -10)
        t.Position = UDim2.fromOffset(10, 5)
        t.BackgroundTransparency = 1
        t.TextColor3 = Color3.fromRGB(255, 255, 255)
        t.TextSize = 12
        t.Font = Enum.Font.SourceSansBold
        t.TextWrapped = true
        t.TextXAlignment = Enum.TextXAlignment.Left
        t.TextYAlignment = Enum.TextYAlignment.Top
        t.ZIndex = 1000001
        t.Text = "[Leon X ERROR in " .. tostring(title) .. "]\n" .. tostring(err)
    end)
end

-- ── Tabs ──────────────────────────────────────────────────────────────────────
setSplashProgress(0.96)

-- Anti-AFK: always active on ALL maps
if ConfigMgr then
    pcall(function()
        ConfigMgr:Init(Window)
        ConfigMgr._notify = function(title, msg)
            N(title, msg)
        end
    end)
end

-- ══ GAME MODULE vs UNIVERSAL MODE ═════════════════════════════════════
if ActiveGameModule then
    -- Game-specific mode: only show game tabs, skip universal tabs
    if PerfStats then PerfStats:Enable() end
    pcall(function() ActiveGameModule:Init() end)
    pcall(function() ActiveGameModule:Enable() end)
    local wireSuccess, wireErr = pcall(function()
        ActiveGameModule:WireUI(Window, {
            Fly          = Fly,
            Speed        = Speed,
            Waypoint     = Waypoint,
            Window       = Window,
            AntiAFK      = AntiAFK,
            InfiniteJump = InfJump,
            AntiFling    = AntiFling,
            Rejoin       = Rejoin,
            ServerHop    = ServerHop,
            ConfigMgr    = ConfigMgr,
            PerfStats    = PerfStats,
            FullBright   = FullBright,
            RemoveFog    = RemoveFog,
            Noclip       = Noclip,
            N            = N,
        })
    end)
    if not wireSuccess then
        showDebugError("WireUI (" .. tostring(ActiveGameModule.Name) .. ")", wireErr)
    end
    N("Game Detected", ActiveGameModule.Name)

    setSplashProgress(1.0)

    -- AutoLoad config for game module
    task.delay(1.5, function()
        ConfigMgr:AutoLoad()
        ConfigMgr:StartAutoSave()
    end)

    -- Character respawn handler
    lp.CharacterAdded:Connect(function(char)
        task.wait(1)
        pcall(function()
            if Fly and Fly.Enabled then Fly:Disable(); Fly:Enable() end
        end)
    end)

else
-- Universal mode: create all standard tabs
local uniOk, uniErr = xpcall(function()

local FavTab = Window:Tab({ Title = "Favorites", Icon = "star" })
local MovTab = Window:Tab({ Title = "Movement", Icon = "person-standing" })
local CombatTab = Window:Tab({ Title = "Combat", Icon = "swords" })
local PlayerTab = Window:Tab({ Title = "Player", Icon = "shield" })
local TeleTab = Window:Tab({ Title = "Teleport", Icon = "map-pin" })
local VisTab = Window:Tab({ Title = "Visual", Icon = "eye" })
local AutoTab = Window:Tab({ Title = "Auto", Icon = "zap" })
local MacroTab = Window:Tab({ Title = "Macro", Icon = "clapperboard" })
local SetTab = Window:Tab({ Title = "Settings", Icon = "settings" })

FavTab:Section({ Expanded = false, Title = "Quick Access Features" })
FavTab:Paragraph({
    Title   = "Favorites & Quick Access",
    Content = "Star (★) any toggle to pin it here! Your favorite features at your fingertips."
})

-- Dynamic favorites tracking (toggled items starred from other tabs appear here)
local _favDynamicToggles = {} -- flagKey → toggle api

print("[LeonX Debug] Initializing core modules...")
if PerfStats then pcall(function() PerfStats:Enable() end) end

-- ── Macro Recorder UI ────────────────────────────────────────────────────────
-- Keybind variables (used by InputBegan handlers below)
-- Note: no keybind for InfJump, ESP, FullBright (use UI toggle only)
local noclipKey      = Enum.KeyCode.N
local tpWaypointKey  = Enum.KeyCode.G  -- G (not T, T opens Roblox chat)
local autoClickerKey = Enum.KeyCode.C
local wpQueueKey     = Enum.KeyCode.X  -- X = start/stop waypoint queue (Q conflicts with FPS weapon switch)
local hitboxKey      = Enum.KeyCode.H  -- H = hitbox expander

local macroStatusText = nil
local macroDropdown = nil
local selectedMacroName = nil

-- Refresh dropdown helper
local function refreshMacroList()
    if not MacroRec then return {"(no macros)"} end
    local list = MacroRec:ListMacros()
    if #list == 0 then list = {"(no macros)"} end
    selectedMacroName = list[1]
    if macroDropdown then
        macroDropdown:Refresh(list)
        macroDropdown:Select(list[1])
    end
    return list
end

-- ══════════════════════════════════════════════════════════════════════════════
-- MOVEMENT TAB
-- ══════════════════════════════════════════════════════════════════════════════
MovTab:Section({ Expanded = false, Title = "Flight" })
-- Creating UI components

-- Fly toggle
flyToggle = MovTab:Toggle({
    Title    = "Fly",
    Flag     = "Fly",
    Value    = false,
    Tooltip  = "Free flight with adjustable speed",
    Callback = function(v)
        if v and Fly then
            local fs = (flySpeedSlider and flySpeedSlider.Value) or Fly.Speed or 60
            Fly:SetSpeed(fs)
            Fly:Enable()
        elseif Fly then
            Fly:Disable()
        end
        N("Fly", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Fly", flyToggle)
flySpeedSlider = MovTab:Slider({
    Title    = "Fly Speed",
    Value    = { Min = 10, Max = 500, Default = 60 },
    Step     = 1,
    Tooltip  = "Adjust flight speed (10-500)",
    Callback = function(v) if v >= 10 then Fly:SetSpeed(v) end end
})
ConfigMgr:Register("FlySpeed", flySpeedSlider)
flyKey = Enum.KeyCode.F
MovTab:Keybind({
    Title    = "Fly Keybind",
    Value    = "F",
    Tooltip  = "Press to toggle fly on/off",
    Callback = function(k)
        flyKey = Enum.KeyCode[k] or Enum.KeyCode.F
        N("Fly Keybind", k)
    end
})
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= flyKey then return end
    local s = not Fly.Enabled
    flyToggle:Set(s)
end)

MovTab:Section({ Expanded = false, Title = "Speed" })

speedToggle = MovTab:Toggle({
    Title    = "Speed Hack",
    Flag     = "SpeedHack",
    Value    = false,
    Tooltip  = "Customizable walk speed and jump power",
    Callback = function(v)
        if v then
            local ws = (walkSpeedSlider and walkSpeedSlider.Value) or 16
            local jp = (jumpPowerSlider  and jumpPowerSlider.Value)  or 50
            Speed:SetWalkSpeed(ws)
            Speed:SetJumpPower(jp)
            Speed:Enable()
        else
            Speed:Disable()
        end
        N("Speed Hack", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("SpeedHack", speedToggle)
walkSpeedSlider = MovTab:Slider({
    Title    = "Walk Speed",
    Value    = { Min = 16, Max = 250, Default = 16 },
    Step     = 1,
    Tooltip  = "Set walking speed (16-250)",
    Callback = function(v) Speed:SetWalkSpeed(v) end
})
ConfigMgr:Register("WalkSpeed", walkSpeedSlider)
jumpPowerSlider = MovTab:Slider({
    Title    = "Jump Power",
    Value    = { Min = 50, Max = 500, Default = 50 },
    Step     = 1,
    Tooltip  = "Set jump height (50-500)",
    Callback = function(v) Speed:SetJumpPower(v) end
})
ConfigMgr:Register("JumpPower", jumpPowerSlider)

MovTab:Section({ Expanded = false, Title = "Physics" })

infJumpToggle = MovTab:Toggle({
    Title    = "Infinite Jump",
    Value    = false,
    Tooltip  = "Jump mid-air indefinitely",
    Callback = function(v)
        if v then InfJump:Enable() else InfJump:Disable() end
        N("Infinite Jump", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InfiniteJump", infJumpToggle)
noclipToggle = MovTab:Toggle({
    Title    = "Noclip",
    Flag     = "Noclip",
    Value    = false,
    Tooltip  = "Walk through walls and objects",
    Callback = function(v)
        if v then Noclip:Enable() else Noclip:Disable() end
        N("Noclip", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Noclip", noclipToggle)
MovTab:Keybind({
    Title    = "Noclip Keybind",
    Value    = "N",
    Tooltip  = "Press to toggle noclip on/off",
    Callback = function(k)
        noclipKey = Enum.KeyCode[k] or Enum.KeyCode.N
        N("Noclip Keybind", k)
    end
})
antiRagdollToggle = MovTab:Toggle({
    Title    = "Anti Ragdoll",
    Value    = false,
    Tooltip  = "Prevent ragdoll physics",
    Callback = function(v)
        if v then AntiRagdoll:Enable() else AntiRagdoll:Disable() end
        N("Anti Ragdoll", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiRagdoll", antiRagdollToggle)
invisToggle = MovTab:Toggle({
    Title    = "Invisible (Server-Side)",
    Flag     = "Invisible",
    Value    = false,
    Tooltip  = "True invisibility — other players cannot see you (CFrame void method)",
    Callback = function(v)
        if v then Invisible:Enable() else Invisible:Disable() end
        N("Invisible", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Invisible", invisToggle)

MovTab:Section({ Expanded = false, Title = "Camera" })

fcKey = Enum.KeyCode.V
fcToggle = MovTab:Toggle({
    Title    = "Free Cam",
    Value    = false,
    Tooltip  = "Detach camera for cinematic views",
    Callback = function(v)
        if v then FreeCam:Enable() else FreeCam:Disable() end
        N("Free Cam", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("FreeCam", fcToggle)
fcSpeedSlider = MovTab:Slider({
    Title    = "Free Cam Speed",
    Value    = { Min = 5, Max = 300, Default = 40 },
    Step     = 1,
    Tooltip  = "Camera movement speed (5-300)",
    Callback = function(v) FreeCam:SetSpeed(v) end
})
ConfigMgr:Register("FreeCamSpeed", fcSpeedSlider)
MovTab:Keybind({
    Title    = "FreeCam Keybind",
    Value    = "V",
    Tooltip  = "Press to toggle free cam on/off",
    Callback = function(k)
        fcKey = Enum.KeyCode[k] or Enum.KeyCode.V
        N("FreeCam Keybind", k)
    end
})
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= fcKey then return end
    local s = not FreeCam.Enabled
    fcToggle:Set(s)
    if s then FreeCam:Enable() else FreeCam:Disable() end
end)

MovTab:Section({ Expanded = false, Title = "Special" })

clickTPToggle = MovTab:Toggle({
    Title    = "Click Teleport",
    Value    = false,
    Tooltip  = "Click anywhere to teleport to that location",
    Callback = function(v)
        if v then ClickTP:Enable() else ClickTP:Disable() end
        N("Click Teleport", v and "Enabled — click to tp" or "Disabled")
    end
})
ConfigMgr:Register("ClickTeleport", clickTPToggle)

wowToggle = MovTab:Toggle({
    Title    = "Walk on Water",
    Value    = false,
    Tooltip  = "Walk on water surfaces",
    Callback = function(v)
        if v then WalkOnWater:Enable() else WalkOnWater:Disable() end
        N("Walk on Water", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("WalkOnWater", wowToggle)

MovTab:Section({ Expanded = false, Title = "Orbit" })

orbitToggle = MovTab:Toggle({
    Title    = "Orbit Player",
    Value    = false,
    Tooltip  = "Orbit around a target player in a circle",
    Callback = function(v)
        if v then
            Orbit:Enable()
        else
            Orbit:Disable()
        end
        N("Orbit", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Orbit", orbitToggle)

local function getOrbitPlayerList()
    local list = {}
    local lpp = game:GetService("Players").LocalPlayer
    for _, p in ipairs(game:GetService("Players"):GetPlayers()) do
        if p ~= lpp then
            table.insert(list, p.DisplayName .. " (@" .. p.Name .. ")")
        end
    end
    if #list == 0 then list = {"(no players)"} end
    return list
end

orbitTargetDrop = MovTab:Dropdown({
    Title    = "Orbit Target",
    Tooltip  = "Select the player to orbit around",
    Values   = getOrbitPlayerList(),
    Value    = 1,
    Callback = function(v) Orbit:SetTarget(v) end
})

orbitRadiusSlider = MovTab:Slider({
    Title    = "Orbit Radius",
    Value    = { Min = 5, Max = 50, Default = 15 },
    Step     = 1,
    Tooltip  = "Distance from the target (studs)",
    Callback = function(v) Orbit:SetRadius(v) end
})
ConfigMgr:Register("OrbitRadius", orbitRadiusSlider)

orbitSpeedSlider = MovTab:Slider({
    Title    = "Orbit Speed",
    Value    = { Min = 1, Max = 20, Default = 2 },
    Step     = 1,
    Tooltip  = "How fast to orbit (radians/sec)",
    Callback = function(v) Orbit:SetSpeed(v) end
})
ConfigMgr:Register("OrbitSpeed", orbitSpeedSlider)

orbitHeightSlider = MovTab:Slider({
    Title    = "Orbit Height",
    Value    = { Min = 0, Max = 30, Default = 5 },
    Step     = 1,
    Tooltip  = "Height above the target (studs)",
    Callback = function(v) Orbit:SetHeight(v) end
})
ConfigMgr:Register("OrbitHeight", orbitHeightSlider)

-- ══════════════════════════════════════════════════════════════════════════════
-- MACRO RECORDER TAB
-- ══════════════════════════════════════════════════════════════════════════════

-- Macro name input
MacroTab:Section({ Expanded = false, Title = "Interface" })
macroNameInput = MacroTab:Input({
    Title = "Macro Name",
    Placeholder = "e.g. route_to_peak",
    Value = "",
    Tooltip = "Name your macro before recording",
    Callback = function() end
})

MacroTab:Section({ Expanded = false, Title = "Status" })
macroStatusText = MacroTab:Paragraph({
    Title = "Status",
    Content = "Idle"
})

MacroTab:Section({ Expanded = false, Title = "Recording" })

MacroTab:Button({
    Title = "Start Recording",
    Icon  = "circle",
    Tooltip = "Begin recording your movement path",
    Callback = function()
        local name = macroNameInput.Value
        if not name or name == "" then
            name = "macro_" .. os.time()
        end
        if MacroRec:StartRecording(name) then
            N("Macro", "Recording: " .. name)
        end
    end
})

MacroTab:Button({
    Title = "Stop Recording",
    Icon  = "square",
    Tooltip = "Stop and save the current recording",
    Callback = function()
        local macro = MacroRec:StopRecording()
        if macro then
            N("Macro", "Stopped: " .. #macro.points .. " points captured")
        end
    end
})

MacroTab:Section({ Expanded = false, Title = "Playback" })

MacroTab:Button({
    Title = "Play Current Macro",
    Icon  = "play",
    Tooltip = "Play back the selected macro with smooth interpolation",
    Callback = function()
        local macro = MacroRec:GetCurrentMacro()
        if macro then
            MacroRec:StartPlayback(macro)
            N("Macro", "Playing: " .. (macro.name or "unnamed"))
        else
            N("Macro", "No macro loaded")
        end
    end
})

MacroTab:Button({
    Title = "Pause / Resume",
    Icon  = "pause",
    Tooltip = "Pause or resume macro playback",
    Callback = function()
        MacroRec:PausePlayback()
    end
})

MacroTab:Button({
    Title = "Stop Playback",
    Icon  = "square",
    Tooltip = "Stop macro playback immediately",
    Callback = function()
        MacroRec:StopPlayback()
    end
})

speedSlider = MacroTab:Slider({
    Title = "Playback Speed",
    Value = { Min = 1, Max = 10, Default = 1 },
    Step = 1,
    Tooltip = "Macro playback speed multiplier (1x-10x)",
    Callback = function(v) MacroRec:SetPlaybackSpeed(v) end
})
ConfigMgr:Register("MacroSpeed", speedSlider)

loopToggle = MacroTab:Toggle({
    Title = "Loop Playback",
    Value = false,
    Tooltip = "Replay macro continuously after finishing",
    Callback = function(v) MacroRec:SetLoop(v) end
})
ConfigMgr:Register("MacroLoop", loopToggle)

antiFallToggle = MacroTab:Toggle({
    Title = "Anti-Fall (auto-recover)",
    Value = true,
    Tooltip = "Auto-correct position if character falls during playback",
    Callback = function(v) MacroRec.AntiFall = v end
})
ConfigMgr:Register("MacroAntiFall", antiFallToggle)

recordInputsToggle = MacroTab:Toggle({
    Title = "Record Inputs (jump, WASD, click)",
    Value = true,
    Tooltip = "Capture keyboard/mouse inputs during recording",
    Callback = function(v) MacroRec.RecordInputs = v end
})
ConfigMgr:Register("MacroRecordInputs", recordInputsToggle)

MacroTab:Section({ Expanded = false, Title = "Position Backtracker (Rewind)" })

local backtrackerToggle = MacroTab:Toggle({
    Title    = "Position Backtracker",
    Flag     = "Backtracker",
    Value    = false,
    Tooltip  = "Record position history every 0.5s; rewind on demand or fling",
    Callback = function(s)
        if s then Backtracker:Enable() else Backtracker:Disable() end
        N("Backtracker", s and "Enabled (Hotkey: B)" or "Disabled")
    end
})

local backtrackerSecondsSlider = MacroTab:Slider({
    Title    = "Rewind Time (Seconds)",
    Flag     = "BacktrackerSeconds",
    Value    = { Min = 2, Max = 15, Default = 5 },
    Step     = 1,
    Tooltip  = "How many seconds into the past to teleport back",
    Callback = function(v) Backtracker:SetRewindSeconds(v) end
})

local backtrackerAutoFlingToggle = MacroTab:Toggle({
    Title    = "Auto Recover on Fling",
    Flag     = "BacktrackerAutoFling",
    Value    = false,
    Tooltip  = "Automatically rewinds position if extreme fling velocity is detected",
    Callback = function(s) Backtracker:SetAutoFling(s) end
})

MacroTab:Button({
    Title    = "⏪ Rewind Position Now (Hotkey: B)",
    Icon     = "history",
    Tooltip  = "Teleport back to position 5-10s ago and cancel momentum",
    Callback = function()
        if not Backtracker.Enabled then
            N("Backtracker", "Enable Backtracker first!")
            return
        end
        local ok, sec = Backtracker:Backtrack()
        if ok then
            N("Backtracker", "Rewound " .. tostring(sec) .. "s back!")
        else
            N("Backtracker", tostring(sec or "No history"))
        end
    end
})

MacroTab:Section({ Expanded = false, Title = "Save / Load" })

MacroTab:Button({
    Title = "Save Current Macro",
    Icon  = "save",
    Tooltip = "Save the recorded macro to disk",
    Callback = function()
        local macro = MacroRec:GetCurrentMacro()
        if macro then
            local ok, err = MacroRec:SaveMacro(macro.name, macro)
            if ok then
                refreshMacroList()
                N("Macro", "Saved: " .. macro.name)
            else
                N("Macro", "Save failed: " .. tostring(err))
            end
        else
            N("Macro", "No macro to save")
        end
    end
})

macroDropdown = MacroTab:Dropdown({
    Title = "Select Macro",
    Values = refreshMacroList(),
    Value = 1,
    Tooltip = "Choose a saved macro to load or play",
    Callback = function(v) selectedMacroName = v end
})

MacroTab:Button({
    Title = "Refresh List",
    Icon  = "refresh-cw",
    Tooltip = "Refresh the saved macros list",
    Callback = function()
        refreshMacroList()
        N("Macro", "List refreshed")
    end
})

MacroTab:Button({
    Title = "Load Selected",
    Icon  = "folder-open",
    Tooltip = "Load the selected macro for playback",
    Callback = function()
        if selectedMacroName and selectedMacroName ~= "(no macros)" then
            local macro = MacroRec:LoadMacro(selectedMacroName)
            if macro then
                N("Macro", "Loaded: " .. selectedMacroName .. " (" .. #macro.points .. " pts)")
            else
                N("Macro", "Failed to load")
            end
        end
    end
})

MacroTab:Button({
    Title = "Delete Selected",
    Icon  = "trash-2",
    Tooltip = "Permanently delete the selected macro",
    Callback = function()
        if selectedMacroName and selectedMacroName ~= "(no macros)" then
            MacroRec:DeleteMacro(selectedMacroName)
            refreshMacroList()
            N("Macro", "Deleted: " .. selectedMacroName)
        end
    end
})

MacroTab:Section({ Expanded = false, Title = "Import / Export" })

MacroTab:Button({
    Title = "Export to Clipboard",
    Icon  = "share",
    Tooltip = "Copy macro data as JSON to clipboard",
    Callback = function()
        if selectedMacroName and selectedMacroName ~= "(no macros)" then
            local json, err = MacroRec:ExportMacro(selectedMacroName)
            if json then
                N("Macro", "Exported to clipboard")
            else
                N("Macro", "Export failed: " .. tostring(err))
            end
        end
    end
})

importInput = MacroTab:Input({
    Title = "Paste JSON to Import",
    Placeholder = "Paste exported macro here...",
    Value = "",
    Tooltip = "Paste macro JSON data here to import",
    Callback = function() end
})

MacroTab:Button({
    Title = "Import from Clipboard",
    Icon  = "download",
    Tooltip = "Import macro from clipboard or text field",
    Callback = function()
        local clipboard = ""
        if getclipboard then
            pcall(function() clipboard = getclipboard() end)
        end
        if clipboard == "" then
            clipboard = importInput.Value
        end
        if clipboard ~= "" then
            local name, err = MacroRec:ImportMacro(clipboard)
            if name then
                refreshMacroList()
                N("Macro", "Imported: " .. name)
            else
                N("Macro", "Import failed: " .. tostring(err))
            end
        else
            N("Macro", "No data in clipboard or input")
        end
    end
})

-- ══════════════════════════════════════════════════════════════════════════════
-- MACRO QUEUE SECTION (Sequential Playback)
-- ══════════════════════════════════════════════════════════════════════════════
MacroTab:Section({ Expanded = false, Title = "Macro Queue (Sequential)" })

MacroTab:Paragraph({
    Title = "Queue Info",
    Content = "Chain macros: play one after another automatically"
})

-- Queue dropdown to show current queue
queueDisplayDropdown = nil
selectedQueueItem = nil

local function refreshQueueDisplay()
    local queue = MacroRec:GetQueue()
    local names = {}
    for i, item in ipairs(queue) do
        names[#names + 1] = (i .. ". " .. item.name)
    end
    if #names == 0 then names = {"(empty queue)"} end
    if queueDisplayDropdown then
        queueDisplayDropdown:Refresh(names)
        queueDisplayDropdown:Select(names[1])
        selectedQueueItem = names[1]
    end
    return names
end

MacroTab:Button({
    Title = "Add Selected to Queue",
    Icon  = "plus",
    Tooltip = "Add selected macro to the playback queue",
    Callback = function()
        if selectedMacroName and selectedMacroName ~= "(no macros)" then
            if MacroRec:AddToQueue(selectedMacroName) then
                refreshQueueDisplay()
                N("Queue", "Added: " .. selectedMacroName)
            else
                N("Queue", "Already in queue or invalid")
            end
        else
            N("Queue", "Select a macro first")
        end
    end
})

MacroTab:Button({
    Title = "Remove Selected from Queue",
    Icon  = "minus",
    Tooltip = "Remove selected macro from queue",
    Callback = function()
        if selectedQueueItem and selectedQueueItem ~= "(empty queue)" then
            -- Extract macro name from "1. macro_name" format
            local macroName = selectedQueueItem:match("%d+%.%s+(.+)")
            if macroName and MacroRec:RemoveFromQueue(macroName) then
                refreshQueueDisplay()
                N("Queue", "Removed: " .. macroName)
            end
        end
    end
})

MacroTab:Button({
    Title = "Clear Queue",
    Icon  = "trash",
    Tooltip = "Remove all macros from the queue",
    Callback = function()
        MacroRec:ClearQueue()
        refreshQueueDisplay()
        N("Queue", "Queue cleared")
    end
})

queueDisplayDropdown = MacroTab:Dropdown({
    Title = "Current Queue",
    Tooltip = "View macros in the playback queue",
    Values = refreshQueueDisplay(),
    Value = 1,
    Callback = function(v) selectedQueueItem = v end
})

queueLoopToggle = MacroTab:Toggle({
    Title = "Loop Queue",
    Tooltip = "Replay the entire queue continuously",
    Value = true,
    Callback = function(v)
        MacroRec:SetQueueLoop(v)
        N("Queue", v and "Loop enabled" or "Loop disabled")
    end
})
ConfigMgr:Register("MacroQueueLoop", queueLoopToggle)

MacroTab:Section({ Expanded = false, Title = "Queue Playback" })

MacroTab:Button({
    Title = "Start Queue Playback",
    Icon  = "play",
    Tooltip = "Start sequential macro queue playback",
    Callback = function()
        if #MacroRec:GetQueue() == 0 then
            N("Queue", "Queue is empty! Add macros first")
            return
        end
        if MacroRec:StartQueuePlayback() then
            N("Queue", "Queue playback started")
        else
            N("Queue", "Failed to start queue playback")
        end
    end
})

MacroTab:Button({
    Title = "Stop Queue Playback",
    Icon  = "square",
    Tooltip = "Stop the macro queue playback",
    Callback = function()
        MacroRec:StopQueuePlayback()
        N("Queue", "Queue stopped")
    end
})

-- Per-map info
MacroTab:Section({ Expanded = false, Title = "Map Info" })
MacroTab:Paragraph({
    Title = "Current Map",
    Content = "PlaceId: " .. tostring(game.PlaceId)
})

perMapToggle = MacroTab:Toggle({
    Title = "Per-Map Macros",
    Tooltip = "Save macros per game instead of globally",
    Value = true,
    Callback = function(v)
        MacroRec.PerMapEnabled = v
        N("Macro", v and "Macros saved per game" or "Macros shared across games")
        refreshMacroList()
    end
})
ConfigMgr:Register("MacroPerMap", perMapToggle)

-- Status updater
task.spawn(function()
    while true do
        if macroStatusText then
            pcall(function()
                local status = MacroRec:GetStatus()
                macroStatusText:Set(status)
            end)
        end
        task.wait(0.5)
    end
end)

-- ══════════════════════════════════════════════════════════════════════════════
-- VISUAL TAB
-- ══════════════════════════════════════════════════════════════════════════════
VisTab:Section({ Expanded = false, Title = "Rendering" })

perfStatsToggle = VisTab:Toggle({
    Title    = "Perf Stats (HUD)",
    Tooltip = "Show real-time FPS and performance overlay",
    Value    = true,
    Callback = function(v)
        if v then PerfStats:Enable() else PerfStats:Disable() end
        N("Perf Stats", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("PerfStats", perfStatsToggle)
espToggle = VisTab:Toggle({
    Title    = "ESP",
    Flag     = "ESP",
    Tooltip = "See players through walls",
    Value    = false,
    Callback = function(v)
        if v then ESP:Enable() else ESP:Disable() end
        N("ESP", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("ESP", espToggle)
fullBrightToggle = VisTab:Toggle({
    Title    = "FullBright",
    Tooltip = "Remove all darkness and shadows",
    Value    = false,
    Callback = function(v)
        if v then FullBright:Enable() else FullBright:Disable() end
        N("FullBright", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("FullBright", fullBrightToggle)
removeFogToggle = VisTab:Toggle({
    Title    = "Remove Fog",
    Tooltip = "Clear fog for better visibility",
    Value    = false,
    Callback = function(v)
        if v then RemoveFog:Enable() else RemoveFog:Disable() end
        N("Remove Fog", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("RemoveFog", removeFogToggle)

VisTab:Section({ Expanded = false, Title = "ESP Settings" })

local EC = {
    White  = Color3.fromRGB(255,255,255), Red    = Color3.fromRGB(255,60,60),
    Green  = Color3.fromRGB(60,220,80),   Blue   = Color3.fromRGB(60,130,255),
    Yellow = Color3.fromRGB(255,220,50),  Cyan   = Color3.fromRGB(60,220,255),
    Pink   = Color3.fromRGB(255,100,200)
}
espColorDrop = VisTab:Dropdown({
    Title    = "ESP Color",
    Tooltip = "Color of the ESP overlay",
    Values   = {"White","Red","Green","Blue","Yellow","Cyan","Pink"},
    Value    = "White",
    Callback = function(v) ESP:SetColor(EC[v] or Color3.new(1,1,1)) end
})
ConfigMgr:Register("ESPColor", espColorDrop)
espOpacitySlider = VisTab:Slider({
    Title    = "ESP Fill Opacity",
    Tooltip = "ESP box fill transparency (0-100)",
    Value    = { Min = 0, Max = 100, Default = 15 },
    Step     = 1,
    Callback = function(v) ESP:SetOpacity(v) end
})
ConfigMgr:Register("ESPOpacity", espOpacitySlider)
espModeDrop = VisTab:Dropdown({
    Title    = "ESP Show Mode",
    Tooltip = "Show body, name, or both",
    Values   = {"Both","Body","Name"},
    Value    = "Both",
    Callback = function(v) ESP:SetShowMode(v) end
})
ConfigMgr:Register("ESPMode", espModeDrop)

espTeamColorToggle = VisTab:Toggle({
    Title    = "Team Color (Override ESP Color by Team)",
    Value    = false,
    Tooltip  = "Use the player's team color instead of the selected ESP color",
    Callback = function(v)
        ESP:SetTeamColor(v)
        N("ESP", v and "Team Color Enabled" or "Team Color Disabled")
    end
})
ConfigMgr:Register("ESPTeamColor", espTeamColorToggle)

espSkeletonToggle = VisTab:Toggle({
    Title    = "Skeleton ESP (Bone Lines)",
    Value    = false,
    Tooltip  = "Draw skeleton bone lines through walls (requires Drawing API)",
    Callback = function(v)
        ESP:SetShowSkeleton(v)
        N("ESP", v and "Skeleton Enabled" or "Skeleton Disabled")
    end
})
ConfigMgr:Register("ESPSkeleton", espSkeletonToggle)

VisTab:Section({ Expanded = false, Title = "Tracer" })

tracerToggle = VisTab:Toggle({
    Title    = "Player Tracer",
    Tooltip = "Draw lines from screen to players",
    Value    = false,
    Callback = function(v)
        if v then Tracer:Enable() else Tracer:Disable() end
        N("Tracer", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Tracer", tracerToggle)
local TC = {
    White  = Color3.fromRGB(255,255,255), Red    = Color3.fromRGB(255,60,60),
    Green  = Color3.fromRGB(60,220,80),   Blue   = Color3.fromRGB(60,130,255),
    Yellow = Color3.fromRGB(255,220,50),  Cyan   = Color3.fromRGB(60,220,255),
}
tracerColorDrop = VisTab:Dropdown({
    Title    = "Tracer Color",
    Tooltip = "Color of tracer lines",
    Values   = {"White","Red","Green","Blue","Yellow","Cyan"},
    Value    = "White",
    Callback = function(v) Tracer:SetColor(TC[v] or Color3.new(1,1,1)) end
})
ConfigMgr:Register("TracerColor", tracerColorDrop)
tracerOpacitySlider = VisTab:Slider({
    Title    = "Tracer Opacity",
    Tooltip = "Tracer line transparency (0-100)",
    Value    = { Min = 0, Max = 100, Default = 100 },
    Step     = 1,
    Callback = function(v) Tracer:SetOpacity(v) end
})
ConfigMgr:Register("TracerOpacity", tracerOpacitySlider)
tracerThickSlider = VisTab:Slider({
    Title    = "Tracer Thickness",
    Tooltip = "Tracer line width (1-8)",
    Value    = { Min = 1, Max = 8, Default = 2 },
    Step     = 1,
    Callback = function(v) Tracer:SetThickness(v) end
})
ConfigMgr:Register("TracerThickness", tracerThickSlider)

VisTab:Section({ Expanded = false, Title = "Performance & Anti-Lag" })
antiLagToggle = VisTab:Toggle({
    Title    = "Anti-Lag Mode",
    Tooltip  = "Disable heavy particles, shadows, and terrain details",
    Value    = false,
    Callback = function(v)
        if v then PerfBooster:Enable() else PerfBooster:Disable() end
        N("Anti-Lag Mode", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiLagMode", antiLagToggle)

superAntiLagToggle = VisTab:Toggle({
    Title    = "Super Anti-Lag (Potato Map)",
    Flag     = "SuperAntiLag",
    Tooltip  = "Convert map to smooth plastic low-poly blocks & strip textures for maximum FPS",
    Value    = false,
    Callback = function(v)
        if v then PerfBooster:EnablePotato() else PerfBooster:DisablePotato() end
        N("Super Anti-Lag", v and "Potato Mode Enabled" or "Potato Mode Disabled")
    end
})
ConfigMgr:Register("SuperAntiLag", superAntiLagToggle)

fpsCapSlider = VisTab:Slider({
    Title    = "FPS Cap",
    Tooltip  = "Set maximum FPS cap (30-240)",
    Value    = { Min = 30, Max = 240, Default = 60 },
    Step     = 5,
    Callback = function(v) PerfBooster:SetFPSCap(v) end
})
ConfigMgr:Register("FPSCap", fpsCapSlider)

VisTab:Section({ Expanded = false, Title = "Camera" })

fovToggle = VisTab:Toggle({
    Title    = "FOV Modifier",
    Value    = false,
    Tooltip  = "Adjust the camera Field of View (40-120)",
    Callback = function(v)
        if v then FOVMod:Enable() else FOVMod:Disable() end
        N("FOV Modifier", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("FOVModifier", fovToggle)

fovSlider = VisTab:Slider({
    Title    = "Field of View",
    Value    = { Min = 40, Max = 120, Default = 70 },
    Step     = 1,
    Tooltip  = "Camera FOV value (40 narrow - 120 wide)",
    Callback = function(v) FOVMod:SetFOV(v) end
})
ConfigMgr:Register("FOVValue", fovSlider)

VisTab:Section({ Expanded = false, Title = "Radar" })

radarToggle = VisTab:Toggle({
    Title    = "Radar",
    Value    = false,
    Tooltip  = "Show a corner minimap with player dots",
    Callback = function(v)
        if v then Radar:Enable() else Radar:Disable() end
        N("Radar", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Radar", radarToggle)

radarRangeSlider = VisTab:Slider({
    Title    = "Radar Range",
    Value    = { Min = 50, Max = 500, Default = 200 },
    Step     = 10,
    Tooltip  = "Detection range for the radar (studs)",
    Callback = function(v) Radar:SetRange(v) end
})
ConfigMgr:Register("RadarRange", radarRangeSlider)

radarSizeSlider = VisTab:Slider({
    Title    = "Radar Size",
    Value    = { Min = 80, Max = 300, Default = 150 },
    Step     = 10,
    Tooltip  = "Pixel size of the radar frame",
    Callback = function(v) Radar:SetSize(v) end
})
ConfigMgr:Register("RadarSize", radarSizeSlider)

radarOpacitySlider = VisTab:Slider({
    Title    = "Radar Opacity",
    Value    = { Min = 10, Max = 100, Default = 80 },
    Step     = 5,
    Tooltip  = "Background opacity of the radar (10-100%%)",
    Callback = function(v) Radar:SetOpacity(v) end
})
ConfigMgr:Register("RadarOpacity", radarOpacitySlider)

-- ══════════════════════════════════════════════════════════════════════════════
-- COMBAT TAB
-- ══════════════════════════════════════════════════════════════════════════════
CombatTab:Section({ Expanded = false, Title = "Kill Aura" })

killAuraToggle = CombatTab:Toggle({
    Title    = "Kill Aura",
    Tooltip = "Auto-attack nearby enemies",
    Value    = false,
    Callback = function(v)
        if v then KillAura:Enable() else KillAura:Disable() end
        N("Kill Aura", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("KillAura", killAuraToggle)

killAuraRadiusSlider = CombatTab:Slider({
    Title    = "Radius",
    Tooltip = "Kill aura detection range (5-50)",
    Value    = { Min = 5, Max = 50, Default = 15 },
    Step     = 1,
    Callback = function(v) KillAura:SetRadius(v) end
})
ConfigMgr:Register("KillAuraRadius", killAuraRadiusSlider)

killAuraIntervalSlider = CombatTab:Slider({
    Title    = "Attack Interval (ms)",
    Tooltip = "Time between attacks in milliseconds",
    Value    = { Min = 50, Max = 1000, Default = 100 },
    Step     = 50,
    Callback = function(v) KillAura:SetAttackInterval(v / 1000) end
})
ConfigMgr:Register("KillAuraInterval", killAuraIntervalSlider)

killAuraPlayersToggle = CombatTab:Toggle({
    Title    = "Target Players",
    Tooltip = "Include players in kill aura targets",
    Value    = true,
    Callback = function(v) KillAura:SetTargetPlayers(v) end
})
ConfigMgr:Register("KillAuraPlayers", killAuraPlayersToggle)

killAuraNPCsToggle = CombatTab:Toggle({
    Title    = "Target NPCs",
    Tooltip = "Include NPCs in kill aura targets",
    Value    = true,
    Callback = function(v) KillAura:SetTargetNPCs(v) end
})
ConfigMgr:Register("KillAuraNPCs", killAuraNPCsToggle)

killAuraTeamToggle = CombatTab:Toggle({
    Title    = "Team Check",
    Tooltip = "Skip teammates when attacking",
    Value    = true,
    Callback = function(v) KillAura:SetTeamCheck(v) end
})
ConfigMgr:Register("KillAuraTeamCheck", killAuraTeamToggle)

CombatTab:Section({ Expanded = false, Title = "Hitbox Expander" })

hitboxToggle = CombatTab:Toggle({
    Title    = "Hitbox Expander",
    Tooltip = "Visualize and expand hitboxes",
    Value    = false,
    Callback = function(v)
        if v then HitboxExp:Enable() else HitboxExp:Disable() end
        N("Hitbox Expander", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("HitboxExpander", hitboxToggle)
hitboxSizeSlider = CombatTab:Slider({
    Title    = "Size",
    Tooltip = "Hitbox expansion size (5-30)",
    Value    = { Min = 5, Max = 30, Default = 10 },
    Step     = 1,
    Callback = function(v) HitboxExp:SetSize(v) end
})
ConfigMgr:Register("HitboxSize", hitboxSizeSlider)
hitboxAlphaSlider = CombatTab:Slider({
    Title    = "Transparency",
    Tooltip = "Hitbox visual transparency (0-100)",
    Value    = { Min = 0, Max = 100, Default = 80 },
    Step     = 1,
    Callback = function(v) HitboxExp:SetTransparency(v) end
})
ConfigMgr:Register("HitboxTransparency", hitboxAlphaSlider)
local HC = {
    Red    = Color3.fromRGB(255,60,60),  Green  = Color3.fromRGB(60,220,80),
    Blue   = Color3.fromRGB(60,130,255), Yellow = Color3.fromRGB(255,220,50),
    Cyan   = Color3.fromRGB(60,220,255), Pink   = Color3.fromRGB(255,100,200),
    White  = Color3.fromRGB(255,255,255), Orange = Color3.fromRGB(255,150,30),
}
hitboxColorDrop = CombatTab:Dropdown({
    Title    = "Color",
    Tooltip = "Hitbox overlay color",
    Values   = {"Red","Green","Blue","Yellow","Cyan","Pink","White","Orange"},
    Value    = "Red",
    Callback = function(v) HitboxExp:SetColor(HC[v] or Color3.fromRGB(255,60,60)) end
})
ConfigMgr:Register("HitboxColor", hitboxColorDrop)
teamCheckToggle = CombatTab:Toggle({
    Title    = "Team Check",
    Tooltip = "Skip teammates for hitbox expansion",
    Value    = true,
    Callback = function(v)
        HitboxExp:SetTeamCheck(v)
        N("Team Check", v and "Skip teammates" or "Target all")
    end
})
ConfigMgr:Register("TeamCheck", teamCheckToggle)

CombatTab:Keybind({
    Title    = "Hitbox Keybind",
    Tooltip = "Press to toggle hitbox expander",
    Value    = "H",
    Callback = function(k)
        hitboxKey = Enum.KeyCode[k] or Enum.KeyCode.H
        N("Hitbox Keybind", k)
    end
})

CombatTab:Section({ Expanded = false, Title = "Quick Switch" })

quickSwitchToggle = CombatTab:Toggle({
    Title    = "Quick Switch",
    Tooltip  = "Auto switch to knife and back on shoot ('qq')",
    Value    = false,
    Callback = function(v)
        if v then QuickSwitch:Enable() else QuickSwitch:Disable() end
        N("Quick Switch", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("QuickSwitch", quickSwitchToggle)

qsShotDelaySlider = CombatTab:Slider({
    Title    = "Shot Delay (ms)",
    Tooltip  = "Delay after shooting before switching weapon (ms)",
    Value    = { Min = 0, Max = 1000, Default = 50 },
    Step     = 5,
    Callback = function(v) QuickSwitch:SetDelayAfterShot(v) end
})
ConfigMgr:Register("QuickSwitchShotDelay", qsShotDelaySlider)

qsSwitchDelaySlider = CombatTab:Slider({
    Title    = "Switch Delay (ms)",
    Tooltip  = "Delay between switches (knife and weapon) (ms)",
    Value    = { Min = 0, Max = 1000, Default = 50 },
    Step     = 5,
    Callback = function(v) QuickSwitch:SetDelayBetweenSwitches(v) end
})
ConfigMgr:Register("QuickSwitchSwitchDelay", qsSwitchDelaySlider)

qsModeDrop = CombatTab:Dropdown({
    Title    = "Switch Type",
    Tooltip  = "Weapon switch key combination",
    Values   = {"Q-Q", "3-1", "Custom"},
    Value    = "Q-Q",
    Callback = function(v) QuickSwitch:SetSwitchType(v) end
})
ConfigMgr:Register("QuickSwitchType", qsModeDrop)

qsFirstKeyInput = CombatTab:Input({
    Title       = "Custom First Key",
    Tooltip     = "First key to press (e.g. Three or Q)",
    Placeholder = "Three",
    Value       = "Q",
    Callback    = function(v) QuickSwitch:SetFirstKey(v) end
})
ConfigMgr:Register("QuickSwitchFirstKey", qsFirstKeyInput)

qsSecondKeyInput = CombatTab:Input({
    Title       = "Custom Second Key",
    Tooltip     = "Second key to press (e.g. One or Q)",
    Placeholder = "One",
    Value       = "Q",
    Callback    = function(v) QuickSwitch:SetSecondKey(v) end
})
ConfigMgr:Register("QuickSwitchSecondKey", qsSecondKeyInput)

CombatTab:Section({ Expanded = false, Title = "Instant Kill" })

ikToggle = CombatTab:Toggle({
    Title    = "Instant Kill NPC",
    Tooltip = "One-hit eliminate NPCs",
    Value    = false,
    Callback = function(v)
        if v then InstantKill:Enable() else InstantKill:Disable() end
        N("Instant Kill", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InstantKill", ikToggle)
local ikModeDrop
ikModeDrop = CombatTab:Dropdown({
    Title    = "Kill Mode",
    Tooltip = "Kill all NPCs or specific names only",
    Values   = {"All","Specific"},
    Value    = "All",
    Callback = function(v)
        InstantKill:SetMode(v)
        N("Kill Mode", v)
    end
})
ConfigMgr:Register("KillMode", ikModeDrop)
ikTargetIn = CombatTab:Input({
    Title       = "Target NPC Name",
    Tooltip = "NPC name to target in Specific mode",
    Placeholder = "e.g. Zombie",
    Value       = "",
    Callback    = function(v) InstantKill:SetTarget(v) end
})
ConfigMgr:Register("KillTarget", ikTargetIn)
CombatTab:Button({
    Title    = "Show Kill Count",
    Tooltip = "Display current NPC kill count",
    Callback = function()
        N("Kill Count", tostring(InstantKill:GetKillCount()).." NPCs")
    end
})

-- ══════════════════════════════════════════════════════════════════════════════
-- PLAYER TAB (Utility & Protection)
-- ══════════════════════════════════════════════════════════════════════════════
PlayerTab:Section({ Expanded = false, Title = "Utility" })

antiAFKToggle = PlayerTab:Toggle({
    Title    = "Anti AFK",
    Tooltip  = "Prevent idle kick (always on when enabled)",
    Value    = false,
    Callback = function(v)
        if v then AntiAFK:Enable() else AntiAFK:Disable() end
        N("Anti AFK", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiAFK", antiAFKToggle)

infStaminaToggle = PlayerTab:Toggle({
    Title    = "Infinite Stamina",
    Tooltip  = "Never get tired while running",
    Value    = false,
    Callback = function(v)
        if v then InfStamina:Enable() else InfStamina:Disable() end
        N("Infinite Stamina", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InfStamina", infStaminaToggle)

godModeToggle = PlayerTab:Toggle({
    Title    = "God Mode",
    Tooltip  = "Become immune to damage (game-dependent)",
    Value    = false,
    Callback = function(v)
        if v then GodMode:Enable() else GodMode:Disable() end
        N("God Mode", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("GodMode", godModeToggle)

PlayerTab:Section({ Expanded = false, Title = "Protection" })

antiDetectToggle = PlayerTab:Toggle({
    Title    = "Anti Detect (Adonis/AC)",
    Tooltip  = "Bypass Adonis anti-cheat detection",
    Value    = false,
    Callback = function(v)
        if AntiDetect then
            if v then AntiDetect:Enable() else AntiDetect:Disable() end
            N("Anti Detect", v and "Enabled" or "Disabled")
        end
    end
})
ConfigMgr:Register("AntiDetect", antiDetectToggle)

noFallToggle = PlayerTab:Toggle({
    Title    = "No Fall Damage",
    Tooltip  = "Immune to fall damage",
    Value    = false,
    Callback = function(v)
        if v then NoFallDmg:Enable() else NoFallDmg:Disable() end
        N("No Fall Damage", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("NoFallDamage", noFallToggle)

antiFlingToggle = PlayerTab:Toggle({
    Title    = "Anti Fling",
    Tooltip  = "Protection against being flung by other players",
    Value    = false,
    Callback = function(v)
        if v then AntiFling:Enable() else AntiFling:Disable() end
        N("Anti Fling", v and "Enabled (Enhanced)" or "Disabled")
    end
})
ConfigMgr:Register("AntiFling", antiFlingToggle)

flingThreshSlider = PlayerTab:Slider({
    Title    = "Fling Threshold",
    Tooltip  = "Velocity spike threshold to trigger anti-fling",
    Value    = { Min = 50, Max = 500, Default = 150 },
    Step     = 10,
    Callback = function(v) AntiFling:SetThreshold(v) end
})
ConfigMgr:Register("FlingThreshold", flingThreshSlider)

massManipToggle = PlayerTab:Toggle({
    Title    = "Mass Manipulation",
    Tooltip  = "Increase character mass to resist flings",
    Value    = true,
    Callback = function(v) 
        AntiFling:SetMassManipulation(v)
        N("Anti Fling", v and "Heavy mode ON" or "Heavy mode OFF")
    end
})
ConfigMgr:Register("MassManipulation", massManipToggle)

antiVoidToggle = PlayerTab:Toggle({
    Title    = "Anti Void",
    Tooltip  = "Teleport back when falling into the void",
    Value    = false,
    Callback = function(v)
        if v then AntiVoid:Enable() else AntiVoid:Disable() end
        N("Anti Void", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiVoid", antiVoidToggle)

voidThreshSlider = PlayerTab:Slider({
    Title    = "Void Threshold (Y)",
    Tooltip  = "Y position that triggers anti-void teleport",
    Value    = { Min = -200, Max = 0, Default = -50 },
    Step     = 10,
    Callback = function(v) AntiVoid:SetVoidThreshold(v) end
})
ConfigMgr:Register("VoidThreshold", voidThreshSlider)

PlayerTab:Section({ Expanded = false, Title = "Exploit" })

local gpSpoofToggle
pcall(function()
    gpSpoofToggle = PlayerTab:Toggle({
        Title    = "Gamepass Spoof",
        Tooltip  = "Spoof gamepass ownership and hook UserOwnsGamePassAsync",
        Value    = false,
        Callback = function(v)
            if v then GamepassSpoof:Enable() else GamepassSpoof:Disable() end
            N("Gamepass Spoof", v and "Spoofing ownership" or "Disabled")
        end
    })
    ConfigMgr:Register("GamepassSpoof", gpSpoofToggle)
end)

local gpInstantToggle
pcall(function()
    gpInstantToggle = PlayerTab:Toggle({
        Title    = "Instant Purchase",
        Tooltip  = "Automatically auto-complete purchase prompts instantly",
        Value    = false,
        Callback = function(v)
            GamepassSpoof.InstantPurchase = v
            N("Instant Purchase", v and "Auto-confirm ON" or "Auto-confirm OFF")
        end
    })
    ConfigMgr:Register("GamepassInstant", gpInstantToggle)
end)

local gpInjectToggle
pcall(function()
    gpInjectToggle = PlayerTab:Toggle({
        Title    = "Inject Prompt Buttons",
        Tooltip  = "Inject Free/Copy/Auto buttons into Roblox purchase prompts",
        Value    = false,
        Callback = function(v)
            GamepassSpoof.InjectButtons = v
            N("Prompt Buttons", v and "Injections active" or "Injections inactive")
        end
    })
    ConfigMgr:Register("GamepassInjectButtons", gpInjectToggle)
end)

pcall(function()
    PlayerTab:Button({
        Title    = "⚡ Auto Mass Purchase",
        Tooltip  = "Simulate purchase success for all game gamepasses and products",
        Callback = function()
            if not GamepassSpoof.Enabled then
                N("Mass Purchase", "Enable Gamepass Spoof first!")
                return
            end
            GamepassSpoof:PerformAutoMassPurchase(N)
        end
    })
end)

PlayerTab:Section({ Expanded = false, Title = "Avatar Customizer" })

avatarCustomizerToggle = PlayerTab:Toggle({
    Title    = "Avatar Customizer",
    Tooltip  = "Enable local and replicated avatar modifications (Headless, Korblox)",
    Value    = false,
    Callback = function(v)
        if v then AvatarSpoof:Enable() else AvatarSpoof:Disable() end
        N("Avatar Customizer", v and "Customizer Enabled" or "Customizer Disabled")
    end
})
ConfigMgr:Register("AvatarCustomizer", avatarCustomizerToggle)

headlessToggle = PlayerTab:Toggle({
    Title    = "Headless Head",
    Tooltip  = "Make your head and face invisible (local/replicated if supported)",
    Value    = false,
    Callback = function(v)
        AvatarSpoof:SetHeadless(v)
        N("Headless Head", v and "Headless ON" or "Headless OFF")
    end
})
ConfigMgr:Register("AvatarHeadless", headlessToggle)

korbloxToggle = PlayerTab:Toggle({
    Title    = "Korblox Leg",
    Tooltip  = "Replace your right leg with Korblox leg (local/replicated if supported)",
    Value    = false,
    Callback = function(v)
        AvatarSpoof:SetKorbloxLeg(v)
        N("Korblox Leg", v and "Korblox leg ON" or "Korblox leg OFF")
    end
})
ConfigMgr:Register("AvatarKorblox", korbloxToggle)

accessoryIdInput = PlayerTab:Input({
    Title       = "Catalog ID",
    Placeholder = "Enter Catalog Asset ID (e.g. 10159600649)",
    Value       = "",
    Tooltip     = "Type a Roblox catalog accessory ID to add",
    Callback    = function(text)
        AvatarSpoof.CustomAccessoryId = text
    end
})

-- Build initial dropdown list from saved accessories
local savedAccList = AvatarSpoof:GetSavedAccessoryList()
if #savedAccList == 0 then savedAccList = {"(no accessories saved)"} end
local selectedSavedAcc = savedAccList[1]

savedAccDropdown = PlayerTab:Dropdown({
    Title    = "Saved Accessories",
    Values   = savedAccList,
    Value    = savedAccList[1],
    Tooltip  = "Select a saved accessory to wear or remove",
    Callback = function(v)
        selectedSavedAcc = v
    end
})

-- Helper to refresh the dropdown after adding/removing
local function refreshAccDropdown()
    local list = AvatarSpoof:GetSavedAccessoryList()
    if #list == 0 then list = {"(no accessories saved)"} end
    savedAccDropdown:Refresh(list)
    selectedSavedAcc = list[1]
    savedAccDropdown:Select(list[1])
end

PlayerTab:Button({
    Title    = "➕ Add Accessory",
    Tooltip  = "Save the catalog ID and auto-equip it",
    Callback = function()
        if not AvatarSpoof.Enabled then
            N("Avatar Customizer", "Enable Avatar Customizer first!")
            return
        end
        local id = AvatarSpoof.CustomAccessoryId
        if not id or id == "" then
            N("Avatar Customizer", "Please enter a Catalog ID first!")
            return
        end
        if not tonumber(id) then
            N("Avatar Customizer", "Invalid ID — must be a number!")
            return
        end
        local added = AvatarSpoof:AddSavedAccessory(id)
        if added then
            N("Avatar Customizer", "Added & equipped: " .. id)
            refreshAccDropdown()
        else
            N("Avatar Customizer", "ID already saved: " .. id)
        end
    end
})

PlayerTab:Button({
    Title    = "👕 Wear Selected",
    Tooltip  = "Equip the accessory selected in the dropdown",
    Callback = function()
        if not AvatarSpoof.Enabled then
            N("Avatar Customizer", "Enable Avatar Customizer first!")
            return
        end
        if not selectedSavedAcc or selectedSavedAcc == "(no accessories saved)" then
            N("Avatar Customizer", "No accessory selected!")
            return
        end
        AvatarSpoof:WearAccessory(selectedSavedAcc)
        N("Avatar Customizer", "Equipped: " .. selectedSavedAcc)
    end
})

PlayerTab:Button({
    Title    = "Wear Selected",
    Icon     = "shirt",
    Tooltip  = "Equip the accessory selected in the dropdown",
    Callback = function()
        if not AvatarSpoof.Enabled then
            N("Avatar Customizer", "Enable Avatar Customizer first!")
            return
        end
        if not selectedSavedAcc or selectedSavedAcc == "(no accessories saved)" then
            N("Avatar Customizer", "No accessory selected!")
            return
        end
        AvatarSpoof:WearAccessory(selectedSavedAcc)
        N("Avatar Customizer", "Equipped: " .. selectedSavedAcc)
    end
})

PlayerTab:Button({
    Title    = "Wear All Saved",
    Icon     = "shirt",
    Tooltip  = "Equip all saved accessories at once",
    Callback = function()
        if not AvatarSpoof.Enabled then
            N("Avatar Customizer", "Enable Avatar Customizer first!")
            return
        end
        local list = AvatarSpoof:GetSavedAccessoryList()
        if #list == 0 then
            N("Avatar Customizer", "No saved accessories!")
            return
        end
        AvatarSpoof:WearAllSaved()
        N("Avatar Customizer", "Equipped all " .. #list .. " accessories")
    end
})

PlayerTab:Button({
    Title    = "Remove Selected",
    Icon     = "trash-2",
    Tooltip  = "Unequip and delete the selected accessory from saved list",
    Callback = function()
        if not selectedSavedAcc or selectedSavedAcc == "(no accessories saved)" then
            N("Avatar Customizer", "No accessory selected!")
            return
        end
        local removed = AvatarSpoof:RemoveSavedAccessory(selectedSavedAcc)
        if removed then
            N("Avatar Customizer", "Removed: " .. selectedSavedAcc)
            refreshAccDropdown()
        else
            N("Avatar Customizer", "Failed to remove!")
        end
    end
})

PlayerTab:Button({
    Title    = "Remove All",
    Icon     = "trash",
    Tooltip  = "Unequip and clear all saved accessories",
    Callback = function()
        AvatarSpoof:ClearAllSaved()
        N("Avatar Customizer", "All accessories removed & cleared")
        refreshAccDropdown()
    end
})


PlayerTab:Section({ Expanded = false, Title = "Info" })
PlayerTab:Paragraph({ Title = "Username", Content = lp.Name })
PlayerTab:Paragraph({ Title = "User ID",  Content = tostring(lp.UserId) })
PlayerTab:Button({
    Title    = "Copy Player ID",
    Icon     = "copy",
    Tooltip = "Copy your Roblox user ID to clipboard",
    Callback = function()
        pcall(function() setclipboard(tostring(lp.UserId)) end)
        N("Player ID", tostring(lp.UserId))
    end
})

PlayerTab:Section({ Expanded = false, Title = "Server Utilities" })
autoRejoinToggle = PlayerTab:Toggle({
    Title    = "Auto Rejoin on Disconnect",
    Flag     = "AutoRejoin",
    Value    = false,
    Tooltip  = "Automatically reconnect to server if disconnected or kicked",
    Callback = function(v)
        if v then Rejoin:EnableAutoRejoin() else Rejoin:DisableAutoRejoin() end
        N("Auto Rejoin", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AutoRejoin", autoRejoinToggle)

PlayerTab:Button({
    Title    = "Rejoin Current Server",
    Icon     = "refresh-cw",
    Tooltip  = "Reconnect to this server instance",
    Callback = function()
        N("Server", "Rejoining...")
        ServerUtils:Rejoin()
    end
})
PlayerTab:Button({
    Title    = "Server Hop",
    Icon     = "shuffle",
    Tooltip  = "Join a different server of the same game",
    Callback = function()
        N("Server", "Finding new server...")
        ServerUtils:ServerHop()
    end
})
PlayerTab:Button({
    Title    = "Copy Server JobID",
    Icon     = "copy",
    Tooltip  = "Copy current server JobID to clipboard",
    Callback = function()
        local ok, id = ServerUtils:CopyJobID()
        if ok then
            N("Server", "Copied JobID to clipboard!")
        else
            N("Server", "JobID: " .. tostring(id))
        end
    end
})

-- ══════════════════════════════════════════════════════════════════════════════
-- TELEPORT TAB
-- ══════════════════════════════════════════════════════════════════════════════
TeleTab:Section({ Expanded = false, Title = "Position" })

TeleTab:Button({
    Title    = "Copy My Position",
    Icon     = "map-pin",
    Tooltip = "Save your current position",
    Callback = function()
        local p = Teleport:SavePosition()
        if p then N("Teleport", ("Saved: %.0f, %.0f, %.0f"):format(p.X,p.Y,p.Z))
        else N("Teleport", "No character") end
    end
})
TeleTab:Button({
    Title    = "Go to Saved Position",
    Icon     = "navigation",
    Tooltip = "Teleport to your last saved position",
    Callback = function()
        if Teleport:GotoSaved(Fly) then N("Teleport", "Teleported")
        else N("Teleport", "No position saved") end
    end
})

TeleTab:Section({ Expanded = false, Title = "To Player" })

selectedPlayer = nil
tpDrop = TeleTab:Dropdown({
    Title    = "Select Player",
    Tooltip = "Choose a player to teleport to",
    Values   = Teleport:GetPlayerList(),
    Value    = 1,
    Callback = function(v) selectedPlayer = v end
})
do local list = Teleport:GetPlayerList(); selectedPlayer = list[1] end

-- Auto-refresh player list when players join/leave
pcall(function()
    Players.PlayerAdded:Connect(function()
        task.wait(1)
        local list = Teleport:GetPlayerList()
        tpDrop:Refresh(list)
        if not selectedPlayer or selectedPlayer == "(no players)" then
            selectedPlayer = list[1]
        end
    end)
    Players.PlayerRemoving:Connect(function(p)
        task.wait(0.5)
        local list = Teleport:GetPlayerList()
        tpDrop:Refresh(list)
        -- If the removed player was selected, reset selection
        if selectedPlayer and (selectedPlayer:find(p.Name) or selectedPlayer == p.Name) then
            selectedPlayer = list[1]
        end
    end)
end)

TeleTab:Button({
    Title    = "Refresh Players",
    Icon     = "refresh-cw",
    Tooltip = "Refresh the player list",
    Callback = function()
        local list = Teleport:GetPlayerList()
        tpDrop:Refresh(list)
        selectedPlayer = list[1]
        N("Players", "Refreshed (" .. (#list == 1 and list[1] == "(no players)" and "0" or tostring(#list)) .. " found)")
    end
})
TeleTab:Button({
    Title    = "Teleport to Player",
    Icon     = "send",
    Tooltip = "Teleport to the selected player",
    Callback = function()
        local raw = selectedPlayer
        if not raw or raw == "(no players)" then return end
        -- Extract actual username from "DisplayName (@Username)" format
        local name = Teleport:ExtractName(raw)
        local ok, reason = Teleport:ToPlayer(name, Fly)
        if ok then
            N("Teleport", "→ " .. raw)
        elseif reason == "left" then
            N("Teleport", raw .. " has left the game")
            -- Auto-refresh the list
            local list = Teleport:GetPlayerList()
            tpDrop:Refresh(list)
            selectedPlayer = list[1]
        elseif reason == "nochar" then
            N("Teleport", raw .. " — character not loaded yet")
        else
            N("Teleport", raw .. " not found")
        end
    end
})

TeleTab:Section({ Expanded = false, Title = "Waypoints" })


wpNameIn = TeleTab:Input({
    Title       = "Waypoint Name",
    Tooltip = "Name for your waypoint",
    Placeholder = "e.g. spawn",
    Value       = "",
    Callback    = function() end
})

selectedWaypoint = nil
local wpDrop

TeleTab:Button({
    Title    = "Create Waypoint",
    Icon     = "plus-circle",
    Tooltip = "Save current position as a waypoint",
    Callback = function()
        local name = wpNameIn.Value or ""
        if name == "" then N("Waypoint", "Enter a name"); return end
        if Waypoint:Exists(name) then N("Waypoint", name.." already exists"); return end
        if Waypoint:Create(name) then
            N("Waypoint", "Created: "..name)
            local list = Waypoint:GetList()
            wpDrop:Refresh(list)
            selectedWaypoint = name
            wpDrop:Select(name)
        else
            N("Waypoint", "Failed to create")
        end
    end
})

wpDrop = TeleTab:Dropdown({
    Title    = "Select Waypoint",
    Tooltip = "Choose a waypoint to teleport to",
    Values   = Waypoint:GetList(),
    Value    = 1,
    Callback = function(v) selectedWaypoint = v end
})
do local list = Waypoint:GetList(); selectedWaypoint = list[1] end

TeleTab:Button({
    Title    = "Refresh Waypoints",
    Icon     = "refresh-cw",
    Tooltip = "Refresh the waypoint list",
    Callback = function()
        local list = Waypoint:GetList()
        wpDrop:Refresh(list)
        selectedWaypoint = list[1]
        N("Waypoints", "Refreshed")
    end
})
TeleTab:Button({
    Title    = "Teleport to Waypoint",
    Icon     = "navigation",
    Tooltip = "Teleport to the selected waypoint",
    Callback = function()
        local name = selectedWaypoint
        if not name or name == "(no waypoints)" then
            N("Waypoint", "Select a waypoint first"); return
        end
        if Waypoint:Teleport(name, Fly) then N("Waypoint", "→ "..name)
        else N("Waypoint", "Failed") end
    end
})
TeleTab:Button({
    Title    = "Delete Waypoint",
    Icon     = "trash-2",
    Tooltip = "Delete the selected waypoint",
    Callback = function()
        local name = selectedWaypoint
        if not name or name == "(no waypoints)" then return end
        if Waypoint:Delete(name) then
            N("Waypoint", "Deleted: "..name)
            local list = Waypoint:GetList()
            wpDrop:Refresh(list)
            selectedWaypoint = list[1]
        else
            N("Waypoint", "Failed to delete")
        end
    end
})

TeleTab:Keybind({
    Title    = "Teleport Keybind",
    Tooltip = "Press to teleport to selected waypoint",
    Value    = "G",
    Callback = function(k)
        tpWaypointKey = Enum.KeyCode[k] or Enum.KeyCode.G
        N("TP Keybind", k)
    end
})

TeleTab:Section({ Expanded = false, Title = "Waypoint Queue (Sequential)" })

TeleTab:Paragraph({
    Title = "Queue Info",
    Content = "Teleport through waypoints in order — stops at last"
})

wpQueueDropdown = nil
selectedWpQueueItem = nil

local function refreshWpQueue()
    local queue = Waypoint:GetQueue()
    local names = {}
    for i, name in ipairs(queue) do
        names[#names + 1] = (i .. ". " .. name)
    end
    if #names == 0 then names = {"(empty queue)"} end
    if wpQueueDropdown then
        wpQueueDropdown:Refresh(names)
        wpQueueDropdown:Select(names[1])
        selectedWpQueueItem = names[1]
    end
    return names
end

TeleTab:Button({
    Title = "Add Selected to Queue",
    Icon  = "plus",
    Tooltip = "Add selected waypoint to the queue",
    Callback = function()
        local name = selectedWaypoint
        if not name or name == "(no waypoints)" then
            N("Queue", "Select a waypoint first"); return
        end
        if Waypoint:AddToQueue(name) then
            refreshWpQueue()
            N("Queue", "Added: " .. name)
        else
            N("Queue", "Already in queue or invalid")
        end
    end
})

TeleTab:Button({
    Title = "Remove Selected from Queue",
    Icon  = "minus",
    Tooltip = "Remove selected waypoint from queue",
    Callback = function()
        if selectedWpQueueItem and selectedWpQueueItem ~= "(empty queue)" then
            local wpName = selectedWpQueueItem:match("%d+%.%s+(.+)")
            if wpName and Waypoint:RemoveFromQueue(wpName) then
                refreshWpQueue()
                N("Queue", "Removed: " .. wpName)
            end
        end
    end
})

TeleTab:Button({
    Title = "Clear Queue",
    Icon  = "trash",
    Tooltip = "Clear the waypoint queue",
    Callback = function()
        Waypoint:ClearQueue()
        refreshWpQueue()
        N("Queue", "Queue cleared")
    end
})

wpQueueDropdown = TeleTab:Dropdown({
    Title = "Current Queue",
    Tooltip = "View waypoints in the teleport queue",
    Values = refreshWpQueue(),
    Value = 1,
    Callback = function(v) selectedWpQueueItem = v end
})

queueDelaySlider = TeleTab:Slider({
    Title = "Delay Between TPs (sec)",
    Tooltip = "Wait time between queue teleports (1-10s)",
    Value = { Min = 1, Max = 10, Default = 2 },
    Step = 1,
    Callback = function(v) Waypoint:SetQueueDelay(v) end
})
ConfigMgr:Register("WpQueueDelay", queueDelaySlider)

TeleTab:Button({
    Title = "Start Queue",
    Icon  = "play",
    Tooltip = "Start sequential waypoint teleport",
    Callback = function()
        if #Waypoint:GetQueue() == 0 then
            N("Queue", "Queue is empty! Add waypoints first"); return
        end
        if Waypoint:StartQueue(Fly, N) then
            N("Queue", "Queue started")
        else
            N("Queue", "Queue already running")
        end
    end
})

TeleTab:Button({
    Title = "Stop Queue",
    Icon  = "square",
    Tooltip = "Stop the waypoint queue",
    Callback = function()
        Waypoint:StopQueue()
        N("Queue", "Queue stopped")
    end
})

TeleTab:Keybind({
    Title    = "Queue Keybind",
    Tooltip = "Press to start/stop waypoint queue",
    Value    = "X",
    Callback = function(k)
        wpQueueKey = Enum.KeyCode[k] or Enum.KeyCode.X
        N("Queue Keybind", k)
    end
})

TeleTab:Section({ Expanded = false, Title = "Server" })

TeleTab:Button({
    Title    = "Rejoin Server",
    Tooltip = "Reconnect to the same server",
    Callback = function()
        N("Rejoin", "Rejoining...")
        task.wait(1.5)
        Rejoin:Execute()
    end
})
TeleTab:Button({
    Title    = "Server Hop",
    Tooltip = "Join a different server of the same game",
    Callback = function()
        N("Server Hop", "Finding server...")
        task.wait(0.5)
        ServerHop:Execute()
    end
})

-- ══════════════════════════════════════════════════════════════════════════════
-- AUTO TAB (Automation Features)
-- ══════════════════════════════════════════════════════════════════════════════
AutoTab:Section({ Expanded = false, Title = "Instant Prompts" })

instantPromptsToggle = AutoTab:Toggle({
    Title    = "Instant Prompts",
    Value    = false,
    Tooltip  = "Auto-complete all ProximityPrompts instantly",
    Callback = function(v)
        if v then InstantPrompts:Enable() else InstantPrompts:Disable() end
        N("Instant Prompts", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InstantPrompts", instantPromptsToggle)

AutoTab:Section({ Expanded = false, Title = "Auto Clicker" })

autoClickerToggle = AutoTab:Toggle({
    Title    = "Auto Clicker",
    Flag     = "AutoClicker",
    Value    = false,
    Tooltip  = "Automatically click at configurable speed",
    Callback = function(v)
        if v then AutoClicker:Enable() else AutoClicker:Disable() end
        N("Auto Clicker", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AutoClicker", autoClickerToggle)

cpsSlider = AutoTab:Slider({
    Title    = "Clicks Per Second (CPS)",
    Value    = { Min = 1, Max = 100, Default = 10 },
    Step     = 1,
    Tooltip  = "How many clicks per second (1-100)",
    Callback = function(v) AutoClicker:SetCPS(v) end
})
ConfigMgr:Register("AutoClickerCPS", cpsSlider)

clickTypeDrop = AutoTab:Dropdown({
    Title    = "Click Type",
    Values   = {"mouse", "tool"},
    Value    = "mouse",
    Tooltip  = "Mouse click or tool activation",
    Callback = function(v) 
        AutoClicker:SetClickType(v)
        N("Auto Clicker", "Click type: " .. v)
    end
})
ConfigMgr:Register("AutoClickerType", clickTypeDrop)

holdDownToggle = AutoTab:Toggle({
    Title    = "Hold Mouse Down",
    Value    = false,
    Tooltip  = "Hold mouse button instead of clicking",
    Callback = function(v) 
        AutoClicker:SetHoldDown(v)
        N("Auto Clicker", v and "Hold mode" or "Click mode")
    end
})
ConfigMgr:Register("AutoClickerHold", holdDownToggle)

randomDelayToggle = AutoTab:Toggle({
    Title    = "Random Delay",
    Value    = true,
    Tooltip  = "Randomize click timing to avoid detection",
    Callback = function(v) 
        AutoClicker:SetRandomDelay(v)
        N("Auto Clicker", v and "Randomized timing" or "Fixed timing")
    end
})
ConfigMgr:Register("AutoClickerRandom", randomDelayToggle)

AutoTab:Keybind({
    Title    = "Auto Clicker Keybind",
    Value    = "C",
    Tooltip  = "Press to toggle auto clicker on/off",
    Callback = function(k)
        autoClickerKey = Enum.KeyCode[k] or Enum.KeyCode.C
        N("AutoClicker Keybind", k)
    end
})

-- Populate Favorites Quick Access Tab (default pinned items)
FavTab:Toggle({
    Title      = "Fly",
    Flag       = "Fly",
    Icon       = "plane",
    _isStarred = true,
    Value      = false,
    Tooltip    = "Quick toggle for Fly",
    Callback   = function(v)
        if v and Fly then
            local fs = (flySpeedSlider and flySpeedSlider.Value) or Fly.Speed or 60
            Fly:SetSpeed(fs)
            Fly:Enable()
        elseif Fly then
            Fly:Disable()
        end
    end
})

FavTab:Toggle({
    Title      = "Speed Hack",
    Flag       = "SpeedHack",
    Icon       = "zap",
    _isStarred = true,
    Value      = false,
    Tooltip    = "Quick toggle for Speed Hack",
    Callback   = function(v)
        if v and Speed then
            local ws = (walkSpeedSlider and walkSpeedSlider.Value) or Speed.WalkSpeed or 16
            local jp = (jumpPowerSlider  and jumpPowerSlider.Value)  or Speed.JumpPower or 50
            Speed:SetWalkSpeed(ws)
            Speed:SetJumpPower(jp)
            Speed:Enable()
        elseif Speed then
            Speed:Disable()
        end
    end
})

FavTab:Toggle({
    Title      = "Player ESP",
    Flag       = "ESP",
    Icon       = "eye",
    _isStarred = true,
    Value      = false,
    Tooltip    = "Quick toggle for ESP",
    Callback   = function(v)
        if v and ESP then ESP:Enable() elseif ESP then ESP:Disable() end
    end
})

FavTab:Toggle({
    Title      = "Super Anti-Lag (Potato Map)",
    Flag       = "SuperAntiLag",
    Icon       = "shield",
    _isStarred = true,
    Value      = false,
    Tooltip    = "Quick toggle for Super Anti-Lag Potato mode",
    Callback   = function(v)
        if v and PerfBooster then PerfBooster:EnablePotato() elseif PerfBooster then PerfBooster:DisablePotato() end
    end
})

FavTab:Toggle({
    Title      = "Noclip",
    Flag       = "Noclip",
    Icon       = "ghost",
    _isStarred = true,
    Value      = false,
    Tooltip    = "Quick toggle for Noclip",
    Callback   = function(v)
        if v and Noclip then Noclip:Enable() elseif Noclip then Noclip:Disable() end
    end
})

FavTab:Toggle({
    Title      = "Auto Clicker",
    Flag       = "AutoClicker",
    Icon       = "mouse-pointer",
    _isStarred = true,
    Value      = false,
    Tooltip    = "Quick toggle for Auto Clicker",
    Callback   = function(v)
        if v and AutoClicker then AutoClicker:Enable() elseif AutoClicker then AutoClicker:Disable() end
    end
})

-- Dynamic favorites: when user stars a toggle from any other tab, create a synced toggle here
FavTab:Section({ Expanded = false, Title = "Your Starred Features" })

Library._favCb = function(flagKey, isStarred, info)
    if isStarred then
        -- Don't duplicate if already exists (default pinned items)
        if _favDynamicToggles[flagKey] then return end
        -- Skip if this is one of the default pinned flags (they're already above)
        local defaults = { Fly=true, SpeedHack=true, ESP=true, SuperAntiLag=true, Noclip=true, AutoClicker=true }
        if defaults[flagKey] then return end

        pcall(function()
            local toggle = FavTab:Toggle({
                Title      = info.Title or flagKey,
                Flag       = info.Flag,
                Icon       = info.Icon,
                _isStarred = true,
                Value      = false,
                Tooltip    = info.Tooltip or ("Quick toggle for " .. (info.Title or flagKey)),
                Callback   = info.Callback,
            })
            _favDynamicToggles[flagKey] = toggle
        end)
    else
        -- Remove the dynamic toggle
        if _favDynamicToggles[flagKey] then
            pcall(function()
                local toggle = _favDynamicToggles[flagKey]
                if toggle and toggle.Frame then
                    toggle.Frame:Destroy()
                end
            end)
            _favDynamicToggles[flagKey] = nil
        end
    end

    -- Save favorites to file for persistence
    pcall(function()
        local favList = {}
        for k, _ in pairs(Library._fav) do
            favList[#favList + 1] = k
        end
        local json = game:GetService("HttpService"):JSONEncode(favList)
        if not isfolder("Leon X") then makefolder("Leon X") end
        writefile("Leon X/favorites.json", json)
    end)
end

-- Load saved favorites from file on boot
pcall(function()
    if isfile and isfile("Leon X/favorites.json") then
        local raw = readfile("Leon X/favorites.json")
        local list = game:GetService("HttpService"):JSONDecode(raw)
        if type(list) == "table" then
            for _, flagKey in ipairs(list) do
                Library._fav[flagKey] = true
            end
        end
    end
end)



-- ══════════════════════════════════════════════════════════════════════════════
-- SETTINGS TAB
-- ══════════════════════════════════════════════════════════════════════════════
SetTab:Section({ Expanded = false, Title = "Interface" })

SetTab:Keybind({
    Title    = "Toggle UI Key",
    Value    = "U",
    Tooltip  = "Key to show/hide the Leon X interface",
    Callback = function(k)
        Window:SetToggleKey(Enum.KeyCode[k])
        N("Toggle Key", k)
    end
})
themeDrop = SetTab:Dropdown({
    Title    = "Theme",
    Values   = {"Default","Cyan","Gold","Emerald","Rose","Violet","Frost"},
    Value    = "Default",
    Tooltip  = "Change the UI color theme",
    Callback = function(v)
        Window:SetTheme(v)
        N("Theme", v)
    end
})
ConfigMgr:Register("Theme", themeDrop)

SetTab:Section({ Expanded = false, Title = "Discord Webhook Logger" })
webhookUrlInput = SetTab:Input({
    Title       = "Webhook URL",
    Placeholder = "https://discord.com/api/webhooks/...",
    Value       = "",
    Tooltip     = "Discord webhook URL for remote event logs",
    Callback    = function(v) WebhookLogger:SetUrl(v) end
})
ConfigMgr:Register("WebhookUrl", webhookUrlInput)

SetTab:Button({
    Title    = "Send Test Notification",
    Icon     = "bell",
    Tooltip  = "Send test embed message to Discord Webhook",
    Callback = function()
        WebhookLogger:SetUrl(webhookUrlInput.Value)
        local ok, err = WebhookLogger:Send("Leon X Test", "Webhook logger is configured and working properly!", 0x3498db)
        if ok then
            N("Webhook Logger", "Test message sent successfully!")
        else
            N("Webhook Logger", "Failed: " .. tostring(err))
        end
    end
})

SetTab:Section({ Expanded = false, Title = "Auto Save" })

autoSaveToggle = SetTab:Toggle({
    Title    = "Auto Save Config",
    Value    = true,
    Tooltip  = "Automatically save settings when they change",
    Callback = function(v)
        ConfigMgr:SetAutoSave(v)
        N("Auto Save", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AutoSaveConfig", autoSaveToggle)

autoSaveIntervalSlider = SetTab:Slider({
    Title    = "Auto Save Interval (s)",
    Value    = { Min = 1, Max = 30, Default = 2 },
    Step     = 1,
    Tooltip  = "How often to check for changes and save (seconds)",
    Callback = function(v) ConfigMgr:SetAutoSaveInterval(v) end
})
ConfigMgr:Register("AutoSaveInterval", autoSaveIntervalSlider)

SetTab:Section({ Expanded = false, Title = "Config" })

cfgNameIn = SetTab:Input({
    Title       = "Config Name",
    Placeholder = "e.g. pvp",
    Value       = "default",
    Tooltip     = "Name for saving/loading configs",
    Callback    = function() end
})

local function getCfgName()
    local v = cfgNameIn.Value
    return (v and v ~= "") and v or "default"
end
local function getCfgList()
    local l = ConfigMgr:List()
    return #l > 0 and l or {"(none)"}
end

selectedConfig = nil
cfgDrop = SetTab:Dropdown({
    Title    = "Select Config",
    Values   = getCfgList(),
    Value    = 1,
    Tooltip  = "Choose a saved config to load or manage",
    Callback = function(v) selectedConfig = v end
})
do local list = getCfgList(); selectedConfig = list[1] end

SetTab:Button({
    Title    = "Save Config",
    Icon     = "save",
    Style    = "Primary",
    Tooltip  = "Save current settings as a config",
    Callback = function()
        local n = getCfgName()
        local ok = ConfigMgr:Save(n)
        N("Config", ok and "Saved: "..n or "Save failed")
        if ok then
            local list = getCfgList()
            cfgDrop:Refresh(list)
            selectedConfig = n
            cfgDrop:Select(n)
        end
    end
})
SetTab:Button({
    Title    = "Load Config",
    Icon     = "folder-open",
    Style    = "Outline",
    Tooltip  = "Load the selected config",
    Callback = function()
        local s = selectedConfig
        if not s or s == "(none)" then return end
        local ok = ConfigMgr:Load(s)
        N("Config", ok and "Loaded: "..s or "Load failed")
    end
})
SetTab:Button({
    Title    = "Delete Config",
    Icon     = "trash-2",
    Style    = "Danger",
    Tooltip  = "Delete the selected config permanently",
    Callback = function()
        local s = selectedConfig
        if not s or s == "(none)" then return end
        ConfigMgr:Delete(s)
        N("Config", "Deleted: "..s)
        local list = getCfgList()
        cfgDrop:Refresh(list)
        selectedConfig = list[1]
    end
})
SetTab:Button({
    Title    = "Set as Default",
    Icon     = "star",
    Style    = "Outline",
    Tooltip  = "Auto-load this config on startup",
    Callback = function()
        local s = selectedConfig
        if not s or s == "(none)" then return end
        local ok = ConfigMgr:SetDefault(s)
        N("Config", ok and s.." is default" or "Failed")
    end
})

SetTab:Section({ Expanded = false, Title = "Config Share Code (Base64)" })

shareCodeInput = SetTab:Input({
    Title       = "Share Code",
    Placeholder = "Paste LX1-... code here",
    Value       = "",
    Tooltip     = "Base64 config code for sharing settings",
    Callback    = function() end
})

SetTab:Button({
    Title    = "Export Config Share Code",
    Icon     = "share",
    Tooltip  = "Copy Base64 share code of current settings to clipboard",
    Callback = function()
        local code = ConfigMgr:ExportCode()
        if setclipboard then
            pcall(setclipboard, code)
            N("Config Share Code", "Copied share code to clipboard!")
        else
            N("Config Share Code", "Exported code (check console)")
            print("[LeonX Share Code] " .. tostring(code))
        end
    end
})

SetTab:Button({
    Title    = "Import Config Share Code",
    Icon     = "download",
    Tooltip  = "Import and set all settings from typed share code",
    Callback = function()
        local code = shareCodeInput.Value
        local ok, msg = ConfigMgr:ImportCode(code)
        if ok then
            N("Config Share Code", "Imported successfully!")
        else
            N("Config Share Code", "Failed: " .. tostring(msg))
        end
    end
})

SetTab:Section({ Expanded = false, Title = "Cache & Performance" })
SetTab:Button({
    Title    = "Clear Encrypted Cache",
    Icon     = "refresh-cw",
    Tooltip  = "Purge local decrypted/encrypted module cache and re-download fresh code on next execute",
    Callback = function()
        clearLocalCache()
        N("Cache", "Cache cleared! Next execution will fetch fresh modules.")
    end
})

SetTab:Section({ Expanded = false, Title = "About" })
SetTab:Paragraph({
    Title   = "Leon X",
    Content = "v"..CURRENT_VERSION.." • by leonx24"
})

-- ════════════════════════════════════════════════════════════════════════════
-- KEYBIND HANDLERS (Universal Mode)
-- ════════════════════════════════════════════════════════════════════════════

-- Noclip keybind
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= noclipKey then return end
    local s = not Noclip.Enabled
    noclipToggle:Set(s)
    if s then Noclip:Enable() else Noclip:Disable() end
end)

-- Teleport to selected waypoint keybind
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= tpWaypointKey then return end
    local name = selectedWaypoint
    if not name or name == "(no waypoints)" then
        N("Waypoint", "No waypoint selected"); return
    end
    if Waypoint:Teleport(name, Fly) then
        N("Waypoint", "→ " .. name)
    else
        N("Waypoint", "Teleport failed")
    end
end)

-- Auto Clicker keybind
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= autoClickerKey then return end
    local s = not AutoClicker.Enabled
    autoClickerToggle:Set(s)
    if s then AutoClicker:Enable() else AutoClicker:Disable() end
end)

-- Hitbox Expander keybind (H)
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= hitboxKey then return end
    local s = not HitboxExp.Enabled
    hitboxToggle:Set(s)
end)

-- Waypoint Queue keybind (X) — start if idle, stop if running
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= wpQueueKey then return end
    if Waypoint:IsQueueRunning() then
        Waypoint:StopQueue()
        N("Queue", "Queue stopped")
    else
        if #Waypoint:GetQueue() == 0 then
            N("Queue", "Queue is empty!"); return
        end
        if Waypoint:StartQueue(Fly, N) then
            N("Queue", "Queue started")
        end
    end
end)

-- Position Backtracker keybind (B)
local backtrackerKey = Enum.KeyCode.B
UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= backtrackerKey then return end
    if not Backtracker.Enabled then
        N("Backtracker", "Backtracker is disabled (Enable in Macro tab)")
        return
    end
    local ok, sec = Backtracker:Backtrack()
    if ok then
        N("Backtracker", "Rewound " .. tostring(sec) .. "s back!")
    else
        N("Backtracker", tostring(sec or "No history"))
    end
end)

-- ════════════════════════════════════════════════════════════════════════════
-- PANIC KEY (Delete) — Disable ALL active modules + hide window
-- ════════════════════════════════════════════════════════════════════════════
local panicKey = Enum.KeyCode.Delete

UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= panicKey then return end

    -- Disable all movement modules
    pcall(function() if Fly.Enabled then flyToggle:Set(false); Fly:Disable() end end)
    pcall(function() if Speed.Enabled then speedToggle:Set(false); Speed:Disable() end end)
    pcall(function() if FreeCam.Enabled then fcToggle:Set(false); FreeCam:Disable() end end)
    pcall(function() if InfJump.Enabled then infJumpToggle:Set(false); InfJump:Disable() end end)
    pcall(function() if Noclip.Enabled then noclipToggle:Set(false); Noclip:Disable() end end)
    pcall(function() if AntiRagdoll.Enabled then antiRagdollToggle:Set(false); AntiRagdoll:Disable() end end)
    pcall(function() if Invisible.Enabled then invisToggle:Set(false); Invisible:Disable() end end)
    pcall(function() if ClickTP.Enabled then clickTPToggle:Set(false); ClickTP:Disable() end end)
    pcall(function() if WalkOnWater.Enabled then wowToggle:Set(false); WalkOnWater:Disable() end end)
    pcall(function() if Orbit and Orbit.Enabled then orbitToggle:Set(false); Orbit:Disable() end end)

    -- Disable visual modules
    pcall(function() if ESP.Enabled then espToggle:Set(false); ESP:Disable() end end)
    pcall(function() if FullBright.Enabled then fullBrightToggle:Set(false); FullBright:Disable() end end)
    pcall(function() if Tracer.Enabled then tracerToggle:Set(false); Tracer:Disable() end end)
    pcall(function() if RemoveFog.Enabled then removeFogToggle:Set(false); RemoveFog:Disable() end end)
    pcall(function() if FOVMod and FOVMod.Enabled then fovToggle:Set(false); FOVMod:Disable() end end)
    pcall(function() if Radar and Radar.Enabled then radarToggle:Set(false); Radar:Disable() end end)

    -- Disable combat modules
    pcall(function() if KillAura.Enabled then killAuraToggle:Set(false); KillAura:Disable() end end)
    pcall(function() if HitboxExp.Enabled then hitboxToggle:Set(false); HitboxExp:Disable() end end)
    pcall(function() if InstantKill.Enabled then ikToggle:Set(false); InstantKill:Disable() end end)
    pcall(function() if QuickSwitch.Enabled then quickSwitchToggle:Set(false); QuickSwitch:Disable() end end)

    -- Disable player modules
    pcall(function() if InfStamina.Enabled then infStaminaToggle:Set(false); InfStamina:Disable() end end)
    pcall(function() if GodMode.Enabled then godModeToggle:Set(false); GodMode:Disable() end end)
    pcall(function() if NoFallDmg.Enabled then noFallToggle:Set(false); NoFallDmg:Disable() end end)
    pcall(function() if AntiFling.Enabled then antiFlingToggle:Set(false); AntiFling:Disable() end end)
    pcall(function() if AntiVoid.Enabled then antiVoidToggle:Set(false); AntiVoid:Disable() end end)
    pcall(function() if GamepassSpoof.Enabled then gpSpoofToggle:Set(false); GamepassSpoof:Disable() end end)
    pcall(function() if AvatarSpoof.Enabled then avatarCustomizerToggle:Set(false); AvatarSpoof:Disable() end end)

    -- Disable auto modules
    pcall(function() if AutoClicker.Enabled then autoClickerToggle:Set(false); AutoClicker:Disable() end end)
    pcall(function() if Backtracker.Enabled then backtrackerToggle:Set(false); Backtracker:Disable() end end)
    pcall(function() if InstantPrompts and InstantPrompts.Enabled then instantPromptsToggle:Set(false); InstantPrompts:Disable() end end)

    -- Stop waypoint queue
    pcall(function() Waypoint:StopQueue() end)

    -- Reset WalkSpeed/JumpPower to normal
    pcall(function()
        local char = lp.Character
        if char then
            local hum = char:FindFirstChildOfClass("Humanoid")
            if hum then
                hum.WalkSpeed = 16
                hum.JumpPower = 50
                hum.JumpHeight = 7.2
            end
        end
    end)

    -- Hide the window
    pcall(function() Window:Close() end)

    N("PANIC", "All features disabled")
end)

SetTab:Section({ Expanded = false, Title = "Panic Key" })
SetTab:Keybind({
    Title    = "Panic Key (Disable All)",
    Value    = "Delete",
    Callback = function(k)
        panicKey = Enum.KeyCode[k] or Enum.KeyCode.Delete
        N("Panic Key", k)
    end
})
SetTab:Paragraph({
    Title = "Panic Key Info",
    Content = "Press to disable ALL features and hide the UI"
})

pcall(function()
    print("[LeonX] Universal mode UI tabs built successfully.")
    if Window and Window.SelectTab then
        Window:SelectTab(1)
    end
end)

end, function(err)
    return tostring(err) .. "\n" .. debug.traceback()
end)

if not uniOk then
    warn("[LeonX CRITICAL] Universal Mode Setup Failed: " .. tostring(uniErr))
    showDebugError("Universal Mode Setup", uniErr)
else
    print("[LeonX] All tabs initialized with 0 errors. Transitioning UI...")
end

setSplashProgress(1.0)

-- PerfStats already enabled above (universal)

-- AutoLoad with delay so UI elements are fully ready
task.delay(1.5, function()
    ConfigMgr:AutoLoad()

    -- Start auto-save loop after config is loaded and initial snapshot is seeded
    pcall(function()
        if autoSaveToggle and autoSaveToggle.Value == true then
            ConfigMgr:StartAutoSave()
        end
    end)

    -- Anti-AFK is already auto-enabled above (universal)

    -- ── Post-load sync: verify slider/dropdown states and ensure enabled modules are active ────────
    -- ConfigManager:Load() already fires registered callbacks. This block verifies non-flagged
    -- settings and ensures modules are enabled without redundant double-activations.
    pcall(function()
        -- 1. Sync slider/dropdown values to modules
        pcall(function()
            -- Speed sliders
            local ws = walkSpeedSlider.Value or 16
            if ws < 16 then ws = 16 end
            Speed:SetWalkSpeed(ws)
            local jp = jumpPowerSlider.Value or 50
            Speed:SetJumpPower(jp)

            -- Fly speed
            local fs = flySpeedSlider.Value or 60
            if fs < 10 then fs = 60; flySpeedSlider:Set(60) end
            Fly:SetSpeed(fs)

            -- FreeCam speed
            local fcs = fcSpeedSlider.Value or 40
            FreeCam:SetSpeed(fcs)

            -- AntiFling threshold
            AntiFling:SetThreshold(flingThreshSlider.Value or 200)

            -- Hitbox
            HitboxExp:SetSize(hitboxSizeSlider.Value or 10)
            HitboxExp:SetTransparency(hitboxAlphaSlider.Value or 80)
            pcall(function() HitboxExp:SetColor(HC[hitboxColorDrop.Value] or Color3.fromRGB(255,60,60)) end)

            -- ESP settings (applied even if ESP off — will take effect on enable)
            pcall(function() ESP:SetColor(EC[espColorDrop.Value] or Color3.new(1,1,1)) end)
            pcall(function() ESP:SetOpacity(espOpacitySlider.Value or 15) end)
            pcall(function() ESP:SetShowMode(espModeDrop.Value or "Both") end)
            pcall(function()
                if espTeamColorToggle then ESP:SetTeamColor(espTeamColorToggle.Value or false) end
                if espSkeletonToggle then ESP:SetShowSkeleton(espSkeletonToggle.Value or false) end
            end)

            -- Tracer settings
            pcall(function() Tracer:SetColor(TC[tracerColorDrop.Value] or Color3.new(1,1,1)) end)
            pcall(function() Tracer:SetOpacity(tracerOpacitySlider.Value or 100) end)
            pcall(function() Tracer:SetThickness(tracerThickSlider.Value or 2) end)

            -- InstantKill settings
            pcall(function() InstantKill:SetMode(ikModeDrop.Value or "All") end)
            pcall(function() InstantKill:SetTarget(ikTargetIn.Value or "") end)

            -- TeamCheck
            pcall(function() HitboxExp:SetTeamCheck(teamCheckToggle.Value) end)

            -- AntiVoid threshold
            pcall(function() AntiVoid:SetVoidThreshold(voidThreshSlider.Value or -50) end)

            -- AntiFling mass manipulation
            pcall(function() AntiFling:SetMassManipulation(massManipToggle.Value) end)

            -- FOV Modifier
            pcall(function()
                if fovSlider then FOVMod:SetFOV(fovSlider.Value or 70) end
            end)

            -- Orbit settings
            pcall(function()
                if orbitTargetDrop then Orbit:SetTarget(orbitTargetDrop.Value) end
                if orbitRadiusSlider then Orbit:SetRadius(orbitRadiusSlider.Value or 15) end
                if orbitSpeedSlider then Orbit:SetSpeed(orbitSpeedSlider.Value or 2) end
                if orbitHeightSlider then Orbit:SetHeight(orbitHeightSlider.Value or 5) end
            end)

            -- Radar settings
            pcall(function()
                if radarRangeSlider then Radar:SetRange(radarRangeSlider.Value or 200) end
                if radarSizeSlider then Radar:SetSize(radarSizeSlider.Value or 150) end
                if radarOpacitySlider then Radar:SetOpacity(radarOpacitySlider.Value or 80) end
            end)

            -- Auto-Save settings
            pcall(function()
                if autoSaveToggle then ConfigMgr:SetAutoSave(autoSaveToggle.Value) end
                if autoSaveIntervalSlider then ConfigMgr:SetAutoSaveInterval(autoSaveIntervalSlider.Value or 2) end
            end)
        end)

        -- 2. Speed Hack
        if speedToggle.Value == true and not Speed.Enabled then
            Speed:Enable()
        end

        -- 3. Fly
        if flyToggle.Value == true and not Fly.Enabled then
            Fly:Enable()
        end

        -- 4. FreeCam
        if fcToggle.Value == true and not FreeCam.Enabled then
            FreeCam:Enable()
        end

        -- 5. Movement features
        if infJumpToggle.Value == true and not InfJump.Enabled then InfJump:Enable() end
        if noclipToggle.Value == true and not Noclip.Enabled then Noclip:Enable() end
        if antiRagdollToggle.Value == true and not AntiRagdoll.Enabled then AntiRagdoll:Enable() end
        if invisToggle.Value == true and not Invisible.Enabled then Invisible:Enable() end
        if clickTPToggle.Value == true and not ClickTP.Enabled then ClickTP:Enable() end
        if wowToggle.Value == true and not WalkOnWater.Enabled then WalkOnWater:Enable() end
        if orbitToggle and orbitToggle.Value == true and not Orbit.Enabled then Orbit:Enable() end

        -- 6. Visual features
        if perfStatsToggle.Value == true then
            if not PerfStats.Enabled then PerfStats:Enable() end
        else
            if PerfStats.Enabled then PerfStats:Disable() end
        end

        if espToggle.Value == true and not ESP.Enabled then ESP:Enable() end
        if fullBrightToggle.Value == true and not FullBright.Enabled then FullBright:Enable() end
        if removeFogToggle.Value == true and not RemoveFog.Enabled then RemoveFog:Enable() end
        if tracerToggle.Value == true and not Tracer.Enabled then Tracer:Enable() end
        if antiLagToggle and antiLagToggle.Value == true and not PerfBooster.Enabled then PerfBooster:Enable() end
        pcall(function() PerfBooster:SetFPSCap(fpsCapSlider.Value or 60) end)
        if fovToggle and fovToggle.Value == true and not FOVMod.Enabled then FOVMod:Enable() end
        if radarToggle and radarToggle.Value == true and not Radar.Enabled then Radar:Enable() end

        -- 7. Player features
        if AntiDetect and antiDetectToggle.Value == true and not AntiDetect.Enabled then AntiDetect:Enable() end
        if antiAFKToggle.Value == true and not AntiAFK.Enabled then AntiAFK:Enable() end
        if infStaminaToggle.Value == true and not InfStamina.Enabled then InfStamina:Enable() end
        if godModeToggle.Value == true and not GodMode.Enabled then GodMode:Enable() end
        if noFallToggle.Value == true and not NoFallDmg.Enabled then NoFallDmg:Enable() end
        if antiFlingToggle.Value == true and not AntiFling.Enabled then AntiFling:Enable() end
        if antiVoidToggle.Value == true and not AntiVoid.Enabled then AntiVoid:Enable() end
        if gpSpoofToggle and gpSpoofToggle.Value == true and not GamepassSpoof.Enabled then GamepassSpoof:Enable() end
        if avatarCustomizerToggle.Value == true and not AvatarSpoof.Enabled then AvatarSpoof:Enable() end
        pcall(function() WebhookLogger:SetUrl(webhookUrlInput.Value or "") end)
        if hitboxToggle.Value == true and not HitboxExp.Enabled then HitboxExp:Enable() end
        if ikToggle.Value == true and not InstantKill.Enabled then InstantKill:Enable() end
        if quickSwitchToggle.Value == true and not QuickSwitch.Enabled then QuickSwitch:Enable() end
        pcall(function() QuickSwitch:SetDelayAfterShot(qsShotDelaySlider.Value or 50) end)
        pcall(function() QuickSwitch:SetDelayBetweenSwitches(qsSwitchDelaySlider.Value or 50) end)
        pcall(function() QuickSwitch:SetSwitchType(qsModeDrop.Value or "Q-Q") end)
        pcall(function() QuickSwitch:SetFirstKey(qsFirstKeyInput.Value or "Q") end)
        pcall(function() QuickSwitch:SetSecondKey(qsSecondKeyInput.Value or "Q") end)

        -- 7b. Auto features
        if autoClickerToggle.Value == true then AutoClicker:Enable() end
        pcall(function() AutoClicker:SetCPS(cpsSlider.Value or 10) end)
        pcall(function() AutoClicker:SetClickType(clickTypeDrop.Value or "mouse") end)
        pcall(function() AutoClicker:SetHoldDown(holdDownToggle.Value) end)
        pcall(function() AutoClicker:SetRandomDelay(randomDelayToggle.Value) end)
        if instantPromptsToggle and instantPromptsToggle.Value == true and not InstantPrompts.Enabled then InstantPrompts:Enable() end

        -- 7c. Backtracker
        pcall(function()
            Backtracker:SetRewindSeconds(backtrackerSecondsSlider.Value or 5)
            Backtracker:SetAutoFling(backtrackerAutoFlingToggle.Value or false)
        end)
        if backtrackerToggle.Value == true and not Backtracker.Enabled then Backtracker:Enable() end

        -- 8. Theme (always sync)
        pcall(function()
            local tv = themeDrop.Value
            if tv and tv ~= "" then
                Window:SetTheme(tv)
            end
        end)

        -- 9. WalkSpeed safety: ensure character can walk normally
        pcall(function()
            local char = game:GetService("Players").LocalPlayer.Character
            if char then
                local hum = char:FindFirstChildOfClass("Humanoid")
                if hum then
                    if not Speed.Enabled then
                        if hum.WalkSpeed < 16 then
                            hum.WalkSpeed = 16
                        end
                        if hum.UseJumpPower then
                            if hum.JumpPower < 50 then hum.JumpPower = 50 end
                        else
                            if hum.JumpHeight < 7.2 then hum.JumpHeight = 7.2 end
                        end
                    end
                end
            end
        end)
    end)
end)

-- ── Character respawn handler ─────────────────────────────────────────────────
lp.CharacterAdded:Connect(function(char)
    task.wait(1)
    pcall(function()
        if Fly.Enabled then Fly:Disable(); Fly:Enable() end
        if FreeCam.Enabled then FreeCam:Disable(); FreeCam:Enable() end
    end)
end)

task.spawn(function()
    local tries = 0
    while not lp.Character and tries < 30 do
        task.wait(1)
        tries = tries + 1
    end
    if not lp.Character then return end
    task.wait(2)
    pcall(function()
        if fcToggle.Value == true and not FreeCam.Enabled then
            FreeCam:Enable()
        end
    end)
end)

end -- END: Universal mode (else branch of ActiveGameModule check)

-- Debug: component count per tab
pcall(function()
	for i, t in ipairs(Window._tabs) do
		-- Tab debug removed
	end
	local tabCounts = {}
	local nilCount = 0
	for idx, entry in ipairs(Window._allComps) do
		local tName = "nil#" .. tostring(idx)
		if entry._tab and entry._tab.Name then
			tName = entry._tab.Name
			tabCounts[tName] = (tabCounts[tName] or 0) + 1
		else
			nilCount = nilCount + 1
		end
	end
end)
-- End debug info

-- Smooth splash exit
local splashDestroyed = false
task.spawn(function()
    pcall(function()
        tw(SplashBarFill, 0.15, {Size = UDim2.new(1, 0, 1, 0)})
    end)
    task.wait(0.2)
    pcall(function()
        tw(SplashCard, 0.18, {BackgroundTransparency = 1})
        for _, child in ipairs(SplashCard:GetDescendants()) do
            pcall(function()
                if child:IsA("TextLabel") then
                    TweenService:Create(child, TweenInfo.new(0.15), {TextTransparency = 1}):Play()
                elseif child:IsA("Frame") then
                    TweenService:Create(child, TweenInfo.new(0.15), {BackgroundTransparency = 1}):Play()
                elseif child:IsA("UIStroke") then
                    TweenService:Create(child, TweenInfo.new(0.15), {Transparency = 1}):Play()
                end
            end)
        end
        tw(SplashBg, 0.2, {BackgroundTransparency = 1})
    end)
    task.wait(0.2)
    pcall(function()
        if SplashGui and SplashGui.Parent then SplashGui:Destroy() end
    end)
    splashDestroyed = true
end)

-- Guaranteed fallback: force-destroy splash after 1.5s
task.delay(1.5, function()
    if not splashDestroyed then
        pcall(function() if SplashGui and SplashGui.Parent then SplashGui:Destroy() end end)
        splashDestroyed = true
    end
end)

task.delay(2, function()
    N("Leon X", "Welcome!")
end)

-- Auto-dismiss welcome screen after 3 seconds
task.delay(3, function()
    if Window and Window.DismissWelcome then
        Window:DismissWelcome()
    end
end)

-- Initialize Mobile Quick-Toggle Overlay for Touch Devices
pcall(function()
    if MobileOverlay and MobileOverlay.Init then
        MobileOverlay:Init(Window)
    end
end)



