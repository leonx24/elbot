-- Leon X | main.lua
-- Noir UI version with splash screen + floating open button
-- Leon X Main Script

-- ═══════════════════════════════════════════════════════════════════════════
-- EARLY SETUP (line 1 — before ANY HTTP or game interaction)
-- NO hooks here — all hookfunction calls detected by Adonis integrity scan
-- AntiDetect module handles script destruction only (no function hooking)
-- ═══════════════════════════════════════════════════════════════════════════

_G._LeonX_AllowTeleport = function(allow)
    _G._LeonX_AllowTeleportActive = allow and true or false
end

-- Destroy old GUI instances to prevent duplicates and stuck screens when re-executing
pcall(function()
    if _G.LeonX_Cleanup then
        _G.LeonX_Cleanup()
    end
end)

pcall(function()
    local players = game:GetService("Players")
    local lp = players and players.LocalPlayer
    local playerGui = lp and lp:FindFirstChild("PlayerGui")
    
    local function cleanupGui(guiParent)
        if not guiParent then return end
        for _, name in ipairs({"LeonXSplash", "LeonXNoir", "LeonXNotif"}) do
            local old = guiParent:FindFirstChild(name)
            if old then
                pcall(function() old:Destroy() end)
            end
        end
    end
    
    cleanupGui(playerGui)
    
    local coreGui = game:GetService("CoreGui")
    if coreGui then
        cleanupGui(coreGui)
    end
end)

local BASE = "https://raw.githubusercontent.com/leonx24/Leon-x/main/"

local raw_loadstring = loadstring or (getgenv and getgenv().loadstring) or (getfenv and getfenv(0).loadstring)

local CURRENT_VERSION = "1.3"
pcall(function()
    CURRENT_VERSION = game:HttpGet(BASE.."version.txt?t="..tostring(os.time()), true):match("^%s*(.-)%s*$")
end)

local Players      = game:GetService("Players")
local UIS          = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local RunService   = game:GetService("RunService")
local lp           = Players.LocalPlayer
local gui          = lp:WaitForChild("PlayerGui")
local isMobile     = UIS.TouchEnabled and not UIS.KeyboardEnabled

-- ══════════════════════════════════════════════════════════════════════════════
-- SPLASH SCREEN (shown before UI loads)
-- ══════════════════════════════════════════════════════════════════════════════
local SplashGui = Instance.new("ScreenGui")
SplashGui.Name             = "LeonXSplash"
SplashGui.ResetOnSpawn     = false
SplashGui.ZIndexBehavior   = Enum.ZIndexBehavior.Sibling
SplashGui.DisplayOrder     = 9999
SplashGui.IgnoreGuiInset   = true
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
        TweenService:Create(SplashStroke, TweenInfo.new(1.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut),
            {Color = Color3.fromRGB(100, 140, 255)}):Play()
        task.wait(1.5)
        TweenService:Create(SplashStroke, TweenInfo.new(1.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut),
            {Color = Color3.fromRGB(45, 45, 65)}):Play()
        task.wait(1.5)
    end
end)

local LOGO_URL = "https://raw.githubusercontent.com/leonx24/Leon-x/main/assets/logo.jpg"
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
            local data = game:HttpGet(LOGO_URL .. "?t=" .. tostring(os.time()), true)
            if data and #data > 100 then
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
tw(SplashCard, 0.45, {BackgroundTransparency = 0, Size = UDim2.new(0, 340, 0, 200)})
tw(SplashBg, 0.35, {BackgroundTransparency = 0.15})

for _, child in ipairs(SplashCard:GetDescendants()) do
    if child:IsA("TextLabel") then
        child.TextTransparency = 1
        TweenService:Create(child, TweenInfo.new(0.4), {TextTransparency = 0}):Play()
    elseif child:IsA("Frame") then
        child.BackgroundTransparency = 1
        TweenService:Create(child, TweenInfo.new(0.4), {BackgroundTransparency = 0}):Play()
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
        if now - lastStep >= 1.0 then
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
        tw(SplashBarFill, 0.25, {Size = UDim2.new(clamped, 0, 1, 0)})
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
    for attempt = 1, MAX_RETRIES do
        local ok, result = pcall(function()
            local src = game:HttpGet(BASE..p.."?t="..tostring(os.time()), true)
            if not src or #src < 10 then error("empty response ("..#tostring(src).." bytes)") end
            if src:find("Too Many Requests") or src:find("^%s*<!") or src:find("^%s*<html") then
                error("rate-limited (429 or HTML error page)")
            end
            local fn, err = raw_loadstring(src)
            if not fn then error("loadstring failed: "..tostring(err)) end
            return fn()
        end)
        if ok then
            return result
        end
        if attempt < MAX_RETRIES then
            local delay = attempt * 3
            warn("[LeonX] RETRY " .. attempt .. "/" .. MAX_RETRIES .. ": " .. tostring(p) .. " — " .. tostring(result) .. " (waiting " .. delay .. "s)")
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

local ConfigMgr   = load("modules/core/configmanager.lua"); setSplashProgress(0.10)
local Fly         = load("modules/movements/fly.lua");       setSplashProgress(0.14)
local Speed       = load("modules/movements/speed.lua");     setSplashProgress(0.18)
local InfJump     = load("modules/movements/infinitejump.lua"); setSplashProgress(0.22)
local Noclip      = load("modules/movements/noclip.lua");    setSplashProgress(0.26)
local AntiRagdoll = load("modules/movements/antiragdoll.lua"); setSplashProgress(0.30)
local Invisible   = load("modules/movements/invisible.lua"); setSplashProgress(0.34)
local FreeCam     = load("modules/movements/freecam.lua");   setSplashProgress(0.38)
local ClickTP     = load("modules/movements/clickteleport.lua"); setSplashProgress(0.42)
local WalkOnWater = load("modules/movements/walkonwater.lua");  setSplashProgress(0.44)
local ESP         = load("modules/visuals/esp.lua");         setSplashProgress(0.46)
local Tracer      = load("modules/visuals/tracer.lua");      setSplashProgress(0.50)
local FullBright  = load("modules/visuals/fullbright.lua");  setSplashProgress(0.54)
local PerfStats   = load("modules/visuals/perfstats.lua");   setSplashProgress(0.58)
local RemoveFog   = load("modules/visuals/removefog.lua");   setSplashProgress(0.62)
local AntiAFK     = load("modules/player/antiafk.lua");      setSplashProgress(0.66)
local InfStamina  = load("modules/player/infinitestamina.lua"); setSplashProgress(0.70)
local AntiFling   = load("modules/player/antifling.lua");    setSplashProgress(0.72)
local Rejoin      = load("modules/player/rejoin.lua");       setSplashProgress(0.74)
local ServerHop   = load("modules/player/serverhop.lua");    setSplashProgress(0.75)
local Teleport    = load("modules/player/teleport.lua");     setSplashProgress(0.76)
local HitboxExp   = load("modules/player/hitboxexpander.lua"); setSplashProgress(0.78)
local Waypoint    = load("modules/player/waypoint.lua");     setSplashProgress(0.82)
local GodMode     = load("modules/player/godmode.lua");      setSplashProgress(0.84)
local NoFallDmg   = load("modules/player/nofalldamage.lua"); setSplashProgress(0.86)
local InstantKill = load("modules/player/instantkill.lua");  setSplashProgress(0.88)
local KillAura    = load("modules/combat/killaura.lua");     setSplashProgress(0.90)
local AutoClicker = load("modules/auto/autoclicker.lua");    setSplashProgress(0.91)
local QuickSwitch = load("modules/combat/quickswitch.lua");  setSplashProgress(0.92)
local MacroRec    = load("modules/movements/macrorecorder.lua"); setSplashProgress(0.93)
local AntiVoid    = load("modules/player/antivoid.lua");     setSplashProgress(0.94)
local GamepassSpoof = load("modules/player/gamepassspoofer.lua"); setSplashProgress(0.95)
local AvatarSpoof = load("modules/player/avatarspoofer.lua");      setSplashProgress(0.96)
local MobileOverlay = load("modules/core/mobileoverlay.lua");     setSplashProgress(0.97)
local PerfBooster   = load("modules/visuals/perfbooster.lua");     setSplashProgress(0.98)
local WebhookLogger = load("modules/core/webhooklogger.lua");     setSplashProgress(0.99)
local ServerUtils   = load("modules/core/serverutils.lua");       setSplashProgress(1.00)


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
AntiVoid       = safe(AntiVoid)
GamepassSpoof  = safe(GamepassSpoof)
AvatarSpoof    = safe(AvatarSpoof)
MobileOverlay  = safe(MobileOverlay)
PerfBooster    = safe(PerfBooster)
WebhookLogger  = safe(WebhookLogger)
ServerUtils    = safe(ServerUtils)


-- ── Game-specific modules ────────────────────────────────────────────────────
local GAME_MODULES = {}
local gagModule = load("modules/games/growagarden2.lua")
if gagModule and gagModule.PlaceIds then
    GAME_MODULES[#GAME_MODULES + 1] = gagModule
end
local famModule = load("modules/games/fishandmonsters.lua")
if famModule and famModule.PlaceIds then
    GAME_MODULES[#GAME_MODULES + 1] = famModule
end
-- add more game modules here

local ActiveGameModule = nil
for _, gm in ipairs(GAME_MODULES) do
    -- Check PlaceIds first
    if gm and gm.PlaceIds then
        for _, pid in ipairs(gm.PlaceIds) do
            if tostring(pid) == tostring(game.PlaceId) then
                ActiveGameModule = gm
                break
            end
        end
    end
    -- Check GameIds (Universe ID) if PlaceId didn't match
    if not ActiveGameModule and gm and gm.GameIds then
        for _, gid in ipairs(gm.GameIds) do
            if tostring(gid) == tostring(game.GameId) then
                ActiveGameModule = gm
                break
            end
        end
    end
    if ActiveGameModule then break end
end

if not ActiveGameModule then
    -- Universal mode
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
end

-- ── Determine window title based on game mode ─────────────────────────────────
local windowTitle = "Leon X v"..CURRENT_VERSION
local windowAuthor = "by leon"
if ActiveGameModule then
    windowTitle = "Leon X v"..CURRENT_VERSION.." | "..ActiveGameModule.Name
    windowAuthor = "Game Mode: "..ActiveGameModule.Name
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
    if AntiAFK then AntiAFK:Enable() end
    pcall(function() ActiveGameModule:Init() end)
    pcall(function() ActiveGameModule:Enable() end)
    local wireSuccess, wireErr = pcall(function()
        ActiveGameModule:WireUI(Window, {
            Fly          = Fly,
            Speed        = Speed,
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

FavTab:Section({ Title = "Quick Access Features" })
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
MovTab:Section({ Title = "Flight" })
-- Creating UI components

-- Fly toggle
flyToggle = MovTab:Toggle({
    Title    = "Fly",
    Flag     = "Fly",
    Value    = false,
    Tooltip  = "Free flight with adjustable speed",
    Callback = function(v)
        if v and Fly then Fly:Enable() elseif Fly then Fly:Disable() end
        N("Fly", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Fly", flyToggle)
flySpeedSlider = MovTab:Slider({
    Title    = "Fly Speed",
    Value    = { Min = 10, Max = 300, Default = 60 },
    Step     = 1,
    Tooltip  = "Adjust flight speed (10-300)",
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
    if s then Fly:Enable() else Fly:Disable() end
end)

MovTab:Section({ Title = "Speed" })

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

MovTab:Section({ Title = "Physics" })

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

MovTab:Section({ Title = "Camera" })

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

MovTab:Section({ Title = "Special" })

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

-- ══════════════════════════════════════════════════════════════════════════════
-- MACRO RECORDER TAB
-- ══════════════════════════════════════════════════════════════════════════════

-- Macro name input
MacroTab:Section({ Title = "Interface" })
macroNameInput = MacroTab:Input({
    Title = "Macro Name",
    Placeholder = "e.g. route_to_peak",
    Value = "",
    Tooltip = "Name your macro before recording",
    Callback = function() end
})

MacroTab:Section({ Title = "Status" })
macroStatusText = MacroTab:Paragraph({
    Title = "Status",
    Content = "Idle"
})

MacroTab:Section({ Title = "Recording" })

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

MacroTab:Section({ Title = "Playback" })

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

MacroTab:Section({ Title = "Save / Load" })

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

MacroTab:Section({ Title = "Import / Export" })

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
MacroTab:Section({ Title = "Macro Queue (Sequential)" })

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

MacroTab:Section({ Title = "Queue Playback" })

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
MacroTab:Section({ Title = "Map Info" })
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
VisTab:Section({ Title = "Rendering" })

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

VisTab:Section({ Title = "ESP Settings" })

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

VisTab:Section({ Title = "Tracer" })

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

VisTab:Section({ Title = "Performance & Anti-Lag" })
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

-- ══════════════════════════════════════════════════════════════════════════════
-- COMBAT TAB
-- ══════════════════════════════════════════════════════════════════════════════
CombatTab:Section({ Title = "Kill Aura" })

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

CombatTab:Section({ Title = "Hitbox Expander" })

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

CombatTab:Section({ Title = "Quick Switch" })

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

CombatTab:Section({ Title = "Instant Kill" })

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
PlayerTab:Section({ Title = "Utility" })

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

PlayerTab:Section({ Title = "Protection" })

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

PlayerTab:Section({ Title = "Exploit" })

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

PlayerTab:Section({ Title = "Avatar Customizer" })

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


PlayerTab:Section({ Title = "Info" })
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

PlayerTab:Section({ Title = "Server Utilities" })
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
TeleTab:Section({ Title = "Position" })

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

TeleTab:Section({ Title = "To Player" })

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

TeleTab:Section({ Title = "Waypoints" })


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

TeleTab:Section({ Title = "Waypoint Queue (Sequential)" })

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

TeleTab:Section({ Title = "Server" })

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
AutoTab:Section({ Title = "Auto Clicker" })

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
        if v and Fly then Fly:Enable() elseif Fly then Fly:Disable() end
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
        if v and Speed then Speed:Enable() elseif Speed then Speed:Disable() end
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
FavTab:Section({ Title = "Your Starred Features" })

Library._onFavoriteChanged = function(flagKey, isStarred, info)
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
        for k, _ in pairs(Library._favorites) do
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
                Library._favorites[flagKey] = true
            end
        end
    end
end)



-- ══════════════════════════════════════════════════════════════════════════════
-- SETTINGS TAB
-- ══════════════════════════════════════════════════════════════════════════════
SetTab:Section({ Title = "Interface" })

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

SetTab:Section({ Title = "Discord Webhook Logger" })
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

SetTab:Section({ Title = "Config" })

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

SetTab:Section({ Title = "Config Share Code (Base64)" })

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

SetTab:Section({ Title = "About" })
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
    if i.KeyCode ~= hitboxKey then return end
    if UIS:GetFocusedTextBox() then return end
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

    -- Disable visual modules
    pcall(function() if ESP.Enabled then espToggle:Set(false); ESP:Disable() end end)
    pcall(function() if FullBright.Enabled then fullBrightToggle:Set(false); FullBright:Disable() end end)
    pcall(function() if Tracer.Enabled then tracerToggle:Set(false); Tracer:Disable() end end)
    pcall(function() if RemoveFog.Enabled then removeFogToggle:Set(false); RemoveFog:Disable() end end)

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

SetTab:Section({ Title = "Panic Key" })
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

    -- Anti-AFK is already auto-enabled above (universal)

    -- ── Post-load sync: activate modules based on loaded toggle states ────────
    -- ConfigManager:Load() does NOT fire callbacks, so we manually sync here
    -- in a deterministic order to avoid race conditions.
    pcall(function()
        -- 1. Sync slider/dropdown values to modules (callbacks don't fire during load)
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
        end)

        -- 2. Speed Hack
        if speedToggle.Value == true then
            Speed:Enable()
        end

        -- 3. Fly
        if flyToggle.Value == true then
            Fly:Enable()
        end

        -- 4. FreeCam
        if fcToggle.Value == true then
            FreeCam:Enable()
        end

        -- 5. Movement features
        if infJumpToggle.Value == true then InfJump:Enable() end
        if noclipToggle.Value == true then Noclip:Enable() end
        if antiRagdollToggle.Value == true then AntiRagdoll:Enable() end
        if invisToggle.Value == true then Invisible:Enable() end
        if clickTPToggle.Value == true then ClickTP:Enable() end
        if wowToggle.Value == true then WalkOnWater:Enable() end

        -- 6. Visual features
        if perfStatsToggle.Value == true then
            PerfStats:Enable()
        else
            PerfStats:Disable()
        end

        if espToggle.Value == true then ESP:Enable() end
        if fullBrightToggle.Value == true then FullBright:Enable() end
        if removeFogToggle.Value == true then RemoveFog:Enable() end
        if tracerToggle.Value == true then Tracer:Enable() end
        if antiLagToggle and antiLagToggle.Value == true then PerfBooster:Enable() end
        pcall(function() PerfBooster:SetFPSCap(fpsCapSlider.Value or 60) end)

        -- 7. Player features
        if AntiDetect and antiDetectToggle.Value == true then AntiDetect:Enable() end
        if antiAFKToggle.Value == true then AntiAFK:Enable() end
        if infStaminaToggle.Value == true then InfStamina:Enable() end
        if godModeToggle.Value == true then GodMode:Enable() end
        if noFallToggle.Value == true then NoFallDmg:Enable() end
        if antiFlingToggle.Value == true then AntiFling:Enable() end
        if antiVoidToggle.Value == true then AntiVoid:Enable() end
        if gpSpoofToggle and gpSpoofToggle.Value == true then GamepassSpoof:Enable() end
        if avatarCustomizerToggle.Value == true then AvatarSpoof:Enable() end
        pcall(function() WebhookLogger:SetUrl(webhookUrlInput.Value or "") end)
        if hitboxToggle.Value == true then HitboxExp:Enable() end
        if ikToggle.Value == true then InstantKill:Enable() end
        if quickSwitchToggle.Value == true then QuickSwitch:Enable() end
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

        -- 8. Theme (always sync)
        pcall(function()
            local tv = themeDrop.Value
            if tv and tv ~= "" then
                Window:SetTheme(tv)
            end
        end)

        -- 9. WalkSpeed safety: ensure character can walk
        pcall(function()
            local char = game:GetService("Players").LocalPlayer.Character
            if char then
                local hum = char:FindFirstChildOfClass("Humanoid")
                if hum then
                    if not Speed.Enabled and hum.WalkSpeed < 16 then
                        hum.WalkSpeed = 16
                    end
                    if not Speed.Enabled and hum.JumpPower < 50 then
                        hum.JumpPower = 50
                        hum.JumpHeight = 7.2
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
    task.wait(0.3)
    pcall(function()
        tw(SplashBarFill, 0.2, {Size = UDim2.new(1, 0, 1, 0)})
    end)
    task.wait(0.35)
    pcall(function()
        tw(SplashCard, 0.5, {BackgroundTransparency = 1})
        for _, child in ipairs(SplashCard:GetDescendants()) do
            pcall(function()
                if child:IsA("TextLabel") then
                    TweenService:Create(child, TweenInfo.new(0.4), {TextTransparency = 1}):Play()
                elseif child:IsA("Frame") then
                    TweenService:Create(child, TweenInfo.new(0.4), {BackgroundTransparency = 1}):Play()
                elseif child:IsA("UIStroke") then
                    TweenService:Create(child, TweenInfo.new(0.4), {Transparency = 1}):Play()
                end
            end)
        end
        tw(SplashBg, 0.5, {BackgroundTransparency = 1})
    end)
    task.wait(0.55)
    pcall(function()
        if SplashGui and SplashGui.Parent then SplashGui:Destroy() end
    end)
    splashDestroyed = true
end)

-- Guaranteed fallback: force-destroy splash after 5s no matter what
task.delay(5, function()
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



