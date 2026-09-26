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



local CURRENT_VERSION = "0.5.2"
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
SplashBg.BackgroundColor3    = Color3.fromRGB(8, 10, 14)
SplashBg.BackgroundTransparency = 0.15
SplashBg.BorderSizePixel     = 0
SplashBg.ZIndex              = 200
SplashBg.Parent              = SplashGui

-- Main Card Container (380x212 - Obsidian Glass Card with Telemetry Pipeline)
local SplashCard = Instance.new("Frame")
SplashCard.Size                = UDim2.new(0, 380, 0, 212)
SplashCard.AnchorPoint         = Vector2.new(0.5, 0.5)
SplashCard.Position            = UDim2.fromScale(0.5, 0.5)
SplashCard.BackgroundColor3    = Color3.fromRGB(13, 15, 22)
SplashCard.BorderSizePixel     = 0
SplashCard.ZIndex              = 201
SplashCard.ClipsDescendants    = true
SplashCard.Parent              = SplashGui

local SplashCorner = Instance.new("UICorner")
SplashCorner.CornerRadius = UDim.new(0, 16)
SplashCorner.Parent       = SplashCard

local SplashStroke = Instance.new("UIStroke")
SplashStroke.Color        = Color3.fromRGB(38, 44, 60)
SplashStroke.Thickness    = 1.2
SplashStroke.Transparency = 0.5
SplashStroke.Parent       = SplashCard

-- Ambient Glass Gradient
local SplashGrad = Instance.new("UIGradient")
SplashGrad.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(24, 28, 40)),
    ColorSequenceKeypoint.new(0.3, Color3.fromRGB(15, 17, 24)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(10, 12, 17)),
})
SplashGrad.Rotation = 90
SplashGrad.Parent = SplashCard

-- Pulsing Ambient Tangerine Glow
task.spawn(function()
    while SplashCard and SplashCard.Parent do
        TweenService:Create(SplashStroke, TweenInfo.new(2.2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut),
            {Color = Color3.fromRGB(255, 107, 53), Transparency = 0.3}):Play()
        task.wait(2.2)
        TweenService:Create(SplashStroke, TweenInfo.new(2.2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut),
            {Color = Color3.fromRGB(38, 44, 60), Transparency = 0.65}):Play()
        task.wait(2.2)
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

-- Top Header: Logo Tile Box (38x38)
local LogoTile = Instance.new("Frame")
LogoTile.Size             = UDim2.fromOffset(38, 38)
LogoTile.Position         = UDim2.fromOffset(22, 18)
LogoTile.BackgroundColor3 = Color3.fromRGB(20, 24, 34)
LogoTile.BorderSizePixel  = 0
LogoTile.ClipsDescendants = true
LogoTile.ZIndex           = 202
LogoTile.Parent           = SplashCard

local TileCorner = Instance.new("UICorner")
TileCorner.CornerRadius = UDim.new(0, 10)
TileCorner.Parent       = LogoTile

local TileStroke = Instance.new("UIStroke")
TileStroke.Color        = Color3.fromRGB(48, 56, 74)
TileStroke.Thickness    = 1
TileStroke.Transparency = 0.4
TileStroke.Parent       = LogoTile

-- Logo Icon Image
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
    if asset then LogoImg.Image = asset end
end)

-- Title
local SplashTitle = Instance.new("TextLabel")
SplashTitle.Size                = UDim2.new(1, -170, 0, 20)
SplashTitle.Position            = UDim2.fromOffset(68, 18)
SplashTitle.BackgroundTransparency = 1
SplashTitle.Text                = "LEON X"
SplashTitle.TextColor3          = Color3.fromRGB(248, 250, 255)
SplashTitle.TextSize            = 17
SplashTitle.Font                = Enum.Font.GothamBold
SplashTitle.TextXAlignment      = Enum.TextXAlignment.Left
SplashTitle.ZIndex              = 202
SplashTitle.Parent              = SplashCard

-- Subtitle Tagline
local SplashSub = Instance.new("TextLabel")
SplashSub.Size                = UDim2.new(1, -170, 0, 14)
SplashSub.Position            = UDim2.fromOffset(68, 39)
SplashSub.BackgroundTransparency = 1
SplashSub.Text                = "NEXT-GEN GAME SUITE"
SplashSub.TextColor3          = Color3.fromRGB(130, 140, 165)
SplashSub.TextSize            = 9
SplashSub.Font                = Enum.Font.GothamMedium
SplashSub.TextXAlignment      = Enum.TextXAlignment.Left
SplashSub.ZIndex              = 202
SplashSub.Parent              = SplashCard

-- Version / Status Pill
local SplashVerPill = Instance.new("Frame")
SplashVerPill.Size             = UDim2.fromOffset(72, 22)
SplashVerPill.Position         = UDim2.new(1, -94, 0, 18)
SplashVerPill.BackgroundColor3 = Color3.fromRGB(22, 26, 36)
SplashVerPill.BorderSizePixel  = 0
SplashVerPill.ZIndex           = 202
SplashVerPill.Parent           = SplashCard

local PillCorner = Instance.new("UICorner")
PillCorner.CornerRadius = UDim.new(0, 7)
PillCorner.Parent       = SplashVerPill

local PillStroke = Instance.new("UIStroke")
PillStroke.Color        = Color3.fromRGB(42, 48, 64)
PillStroke.Thickness    = 1
PillStroke.Parent       = SplashVerPill

-- Live Green Dot in Version Pill
local PillDot = Instance.new("Frame")
PillDot.Size                   = UDim2.fromOffset(5, 5)
PillDot.Position               = UDim2.new(0, 8, 0.5, -2)
PillDot.BackgroundColor3       = Color3.fromRGB(52, 211, 153)
PillDot.BorderSizePixel        = 0
PillDot.ZIndex                 = 203
PillDot.Parent                 = SplashVerPill

local PillDotCorner = Instance.new("UICorner")
PillDotCorner.CornerRadius = UDim.new(1, 0)
PillDotCorner.Parent       = PillDot

local SplashVer = Instance.new("TextLabel")
SplashVer.Size                = UDim2.new(1, -18, 1, 0)
SplashVer.Position            = UDim2.fromOffset(16, 0)
SplashVer.BackgroundTransparency = 1
SplashVer.Text                = "v" .. CURRENT_VERSION
SplashVer.TextColor3          = Color3.fromRGB(255, 107, 53)
SplashVer.TextSize            = 10
SplashVer.Font                = Enum.Font.GothamBold
SplashVer.TextXAlignment      = Enum.TextXAlignment.Center
SplashVer.ZIndex              = 203
SplashVer.Parent              = SplashVerPill

-- ── 4 Pipeline Progress Stage Badges (Telemetry Nodes) ──
local nodesContainer = Instance.new("Frame")
nodesContainer.Name                   = "PipelineNodes"
nodesContainer.Size                   = UDim2.new(1, -44, 0, 24)
nodesContainer.Position               = UDim2.fromOffset(22, 68)
nodesContainer.BackgroundColor3       = Color3.fromRGB(13, 15, 22)
nodesContainer.BackgroundTransparency = 1
nodesContainer.BorderSizePixel        = 0
nodesContainer.ZIndex                 = 202
nodesContainer.Parent                 = SplashCard

-- Interconnecting hairline track behind badges
local nodesTrack = Instance.new("Frame")
nodesTrack.Name                   = "NodesTrack"
nodesTrack.Size                   = UDim2.new(1, -70, 0, 2)
nodesTrack.Position               = UDim2.fromOffset(35, 79)
nodesTrack.BackgroundColor3       = Color3.fromRGB(30, 36, 48)
nodesTrack.BorderSizePixel        = 0
nodesTrack.ZIndex                 = 201
nodesTrack.Parent                 = SplashCard

local nodesList = Instance.new("UIListLayout")
nodesList.FillDirection       = Enum.FillDirection.Horizontal
nodesList.HorizontalAlignment = Enum.HorizontalAlignment.Center
nodesList.VerticalAlignment   = Enum.VerticalAlignment.Center
nodesList.Padding             = UDim.new(0, 8)
nodesList.SortOrder           = Enum.SortOrder.LayoutOrder
nodesList.Parent              = nodesContainer

local stageNodes = {}
local nodeNames = { "CORE", "AUTH", "ENGINE", "READY" }

local function createStageNode(idx, name)
    local node = Instance.new("Frame")
    node.Name                   = "Node_" .. name
    node.Size                   = UDim2.new(0, 76, 0, 22)
    node.BackgroundColor3       = Color3.fromRGB(18, 21, 30)
    node.BorderSizePixel        = 0
    node.LayoutOrder            = idx
    node.ZIndex                 = 203
    node.Parent                 = nodesContainer

    local nCorner = Instance.new("UICorner")
    nCorner.CornerRadius = UDim.new(0, 6)
    nCorner.Parent       = node

    local nStroke = Instance.new("UIStroke")
    nStroke.Color        = Color3.fromRGB(34, 40, 54)
    nStroke.Thickness    = 1
    nStroke.Parent       = node

    local nText = Instance.new("TextLabel")
    nText.Size                = UDim2.fromScale(1, 1)
    nText.BackgroundTransparency = 1
    nText.Text                = tostring(idx) .. " " .. name
    nText.TextColor3          = Color3.fromRGB(115, 125, 145)
    nText.TextSize            = 9
    nText.Font                = Enum.Font.GothamMedium
    nText.RichText            = true
    nText.ZIndex              = 204
    nText.Parent              = node

    stageNodes[idx] = { Frame = node, Stroke = nStroke, Text = nText, Name = name }
end

for i, name in ipairs(nodeNames) do
    createStageNode(i, name)
end

local function updateSplashNodes(pct)
    -- Stage 1: CORE (0 - 25%)
    -- Stage 2: AUTH (25% - 50%)
    -- Stage 3: ENGINE (50% - 85%)
    -- Stage 4: READY (85% - 100%)
    if pct >= 0.25 then
        stageNodes[1].Text.Text = '<font color="#34d399">✓ CORE</font>'
        stageNodes[1].Stroke.Color = Color3.fromRGB(52, 211, 153)
        stageNodes[1].Frame.BackgroundColor3 = Color3.fromRGB(16, 28, 26)
    else
        stageNodes[1].Text.Text = '<font color="#ff6b35">CORE...</font>'
        stageNodes[1].Stroke.Color = Color3.fromRGB(255, 107, 53)
        stageNodes[1].Frame.BackgroundColor3 = Color3.fromRGB(28, 22, 20)
    end

    if pct >= 0.50 then
        stageNodes[2].Text.Text = '<font color="#34d399">✓ AUTH</font>'
        stageNodes[2].Stroke.Color = Color3.fromRGB(52, 211, 153)
        stageNodes[2].Frame.BackgroundColor3 = Color3.fromRGB(16, 28, 26)
    elseif pct >= 0.25 then
        stageNodes[2].Text.Text = '<font color="#ff6b35">AUTH...</font>'
        stageNodes[2].Stroke.Color = Color3.fromRGB(255, 107, 53)
        stageNodes[2].Frame.BackgroundColor3 = Color3.fromRGB(28, 22, 20)
    end

    if pct >= 0.85 then
        stageNodes[3].Text.Text = '<font color="#34d399">✓ ENGINE</font>'
        stageNodes[3].Stroke.Color = Color3.fromRGB(52, 211, 153)
        stageNodes[3].Frame.BackgroundColor3 = Color3.fromRGB(16, 28, 26)
    elseif pct >= 0.50 then
        stageNodes[3].Text.Text = '<font color="#ff6b35">ENGINE...</font>'
        stageNodes[3].Stroke.Color = Color3.fromRGB(255, 107, 53)
        stageNodes[3].Frame.BackgroundColor3 = Color3.fromRGB(28, 22, 20)
    end

    if pct >= 0.98 then
        stageNodes[4].Text.Text = '<font color="#34d399">✓ READY</font>'
        stageNodes[4].Stroke.Color = Color3.fromRGB(52, 211, 153)
        stageNodes[4].Frame.BackgroundColor3 = Color3.fromRGB(16, 28, 26)
    elseif pct >= 0.85 then
        stageNodes[4].Text.Text = '<font color="#ff6b35">READY...</font>'
        stageNodes[4].Stroke.Color = Color3.fromRGB(255, 107, 53)
        stageNodes[4].Frame.BackgroundColor3 = Color3.fromRGB(28, 22, 20)
    end
end

-- Status Text Label
local SplashStatus = Instance.new("TextLabel")
SplashStatus.Size                = UDim2.new(1, -120, 0, 16)
SplashStatus.Position            = UDim2.fromOffset(22, 106)
SplashStatus.BackgroundTransparency = 1
SplashStatus.Text                = "Initializing system engine..."
SplashStatus.TextColor3          = Color3.fromRGB(175, 185, 205)
SplashStatus.TextSize            = 11
SplashStatus.Font                = Enum.Font.GothamMedium
SplashStatus.TextXAlignment      = Enum.TextXAlignment.Left
SplashStatus.ZIndex              = 202
SplashStatus.Parent              = SplashCard

-- Percentage Label (Right Aligned)
local SplashPct = Instance.new("TextLabel")
SplashPct.Size                = UDim2.new(0, 50, 0, 16)
SplashPct.Position            = UDim2.new(1, -72, 0, 106)
SplashPct.BackgroundTransparency = 1
SplashPct.Text                = "0%"
SplashPct.TextColor3          = Color3.fromRGB(255, 107, 53)
SplashPct.TextSize            = 11
SplashPct.Font                = Enum.Font.GothamBold
SplashPct.TextXAlignment      = Enum.TextXAlignment.Right
SplashPct.ZIndex              = 202
SplashPct.Parent              = SplashCard

-- Progress Bar Background Track
local SplashBarBg = Instance.new("Frame")
SplashBarBg.Size             = UDim2.new(1, -44, 0, 6)
SplashBarBg.Position         = UDim2.fromOffset(22, 130)
SplashBarBg.BackgroundColor3 = Color3.fromRGB(22, 26, 36)
SplashBarBg.BorderSizePixel  = 0
SplashBarBg.ClipsDescendants = false
SplashBarBg.ZIndex           = 202
SplashBarBg.Parent           = SplashCard

local BarBgCorner = Instance.new("UICorner")
BarBgCorner.CornerRadius = UDim.new(0, 3)
BarBgCorner.Parent       = SplashBarBg

local BarBgStroke = Instance.new("UIStroke")
BarBgStroke.Color        = Color3.fromRGB(34, 40, 54)
BarBgStroke.Thickness    = 1
BarBgStroke.Parent       = SplashBarBg

-- Progress Bar Fill
local SplashBarFill = Instance.new("Frame")
SplashBarFill.Size             = UDim2.new(0, 0, 1, 0)
SplashBarFill.BackgroundColor3 = Color3.fromRGB(255, 107, 53)
SplashBarFill.BorderSizePixel  = 0
SplashBarFill.ClipsDescendants = false
SplashBarFill.ZIndex           = 203
SplashBarFill.Parent           = SplashBarBg

local BarFillCorner = Instance.new("UICorner")
BarFillCorner.CornerRadius = UDim.new(0, 3)
BarFillCorner.Parent       = SplashBarFill

local BarGrad = Instance.new("UIGradient")
BarGrad.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 140, 60)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 95, 30)),
})
BarGrad.Parent = SplashBarFill

-- Glowing Head Capsule
local BarHead = Instance.new("Frame")
BarHead.Name                   = "BarHead"
BarHead.Size                   = UDim2.fromOffset(8, 10)
BarHead.AnchorPoint            = Vector2.new(0.5, 0.5)
BarHead.Position               = UDim2.new(1, 0, 0.5, 0)
BarHead.BackgroundColor3       = Color3.fromRGB(255, 230, 200)
BarHead.BorderSizePixel        = 0
BarHead.ZIndex                 = 204
BarHead.Parent                 = SplashBarFill

local BarHeadCorner = Instance.new("UICorner")
BarHeadCorner.CornerRadius = UDim.new(1, 0)
BarHeadCorner.Parent       = BarHead

-- Animated Loading Indicator (Pulsing dots)
local SplashDots = Instance.new("TextLabel")
SplashDots.Size                = UDim2.new(1, 0, 0, 14)
SplashDots.Position            = UDim2.fromOffset(0, 150)
SplashDots.BackgroundTransparency = 1
SplashDots.Text                = "●  ○  ○"
SplashDots.TextColor3          = Color3.fromRGB(255, 107, 53)
SplashDots.TextSize            = 9
SplashDots.Font                = Enum.Font.GothamBold
SplashDots.TextXAlignment      = Enum.TextXAlignment.Center
SplashDots.ZIndex              = 202
SplashDots.Parent              = SplashCard

-- Bottom Secure Runtime Badge
local SplashFooter = Instance.new("TextLabel")
SplashFooter.Size                = UDim2.new(1, 0, 0, 14)
SplashFooter.Position            = UDim2.fromOffset(0, 172)
SplashFooter.BackgroundTransparency = 1
SplashFooter.Text                = "SECURE ROBLOX RUNTIME • HYPERVISOR V6"
SplashFooter.TextColor3          = Color3.fromRGB(90, 100, 125)
SplashFooter.TextSize            = 8
SplashFooter.Font                = Enum.Font.GothamMedium
SplashFooter.TextXAlignment      = Enum.TextXAlignment.Center
SplashFooter.ZIndex              = 202
SplashFooter.Parent              = SplashCard

-- Entrance animation
SplashCard.BackgroundTransparency = 1
SplashCard.Size = UDim2.new(0, 320, 0, 180)
local function tw(o, t, p, s, d)
    TweenService:Create(o, TweenInfo.new(t or 0.25, s or Enum.EasingStyle.Quart, d or Enum.EasingDirection.Out), p):Play()
end
tw(SplashCard, 0.35, {BackgroundTransparency = 0, Size = UDim2.new(0, 380, 0, 212)})
tw(SplashBg, 0.3, {BackgroundTransparency = 0.15})

for _, child in ipairs(SplashCard:GetDescendants()) do
    if child:IsA("TextLabel") then
        local targetTextTrans = child.TextTransparency
        if targetTextTrans < 1 then
            child.TextTransparency = 1
            TweenService:Create(child, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {TextTransparency = targetTextTrans}):Play()
        end
    elseif child:IsA("Frame") and child ~= SplashBarFill and child ~= BarHead then
        local targetBgTrans = child.BackgroundTransparency
        if targetBgTrans < 1 then
            child.BackgroundTransparency = 1
            TweenService:Create(child, TweenInfo.new(0.25, Enum.EasingStyle.Quad), {BackgroundTransparency = targetBgTrans}):Play()
        end
    end
end

-- Animated dots & status step cycle
local dotFrames = {"●  ○  ○", "○  ●  ○", "○  ○  ●"}
local statusSteps = {
    "Initializing system engine...",
    "Loading UI core & components...",
    "Fetching modules from server...",
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
        if now - lastStep >= 0.55 then
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
        tw(SplashBarFill, 0.15, {Size = UDim2.new(clamped, 0, 1, 0)})
        SplashPct.Text = tostring(math.floor(clamped * 100)) .. "%"
        updateSplashNodes(clamped)
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
    { key = "Fling",          path = "modules/combat/fling.lua" },
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
local Fling          = moduleResults.Fling
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
local function safe(m) return m or setmetatable({}, {__index = DUMMY}) end

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
Fling          = safe(Fling)
AutoClicker    = safe(AutoClicker)
QuickSwitch    = safe(QuickSwitch)
MacroRec       = safe(MacroRec)
Backtracker    = safe(Backtracker)
pcall(function()
    Backtracker:SetMacroRecorder(MacroRec)
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
    pcall(function() if Fling and Fling.Disable then Fling:Disable() end end)
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
local _winW   = isMobile and math.min(680, math.floor(_vp.X * 0.96)) or 740
local _winH   = isMobile and math.min(520, math.floor(_vp.Y * 0.88)) or 520
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

-- ── Determine favorites scope based on game mode ──────────────────────────────
local curFavScope = "universal"
if ActiveGameModule and ActiveGameModule.Name then
    local n = tostring(ActiveGameModule.Name):lower()
    if n:find("violence") or n:find("vd") then
        curFavScope = "vd"
    elseif n:find("ride") or n:find("pet") then
        curFavScope = "rideapet"
    elseif n:find("steal") and n:find("brainrot") then
        curFavScope = "stealbrainrot"
    elseif n:find("steal") and n:find("egg") then
        curFavScope = "stealanegg"
    elseif n:find("grow") then
        curFavScope = "growanegg"
    elseif n:find("fisch") then
        curFavScope = "fisch"
    elseif n:find("blade") then
        curFavScope = "bladeball"
    elseif n:find("sniper") then
        curFavScope = "sniperarena"
    else
        curFavScope = n:gsub("[^%w]", "")
        if curFavScope == "" then curFavScope = tostring(game.PlaceId) end
    end
end
if Library and Library.SetFavScope then
    Library:SetFavScope(curFavScope)
end

-- Notification helper
local function N(title, state, duration)
    Library:Notify({
        Title    = title,
        Content  = state or "",
        Duration = duration or 2,
    })
end

pcall(function()
    if Backtracker and Backtracker.SetNotifyCallback then
        Backtracker:SetNotifyCallback(N)
    end
end)


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

-- ════════════════════════════════════════════════════════════════════════════
-- PANIC KEY (Delete) — Active across BOTH Game Mode and Universal Mode
-- ════════════════════════════════════════════════════════════════════════════
local panicKey = Enum.KeyCode.Delete

local function triggerPanic()
    pcall(function()
        if ActiveGameModule and ActiveGameModule.Disable then
            ActiveGameModule:Disable()
        end
    end)

    -- Disable movement modules
    pcall(function() if flyToggle then flyToggle:Set(false) end; if Fly and Fly.Disable then Fly:Disable() end end)
    pcall(function() if speedToggle then speedToggle:Set(false) end; if Speed and Speed.Disable then Speed:Disable() end end)
    pcall(function() if fcToggle then fcToggle:Set(false) end; if FreeCam and FreeCam.Disable then FreeCam:Disable() end end)
    pcall(function() if infJumpToggle then infJumpToggle:Set(false) end; if InfJump and InfJump.Disable then InfJump:Disable() end end)
    pcall(function() if noclipToggle then noclipToggle:Set(false) end; if Noclip and Noclip.Disable then Noclip:Disable() end end)
    pcall(function() if antiRagdollToggle then antiRagdollToggle:Set(false) end; if AntiRagdoll and AntiRagdoll.Disable then AntiRagdoll:Disable() end end)
    pcall(function() if invisToggle then invisToggle:Set(false) end; if Invisible and Invisible.Disable then Invisible:Disable() end end)
    pcall(function() if clickTPToggle then clickTPToggle:Set(false) end; if ClickTP and ClickTP.Disable then ClickTP:Disable() end end)
    pcall(function() if wowToggle then wowToggle:Set(false) end; if WalkOnWater and WalkOnWater.Disable then WalkOnWater:Disable() end end)
    pcall(function() if orbitToggle then orbitToggle:Set(false) end; if Orbit and Orbit.Disable then Orbit:Disable() end end)

    -- Disable visual modules
    pcall(function() if espToggle then espToggle:Set(false) end; if ESP and ESP.Disable then ESP:Disable() end end)
    pcall(function() if fullBrightToggle then fullBrightToggle:Set(false) end; if FullBright and FullBright.Disable then FullBright:Disable() end end)
    pcall(function() if tracerToggle then tracerToggle:Set(false) end; if Tracer and Tracer.Disable then Tracer:Disable() end end)
    pcall(function() if removeFogToggle then removeFogToggle:Set(false) end; if RemoveFog and RemoveFog.Disable then RemoveFog:Disable() end end)
    pcall(function() if fovToggle then fovToggle:Set(false) end; if FOVMod and FOVMod.Disable then FOVMod:Disable() end end)
    pcall(function() if radarToggle then radarToggle:Set(false) end; if Radar and Radar.Disable then Radar:Disable() end end)

    -- Disable combat modules
    pcall(function() if killAuraToggle then killAuraToggle:Set(false) end; if KillAura and KillAura.Disable then KillAura:Disable() end end)
    pcall(function() if hitboxToggle then hitboxToggle:Set(false) end; if HitboxExp and HitboxExp.Disable then HitboxExp:Disable() end end)
    pcall(function() if ikToggle then ikToggle:Set(false) end; if InstantKill and InstantKill.Disable then InstantKill:Disable() end end)
    pcall(function() if quickSwitchToggle then quickSwitchToggle:Set(false) end; if QuickSwitch and QuickSwitch.Disable then QuickSwitch:Disable() end end)
    pcall(function() if flingToggle then flingToggle:Set(false) end; if Fling and Fling.Disable then Fling:Disable() end end)

    -- Disable player modules
    pcall(function() if infStaminaToggle then infStaminaToggle:Set(false) end; if InfStamina and InfStamina.Disable then InfStamina:Disable() end end)
    pcall(function() if godModeToggle then godModeToggle:Set(false) end; if GodMode and GodMode.Disable then GodMode:Disable() end end)
    pcall(function() if noFallToggle then noFallToggle:Set(false) end; if NoFallDmg and NoFallDmg.Disable then NoFallDmg:Disable() end end)
    pcall(function() if antiFlingToggle then antiFlingToggle:Set(false) end; if AntiFling and AntiFling.Disable then AntiFling:Disable() end end)
    pcall(function() if antiVoidToggle then antiVoidToggle:Set(false) end; if AntiVoid and AntiVoid.Disable then AntiVoid:Disable() end end)
    pcall(function() if gpSpoofToggle then gpSpoofToggle:Set(false) end; if GamepassSpoof and GamepassSpoof.Disable then GamepassSpoof:Disable() end end)
    pcall(function() if avatarCustomizerToggle then avatarCustomizerToggle:Set(false) end; if AvatarSpoof and AvatarSpoof.Disable then AvatarSpoof:Disable() end end)

    -- Disable auto modules
    pcall(function() if autoClickerToggle then autoClickerToggle:Set(false) end; if AutoClicker and AutoClicker.Disable then AutoClicker:Disable() end end)
    pcall(function() if backtrackerToggle then backtrackerToggle:Set(false) end; if Backtracker and Backtracker.Disable then Backtracker:Disable() end end)
    pcall(function() if instantPromptsToggle then instantPromptsToggle:Set(false) end; if InstantPrompts and InstantPrompts.Disable then InstantPrompts:Disable() end end)

    -- Stop waypoint queue
    pcall(function() if Waypoint and Waypoint.StopQueue then Waypoint:StopQueue() end end)

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
    pcall(function() if Window and Window.Close then Window:Close() end end)

    N("PANIC", "All features disabled")
end

UIS.InputBegan:Connect(function(i, gp)
    if gp or i.KeyCode ~= panicKey then return end
    triggerPanic()
end)

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

local FavTab    = Window:Tab({ Title = "Favorites", Icon = "star",            Category = "MAIN" })
local MovTab    = Window:Tab({ Title = "Movement",  Icon = "person-standing", Category = "MAIN" })
local CombatTab = Window:Tab({ Title = "Combat",    Icon = "swords",          Category = "MAIN" })
local PlayerTab = Window:Tab({ Title = "Player",    Icon = "shield",          Category = "MAIN" })
local TeleTab   = Window:Tab({ Title = "Teleport",  Icon = "map-pin",         Category = "UTILITY" })
local VisTab    = Window:Tab({ Title = "Visual",    Icon = "eye",             Category = "UTILITY" })
local AutoTab   = Window:Tab({ Title = "Auto",      Icon = "zap",             Category = "UTILITY" })
local MacroTab  = Window:Tab({ Title = "Macro",     Icon = "clapperboard",    Category = "UTILITY" })
local SetTab    = Window:Tab({ Title = "Settings",  Icon = "settings",        Category = "SYSTEM" })

local FavGroup = FavTab:Group({ Title = "Quick Access & Starred", Icon = "star" })
FavGroup:Paragraph({
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
-- ══════════════════════════════════════════════════════════════════════════════
-- MOVEMENT TAB
-- ══════════════════════════════════════════════════════════════════════════════
local FlightGroup = MovTab:Group({ Title = "Flight System", Icon = "plane" })

-- Fly toggle
flyToggle = FlightGroup:Toggle({
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
flySpeedSlider = FlightGroup:Slider({
    Title    = "Fly Speed",
    Value    = { Min = 10, Max = 500, Default = 60 },
    Step     = 1,
    Tooltip  = "Adjust flight speed (10-500)",
    Callback = function(v) if v >= 10 then Fly:SetSpeed(v) end end
})
ConfigMgr:Register("FlySpeed", flySpeedSlider)
flyKey = Enum.KeyCode.F
FlightGroup:Keybind({
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

local SpeedGroup = MovTab:Group({ Title = "Speed & Mobility", Icon = "zap" })

speedToggle = SpeedGroup:Toggle({
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
walkSpeedSlider = SpeedGroup:Slider({
    Title    = "Walk Speed",
    Value    = { Min = 16, Max = 250, Default = 16 },
    Step     = 1,
    Tooltip  = "Set walking speed (16-250)",
    Callback = function(v) Speed:SetWalkSpeed(v) end
})
ConfigMgr:Register("WalkSpeed", walkSpeedSlider)
jumpPowerSlider = SpeedGroup:Slider({
    Title    = "Jump Power",
    Value    = { Min = 50, Max = 500, Default = 50 },
    Step     = 1,
    Tooltip  = "Set jump height (50-500)",
    Callback = function(v) Speed:SetJumpPower(v) end
})
ConfigMgr:Register("JumpPower", jumpPowerSlider)

local PhysicsGroup = MovTab:Group({ Title = "Physics & Collision", Icon = "box" })

infJumpToggle = PhysicsGroup:Toggle({
    Title    = "Infinite Jump",
    Value    = false,
    Tooltip  = "Jump mid-air indefinitely",
    Callback = function(v)
        if v then InfJump:Enable() else InfJump:Disable() end
        N("Infinite Jump", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InfiniteJump", infJumpToggle)
noclipToggle = PhysicsGroup:Toggle({
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
PhysicsGroup:Keybind({
    Title    = "Noclip Keybind",
    Value    = "N",
    Tooltip  = "Press to toggle noclip on/off",
    Callback = function(k)
        noclipKey = Enum.KeyCode[k] or Enum.KeyCode.N
        N("Noclip Keybind", k)
    end
})
antiRagdollToggle = PhysicsGroup:Toggle({
    Title    = "Anti Ragdoll",
    Value    = false,
    Tooltip  = "Prevent ragdoll physics",
    Callback = function(v)
        if v then AntiRagdoll:Enable() else AntiRagdoll:Disable() end
        N("Anti Ragdoll", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiRagdoll", antiRagdollToggle)
invisToggle = PhysicsGroup:Toggle({
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

local FreeCamGroup = MovTab:Group({ Title = "Freecam System", Icon = "camera" })

fcKey = Enum.KeyCode.V
fcToggle = FreeCamGroup:Toggle({
    Title    = "Free Cam",
    Value    = false,
    Tooltip  = "Detach camera for cinematic views",
    Callback = function(v)
        if v then FreeCam:Enable() else FreeCam:Disable() end
        N("Free Cam", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("FreeCam", fcToggle)
fcSpeedSlider = FreeCamGroup:Slider({
    Title    = "Free Cam Speed",
    Value    = { Min = 5, Max = 300, Default = 40 },
    Step     = 1,
    Tooltip  = "Camera movement speed (5-300)",
    Callback = function(v) FreeCam:SetSpeed(v) end
})
ConfigMgr:Register("FreeCamSpeed", fcSpeedSlider)
FreeCamGroup:Keybind({
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

local SpecialGroup = MovTab:Group({ Title = "Special Movement", Icon = "sparkles" })

clickTPToggle = SpecialGroup:Toggle({
    Title    = "Click Teleport",
    Value    = false,
    Tooltip  = "Click anywhere to teleport to that location",
    Callback = function(v)
        if v then ClickTP:Enable() else ClickTP:Disable() end
        N("Click Teleport", v and "Enabled — click to tp" or "Disabled")
    end
})
ConfigMgr:Register("ClickTeleport", clickTPToggle)

wowToggle = SpecialGroup:Toggle({
    Title    = "Walk on Water",
    Value    = false,
    Tooltip  = "Walk on water surfaces",
    Callback = function(v)
        if v then WalkOnWater:Enable() else WalkOnWater:Disable() end
        N("Walk on Water", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("WalkOnWater", wowToggle)

local OrbitGroup = MovTab:Group({ Title = "Player Orbit", Icon = "orbit" })

orbitToggle = OrbitGroup:Toggle({
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

orbitTargetDrop = OrbitGroup:Dropdown({
    Title    = "Orbit Target",
    Tooltip  = "Select the player to orbit around",
    Values   = getOrbitPlayerList(),
    Value    = 1,
    Callback = function(v) Orbit:SetTarget(v) end
})

orbitRadiusSlider = OrbitGroup:Slider({
    Title    = "Orbit Radius",
    Value    = { Min = 5, Max = 50, Default = 15 },
    Step     = 1,
    Tooltip  = "Distance from the target (studs)",
    Callback = function(v) Orbit:SetRadius(v) end
})
ConfigMgr:Register("OrbitRadius", orbitRadiusSlider)

orbitSpeedSlider = OrbitGroup:Slider({
    Title    = "Orbit Speed",
    Value    = { Min = 1, Max = 20, Default = 2 },
    Step     = 1,
    Tooltip  = "How fast to orbit (radians/sec)",
    Callback = function(v) Orbit:SetSpeed(v) end
})
ConfigMgr:Register("OrbitSpeed", orbitSpeedSlider)

orbitHeightSlider = OrbitGroup:Slider({
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

local MacroRecGroup = MacroTab:Group({ Title = "Path Recorder", Icon = "disc" })

macroNameInput = MacroRecGroup:Input({
    Title = "Macro Name",
    Placeholder = "e.g. route_to_peak",
    Value = "",
    Tooltip = "Name your macro before recording",
    Callback = function() end
})

macroStatusText = MacroRecGroup:Paragraph({
    Title = "Status",
    Content = "Idle"
})

MacroRecGroup:Button({
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

MacroRecGroup:Button({
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

recordInputsToggle = MacroRecGroup:Toggle({
    Title = "Record Inputs (jump, WASD, click)",
    Value = true,
    Tooltip = "Capture keyboard/mouse inputs during recording",
    Callback = function(v) MacroRec.RecordInputs = v end
})
ConfigMgr:Register("MacroRecordInputs", recordInputsToggle)

local MacroPlayGroup = MacroTab:Group({ Title = "Path Playback", Icon = "play" })

MacroPlayGroup:Button({
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

MacroPlayGroup:Button({
    Title = "Pause / Resume",
    Icon  = "pause",
    Tooltip = "Pause or resume macro playback",
    Callback = function()
        MacroRec:PausePlayback()
    end
})

MacroPlayGroup:Button({
    Title = "Stop Playback",
    Icon  = "square",
    Tooltip = "Stop macro playback immediately",
    Callback = function()
        MacroRec:StopPlayback()
    end
})

speedSlider = MacroPlayGroup:Slider({
    Title = "Playback Speed",
    Value = { Min = 1, Max = 10, Default = 1 },
    Step = 1,
    Tooltip = "Macro playback speed multiplier (1x-10x)",
    Callback = function(v) MacroRec:SetPlaybackSpeed(v) end
})
ConfigMgr:Register("MacroSpeed", speedSlider)

loopToggle = MacroPlayGroup:Toggle({
    Title = "Loop Playback",
    Value = false,
    Tooltip = "Replay macro continuously after finishing",
    Callback = function(v) MacroRec:SetLoop(v) end
})
ConfigMgr:Register("MacroLoop", loopToggle)

antiFallToggle = MacroPlayGroup:Toggle({
    Title = "Anti-Fall (auto-recover)",
    Value = true,
    Tooltip = "Auto-correct position if character falls during playback",
    Callback = function(v) MacroRec.AntiFall = v end
})
ConfigMgr:Register("MacroAntiFall", antiFallToggle)

local BacktrackerGroup = MacroTab:Group({ Title = "Position Backtracker (Rewind)", Icon = "rotate-ccw" })

local backtrackerToggle = BacktrackerGroup:Toggle({
    Title    = "Position Backtracker",
    Flag     = "Backtracker",
    Value    = false,
    Tooltip  = "Record position history every 0.5s; rewind on demand or fling",
    Callback = function(s)
        if s then Backtracker:Enable() else Backtracker:Disable() end
        N("Backtracker", s and "Enabled (Hotkey: B)" or "Disabled")
    end
})

local backtrackerSecondsSlider = BacktrackerGroup:Slider({
    Title    = "Rewind Time (Seconds)",
    Flag     = "BacktrackerSeconds",
    Value    = { Min = 2, Max = 15, Default = 5 },
    Step     = 1,
    Tooltip  = "How many seconds into the past to teleport back",
    Callback = function(v) Backtracker:SetRewindSeconds(v) end
})

local backtrackerAutoFlingToggle = BacktrackerGroup:Toggle({
    Title    = "Auto Recover on Fling",
    Flag     = "BacktrackerAutoFling",
    Value    = false,
    Tooltip  = "Automatically rewinds position if extreme fling velocity is detected",
    Callback = function(s) Backtracker:SetAutoFling(s) end
})

BacktrackerGroup:Button({
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

local MacroStorageGroup = MacroTab:Group({ Title = "Macro Storage & Transfer", Icon = "folder" })

MacroStorageGroup:Button({
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

macroDropdown = MacroStorageGroup:Dropdown({
    Title = "Select Macro",
    Values = refreshMacroList(),
    Value = 1,
    Tooltip = "Choose a saved macro to load or play",
    Callback = function(v) selectedMacroName = v end
})

MacroStorageGroup:Button({
    Title = "Refresh List",
    Icon  = "refresh-cw",
    Tooltip = "Refresh the saved macros list",
    Callback = function()
        refreshMacroList()
        N("Macro", "List refreshed")
    end
})

MacroStorageGroup:Button({
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

MacroStorageGroup:Button({
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

MacroStorageGroup:Button({
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

importInput = MacroStorageGroup:Input({
    Title = "Paste JSON to Import",
    Placeholder = "Paste exported macro here...",
    Value = "",
    Tooltip = "Paste macro JSON data here to import",
    Callback = function() end
})

MacroStorageGroup:Button({
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

local MacroQueueGroup = MacroTab:Group({ Title = "Macro Sequence Queue", Icon = "list" })

MacroQueueGroup:Paragraph({
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

MacroQueueGroup:Button({
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

MacroQueueGroup:Button({
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

MacroQueueGroup:Button({
    Title = "Clear Queue",
    Icon  = "trash",
    Tooltip = "Remove all macros from the queue",
    Callback = function()
        MacroRec:ClearQueue()
        refreshQueueDisplay()
        N("Queue", "Queue cleared")
    end
})

queueDisplayDropdown = MacroQueueGroup:Dropdown({
    Title = "Current Queue",
    Tooltip = "View macros in the playback queue",
    Values = refreshQueueDisplay(),
    Value = 1,
    Callback = function(v) selectedQueueItem = v end
})

queueLoopToggle = MacroQueueGroup:Toggle({
    Title = "Loop Queue",
    Tooltip = "Replay the entire queue continuously",
    Value = true,
    Callback = function(v)
        MacroRec:SetQueueLoop(v)
        N("Queue", v and "Loop enabled" or "Loop disabled")
    end
})
ConfigMgr:Register("MacroQueueLoop", queueLoopToggle)

MacroQueueGroup:Button({
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

MacroQueueGroup:Button({
    Title = "Stop Queue Playback",
    Icon  = "square",
    Tooltip = "Stop the macro queue playback",
    Callback = function()
        MacroRec:StopQueuePlayback()
        N("Queue", "Queue stopped")
    end
})

MacroQueueGroup:Paragraph({
    Title = "Current Map",
    Content = "PlaceId: " .. tostring(game.PlaceId)
})

perMapToggle = MacroQueueGroup:Toggle({
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
local WorldRenderGroup = VisTab:Group({ Title = "World & Lighting", Icon = "sun" })

perfStatsToggle = WorldRenderGroup:Toggle({
    Title    = "Perf Stats (HUD)",
    Tooltip = "Show real-time FPS and performance overlay",
    Value    = true,
    Callback = function(v)
        if v then PerfStats:Enable() else PerfStats:Disable() end
        N("Perf Stats", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("PerfStats", perfStatsToggle)
fullBrightToggle = WorldRenderGroup:Toggle({
    Title    = "FullBright",
    Tooltip = "Remove all darkness and shadows",
    Value    = false,
    Callback = function(v)
        if v then FullBright:Enable() else FullBright:Disable() end
        N("FullBright", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("FullBright", fullBrightToggle)
removeFogToggle = WorldRenderGroup:Toggle({
    Title    = "Remove Fog",
    Tooltip = "Clear fog for better visibility",
    Value    = false,
    Callback = function(v)
        if v then RemoveFog:Enable() else RemoveFog:Disable() end
        N("Remove Fog", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("RemoveFog", removeFogToggle)

local ESPGroup = VisTab:Group({ Title = "Player ESP", Icon = "eye" })

espToggle = ESPGroup:Toggle({
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

local EC = {
    White  = Color3.fromRGB(255,255,255), Red    = Color3.fromRGB(255,60,60),
    Green  = Color3.fromRGB(60,220,80),   Blue   = Color3.fromRGB(60,130,255),
    Yellow = Color3.fromRGB(255,220,50),  Cyan   = Color3.fromRGB(60,220,255),
    Pink   = Color3.fromRGB(255,100,200)
}
espColorDrop = ESPGroup:Dropdown({
    Title    = "ESP Color",
    Tooltip = "Color of the ESP overlay",
    Values   = {"White","Red","Green","Blue","Yellow","Cyan","Pink"},
    Value    = "White",
    Callback = function(v) ESP:SetColor(EC[v] or Color3.new(1,1,1)) end
})
ConfigMgr:Register("ESPColor", espColorDrop)
espOpacitySlider = ESPGroup:Slider({
    Title    = "ESP Fill Opacity",
    Tooltip = "ESP box fill transparency (0-100)",
    Value    = { Min = 0, Max = 100, Default = 15 },
    Step     = 1,
    Callback = function(v) ESP:SetOpacity(v) end
})
ConfigMgr:Register("ESPOpacity", espOpacitySlider)
espModeDrop = ESPGroup:Dropdown({
    Title    = "ESP Show Mode",
    Tooltip = "Show body, name, or both",
    Values   = {"Both","Body","Name"},
    Value    = "Both",
    Callback = function(v) ESP:SetShowMode(v) end
})
ConfigMgr:Register("ESPMode", espModeDrop)

espTeamColorToggle = ESPGroup:Toggle({
    Title    = "Team Color (Override ESP Color by Team)",
    Value    = false,
    Tooltip  = "Use the player's team color instead of the selected ESP color",
    Callback = function(v)
        ESP:SetTeamColor(v)
        N("ESP", v and "Team Color Enabled" or "Team Color Disabled")
    end
})
ConfigMgr:Register("ESPTeamColor", espTeamColorToggle)

espSkeletonToggle = ESPGroup:Toggle({
    Title    = "Skeleton ESP (Bone Lines)",
    Value    = false,
    Tooltip  = "Draw skeleton bone lines through walls (requires Drawing API)",
    Callback = function(v)
        ESP:SetShowSkeleton(v)
        N("ESP", v and "Skeleton Enabled" or "Skeleton Disabled")
    end
})
ConfigMgr:Register("ESPSkeleton", espSkeletonToggle)

local TracerGroup = VisTab:Group({ Title = "Player Tracers", Icon = "crosshair" })

tracerToggle = TracerGroup:Toggle({
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
tracerColorDrop = TracerGroup:Dropdown({
    Title    = "Tracer Color",
    Tooltip = "Color of tracer lines",
    Values   = {"White","Red","Green","Blue","Yellow","Cyan"},
    Value    = "White",
    Callback = function(v) Tracer:SetColor(TC[v] or Color3.new(1,1,1)) end
})
ConfigMgr:Register("TracerColor", tracerColorDrop)
tracerOpacitySlider = TracerGroup:Slider({
    Title    = "Tracer Opacity",
    Tooltip = "Tracer line transparency (0-100)",
    Value    = { Min = 0, Max = 100, Default = 100 },
    Step     = 1,
    Callback = function(v) Tracer:SetOpacity(v) end
})
ConfigMgr:Register("TracerOpacity", tracerOpacitySlider)
tracerThickSlider = TracerGroup:Slider({
    Title    = "Tracer Thickness",
    Tooltip = "Tracer line width (1-8)",
    Value    = { Min = 1, Max = 8, Default = 2 },
    Step     = 1,
    Callback = function(v) Tracer:SetThickness(v) end
})
ConfigMgr:Register("TracerThickness", tracerThickSlider)

local PerformanceGroup = VisTab:Group({ Title = "Performance & Anti-Lag", Icon = "cpu" })
antiLagToggle = PerformanceGroup:Toggle({
    Title    = "Anti-Lag Mode",
    Tooltip  = "Disable heavy particles, shadows, and terrain details",
    Value    = false,
    Callback = function(v)
        if v then PerfBooster:Enable() else PerfBooster:Disable() end
        N("Anti-Lag Mode", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiLagMode", antiLagToggle)

superAntiLagToggle = PerformanceGroup:Toggle({
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

fpsCapSlider = PerformanceGroup:Slider({
    Title    = "FPS Cap",
    Tooltip  = "Set maximum FPS cap (30-240)",
    Value    = { Min = 30, Max = 240, Default = 60 },
    Step     = 5,
    Callback = function(v) PerfBooster:SetFPSCap(v) end
})
ConfigMgr:Register("FPSCap", fpsCapSlider)

local CameraRadarGroup = VisTab:Group({ Title = "Camera FOV & Radar", Icon = "maximize" })

fovToggle = CameraRadarGroup:Toggle({
    Title    = "FOV Modifier",
    Value    = false,
    Tooltip  = "Adjust the camera Field of View (40-120)",
    Callback = function(v)
        if v then FOVMod:Enable() else FOVMod:Disable() end
        N("FOV Modifier", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("FOVModifier", fovToggle)

fovSlider = CameraRadarGroup:Slider({
    Title    = "Field of View",
    Value    = { Min = 40, Max = 120, Default = 70 },
    Step     = 1,
    Tooltip  = "Camera FOV value (40 narrow - 120 wide)",
    Callback = function(v) FOVMod:SetFOV(v) end
})
ConfigMgr:Register("FOVValue", fovSlider)

radarToggle = CameraRadarGroup:Toggle({
    Title    = "Radar",
    Value    = false,
    Tooltip  = "Show a corner minimap with player dots",
    Callback = function(v)
        if v then Radar:Enable() else Radar:Disable() end
        N("Radar", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("Radar", radarToggle)

radarRangeSlider = CameraRadarGroup:Slider({
    Title    = "Radar Range",
    Value    = { Min = 50, Max = 500, Default = 200 },
    Step     = 10,
    Tooltip  = "Detection range for the radar (studs)",
    Callback = function(v) Radar:SetRange(v) end
})
ConfigMgr:Register("RadarRange", radarRangeSlider)

radarSizeSlider = CameraRadarGroup:Slider({
    Title    = "Radar Size",
    Value    = { Min = 80, Max = 300, Default = 150 },
    Step     = 10,
    Tooltip  = "Pixel size of the radar frame",
    Callback = function(v) Radar:SetSize(v) end
})
ConfigMgr:Register("RadarSize", radarSizeSlider)

radarOpacitySlider = CameraRadarGroup:Slider({
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
local KillAuraGroup = CombatTab:Group({ Title = "Kill Aura System", Icon = "swords" })

killAuraToggle = KillAuraGroup:Toggle({
    Title    = "Kill Aura",
    Tooltip = "Auto-attack nearby enemies",
    Value    = false,
    Callback = function(v)
        if v then KillAura:Enable() else KillAura:Disable() end
        N("Kill Aura", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("KillAura", killAuraToggle)

killAuraRadiusSlider = KillAuraGroup:Slider({
    Title    = "Radius",
    Tooltip = "Kill aura detection range (5-50)",
    Value    = { Min = 5, Max = 50, Default = 15 },
    Step     = 1,
    Callback = function(v) KillAura:SetRadius(v) end
})
ConfigMgr:Register("KillAuraRadius", killAuraRadiusSlider)

killAuraIntervalSlider = KillAuraGroup:Slider({
    Title    = "Attack Interval (ms)",
    Tooltip = "Time between attacks in milliseconds",
    Value    = { Min = 50, Max = 1000, Default = 100 },
    Step     = 50,
    Callback = function(v) KillAura:SetAttackInterval(v / 1000) end
})
ConfigMgr:Register("KillAuraInterval", killAuraIntervalSlider)

killAuraPlayersToggle = KillAuraGroup:Toggle({
    Title    = "Target Players",
    Tooltip = "Include players in kill aura targets",
    Value    = true,
    Callback = function(v) KillAura:SetTargetPlayers(v) end
})
ConfigMgr:Register("KillAuraPlayers", killAuraPlayersToggle)

killAuraNPCsToggle = KillAuraGroup:Toggle({
    Title    = "Target NPCs",
    Tooltip = "Include NPCs in kill aura targets",
    Value    = true,
    Callback = function(v) KillAura:SetTargetNPCs(v) end
})
ConfigMgr:Register("KillAuraNPCs", killAuraNPCsToggle)

killAuraTeamToggle = KillAuraGroup:Toggle({
    Title    = "Team Check",
    Tooltip = "Skip teammates when attacking",
    Value    = true,
    Callback = function(v) KillAura:SetTeamCheck(v) end
})
ConfigMgr:Register("KillAuraTeamCheck", killAuraTeamToggle)

local HitboxGroup = CombatTab:Group({ Title = "Hitbox Expander", Icon = "box" })

hitboxToggle = HitboxGroup:Toggle({
    Title    = "Hitbox Expander",
    Tooltip = "Visualize and expand hitboxes",
    Value    = false,
    Callback = function(v)
        if v then HitboxExp:Enable() else HitboxExp:Disable() end
        N("Hitbox Expander", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("HitboxExpander", hitboxToggle)
hitboxSizeSlider = HitboxGroup:Slider({
    Title    = "Size",
    Tooltip = "Hitbox expansion size (5-30)",
    Value    = { Min = 5, Max = 30, Default = 10 },
    Step     = 1,
    Callback = function(v) HitboxExp:SetSize(v) end
})
ConfigMgr:Register("HitboxSize", hitboxSizeSlider)
hitboxAlphaSlider = HitboxGroup:Slider({
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
hitboxColorDrop = HitboxGroup:Dropdown({
    Title    = "Color",
    Tooltip = "Hitbox overlay color",
    Values   = {"Red","Green","Blue","Yellow","Cyan","Pink","White","Orange"},
    Value    = "Red",
    Callback = function(v) HitboxExp:SetColor(HC[v] or Color3.fromRGB(255,60,60)) end
})
ConfigMgr:Register("HitboxColor", hitboxColorDrop)
teamCheckToggle = HitboxGroup:Toggle({
    Title    = "Team Check",
    Tooltip = "Skip teammates for hitbox expansion",
    Value    = true,
    Callback = function(v)
        HitboxExp:SetTeamCheck(v)
        N("Team Check", v and "Skip teammates" or "Target all")
    end
})
ConfigMgr:Register("TeamCheck", teamCheckToggle)

HitboxGroup:Keybind({
    Title    = "Hitbox Keybind",
    Tooltip = "Press to toggle hitbox expander",
    Value    = "H",
    Callback = function(k)
        hitboxKey = Enum.KeyCode[k] or Enum.KeyCode.H
        N("Hitbox Keybind", k)
    end
})

local QuickSwitchGroup = CombatTab:Group({ Title = "Quick Switch", Icon = "repeat" })

quickSwitchToggle = QuickSwitchGroup:Toggle({
    Title    = "Quick Switch",
    Tooltip  = "Auto switch to knife and back on shoot ('qq')",
    Value    = false,
    Callback = function(v)
        if v then QuickSwitch:Enable() else QuickSwitch:Disable() end
        N("Quick Switch", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("QuickSwitch", quickSwitchToggle)

qsShotDelaySlider = QuickSwitchGroup:Slider({
    Title    = "Shot Delay (ms)",
    Tooltip  = "Delay after shooting before switching weapon (ms)",
    Value    = { Min = 0, Max = 1000, Default = 50 },
    Step     = 5,
    Callback = function(v) QuickSwitch:SetDelayAfterShot(v) end
})
ConfigMgr:Register("QuickSwitchShotDelay", qsShotDelaySlider)

qsSwitchDelaySlider = QuickSwitchGroup:Slider({
    Title    = "Switch Delay (ms)",
    Tooltip  = "Delay between switches (knife and weapon) (ms)",
    Value    = { Min = 0, Max = 1000, Default = 50 },
    Step     = 5,
    Callback = function(v) QuickSwitch:SetDelayBetweenSwitches(v) end
})
ConfigMgr:Register("QuickSwitchSwitchDelay", qsSwitchDelaySlider)

qsModeDrop = QuickSwitchGroup:Dropdown({
    Title    = "Switch Type",
    Tooltip  = "Weapon switch key combination",
    Values   = {"Q-Q", "3-1", "Custom"},
    Value    = "Q-Q",
    Callback = function(v) QuickSwitch:SetSwitchType(v) end
})
ConfigMgr:Register("QuickSwitchType", qsModeDrop)

qsFirstKeyInput = QuickSwitchGroup:Input({
    Title       = "Custom First Key",
    Tooltip     = "First key to press (e.g. Three or Q)",
    Placeholder = "Three",
    Value       = "Q",
    Callback    = function(v) QuickSwitch:SetFirstKey(v) end
})
ConfigMgr:Register("QuickSwitchFirstKey", qsFirstKeyInput)

qsSecondKeyInput = QuickSwitchGroup:Input({
    Title       = "Custom Second Key",
    Tooltip     = "Second key to press (e.g. One or Q)",
    Placeholder = "One",
    Value       = "Q",
    Callback    = function(v) QuickSwitch:SetSecondKey(v) end
})
ConfigMgr:Register("QuickSwitchSecondKey", qsSecondKeyInput)

local InstantKillGroup = CombatTab:Group({ Title = "Instant Kill NPC", Icon = "skull" })

ikToggle = InstantKillGroup:Toggle({
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
ikModeDrop = InstantKillGroup:Dropdown({
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
ikTargetIn = InstantKillGroup:Input({
    Title       = "Target NPC Name",
    Tooltip = "NPC name to target in Specific mode",
    Placeholder = "e.g. Zombie",
    Value       = "",
    Callback    = function(v) InstantKill:SetTarget(v) end
})
ConfigMgr:Register("KillTarget", ikTargetIn)
InstantKillGroup:Button({
    Title    = "Show Kill Count",
    Tooltip = "Display current NPC kill count",
    Callback = function()
        N("Kill Count", tostring(InstantKill:GetKillCount()).." NPCs")
    end
})

local FlingGroup = CombatTab:Group({ Title = "Player Fling System", Icon = "wind" })

flingToggle = FlingGroup:Toggle({
    Title    = "Touch Fling",
    Flag     = "TouchFling",
    Value    = false,
    Tooltip  = "Spin at extreme angular velocity to fling any player you touch into the void",
    Callback = function(v)
        if v then Fling:Enable() else Fling:Disable() end
        N("Fling", v and "Touch Fling Enabled" or "Disabled")
    end
})
ConfigMgr:Register("TouchFling", flingToggle)

flingPowerSlider = FlingGroup:Slider({
    Title    = "Fling Power",
    Flag     = "FlingPower",
    Value    = { Min = 10000, Max = 150000, Default = 50000 },
    Step     = 5000,
    Tooltip  = "Angular velocity multiplier (higher = flings further)",
    Callback = function(v)
        Fling:SetPower(v)
    end
})
ConfigMgr:Register("FlingPower", flingPowerSlider)

flingModeDrop = FlingGroup:Dropdown({
    Title    = "Fling Physics Mode",
    Flag     = "FlingMode",
    Values   = { "AngularVelocity", "BodyAngularVelocity", "RotVelocity" },
    Value    = "AngularVelocity",
    Tooltip  = "Physics method used to generate fling impulse",
    Callback = function(v)
        Fling:SetMode(v)
    end
})
ConfigMgr:Register("FlingMode", flingModeDrop)

flingTeamToggle = FlingGroup:Toggle({
    Title    = "Team Check",
    Flag     = "FlingTeamCheck",
    Value    = false,
    Tooltip  = "Do not fling teammates",
    Callback = function(v)
        Fling:SetTeamCheck(v)
    end
})
ConfigMgr:Register("FlingTeamCheck", flingTeamToggle)

local selectedFlingTarget = nil
local flingTargetDrop = nil

local function refreshFlingTargets()
    local list = Fling:GetPlayerList()
    selectedFlingTarget = list[1]
    if flingTargetDrop then
        flingTargetDrop:Refresh(list)
        flingTargetDrop:Select(list[1])
    end
    return list
end

flingTargetDrop = FlingGroup:Dropdown({
    Title    = "Target Player",
    Values   = Fling:GetPlayerList(),
    Value    = 1,
    Tooltip  = "Select a player to fling",
    Callback = function(v)
        selectedFlingTarget = v
        Fling:SetTarget(v)
    end
})

FlingGroup:Button({
    Title    = "Refresh Player List",
    Icon     = "refresh-cw",
    Tooltip  = "Refresh active server players for fling targeting",
    Callback = function()
        refreshFlingTargets()
        N("Fling", "Player list refreshed")
    end
})

FlingGroup:Button({
    Title    = "Fling Target Player",
    Icon     = "target",
    Tooltip  = "Teleport into target player, fling them away, and return back safely",
    Callback = function()
        if not selectedFlingTarget or selectedFlingTarget == "(no players)" then
            N("Fling", "Select a target player first!")
            return
        end
        Fling:FlingTarget(selectedFlingTarget, N)
    end
})

FlingGroup:Button({
    Title    = "Fling All Players",
    Icon     = "flame",
    Tooltip  = "Sequentially fling every player in the server, then return to original spot",
    Callback = function()
        Fling:FlingAll(N)
    end
})

-- ══════════════════════════════════════════════════════════════════════════════
-- PLAYER TAB (Utility & Protection)
-- ══════════════════════════════════════════════════════════════════════════════
local PlayerUtilGroup = PlayerTab:Group({ Title = "Player Utility", Icon = "user" })

antiAFKToggle = PlayerUtilGroup:Toggle({
    Title    = "Anti AFK",
    Tooltip  = "Prevent idle kick (always on when enabled)",
    Value    = false,
    Callback = function(v)
        if v then AntiAFK:Enable() else AntiAFK:Disable() end
        N("Anti AFK", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiAFK", antiAFKToggle)

infStaminaToggle = PlayerUtilGroup:Toggle({
    Title    = "Infinite Stamina",
    Tooltip  = "Never get tired while running",
    Value    = false,
    Callback = function(v)
        if v then InfStamina:Enable() else InfStamina:Disable() end
        N("Infinite Stamina", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InfStamina", infStaminaToggle)

godModeToggle = PlayerUtilGroup:Toggle({
    Title    = "God Mode",
    Tooltip  = "Become immune to damage (game-dependent)",
    Value    = false,
    Callback = function(v)
        if v then GodMode:Enable() else GodMode:Disable() end
        N("God Mode", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("GodMode", godModeToggle)

local ProtectionGroup = PlayerTab:Group({ Title = "Protection & Anti-Fling", Icon = "shield" })

antiDetectToggle = ProtectionGroup:Toggle({
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

noFallToggle = ProtectionGroup:Toggle({
    Title    = "No Fall Damage",
    Tooltip  = "Immune to fall damage",
    Value    = false,
    Callback = function(v)
        if v then NoFallDmg:Enable() else NoFallDmg:Disable() end
        N("No Fall Damage", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("NoFallDamage", noFallToggle)

antiFlingToggle = ProtectionGroup:Toggle({
    Title    = "Anti Fling",
    Tooltip  = "Protection against being flung by other players",
    Value    = false,
    Callback = function(v)
        if v then AntiFling:Enable() else AntiFling:Disable() end
        N("Anti Fling", v and "Enabled (Enhanced)" or "Disabled")
    end
})
ConfigMgr:Register("AntiFling", antiFlingToggle)

flingThreshSlider = ProtectionGroup:Slider({
    Title    = "Fling Threshold",
    Tooltip  = "Velocity spike threshold to trigger anti-fling",
    Value    = { Min = 50, Max = 500, Default = 150 },
    Step     = 10,
    Callback = function(v) AntiFling:SetThreshold(v) end
})
ConfigMgr:Register("FlingThreshold", flingThreshSlider)

massManipToggle = ProtectionGroup:Toggle({
    Title    = "Mass Manipulation",
    Tooltip  = "Increase character mass to resist flings",
    Value    = true,
    Callback = function(v) 
        AntiFling:SetMassManipulation(v)
        N("Anti Fling", v and "Heavy mode ON" or "Heavy mode OFF")
    end
})
ConfigMgr:Register("MassManipulation", massManipToggle)

antiVoidToggle = ProtectionGroup:Toggle({
    Title    = "Anti Void",
    Tooltip  = "Teleport back when falling into the void",
    Value    = false,
    Callback = function(v)
        if v then AntiVoid:Enable() else AntiVoid:Disable() end
        N("Anti Void", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AntiVoid", antiVoidToggle)

voidThreshSlider = ProtectionGroup:Slider({
    Title    = "Void Threshold (Y)",
    Tooltip  = "Y position that triggers anti-void teleport",
    Value    = { Min = -200, Max = 0, Default = -50 },
    Step     = 10,
    Callback = function(v) AntiVoid:SetVoidThreshold(v) end
})
ConfigMgr:Register("VoidThreshold", voidThreshSlider)

local ExploitGroup = PlayerTab:Group({ Title = "Gamepass & Purchase Spoof", Icon = "zap" })

local gpSpoofToggle
pcall(function()
    gpSpoofToggle = ExploitGroup:Toggle({
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
    gpInstantToggle = ExploitGroup:Toggle({
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
    gpInjectToggle = ExploitGroup:Toggle({
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
    ExploitGroup:Button({
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

local AvatarGroup = PlayerTab:Group({ Title = "Avatar Customizer", Icon = "shirt" })

avatarCustomizerToggle = AvatarGroup:Toggle({
    Title    = "Avatar Customizer",
    Tooltip  = "Enable local and replicated avatar modifications (Headless, Korblox)",
    Value    = false,
    Callback = function(v)
        if v then AvatarSpoof:Enable() else AvatarSpoof:Disable() end
        N("Avatar Customizer", v and "Customizer Enabled" or "Customizer Disabled")
    end
})
ConfigMgr:Register("AvatarCustomizer", avatarCustomizerToggle)

headlessToggle = AvatarGroup:Toggle({
    Title    = "Headless Head",
    Tooltip  = "Make your head and face invisible (local/replicated if supported)",
    Value    = false,
    Callback = function(v)
        AvatarSpoof:SetHeadless(v)
        N("Headless Head", v and "Headless ON" or "Headless OFF")
    end
})
ConfigMgr:Register("AvatarHeadless", headlessToggle)

korbloxToggle = AvatarGroup:Toggle({
    Title    = "Korblox Leg",
    Tooltip  = "Replace your right leg with Korblox leg (local/replicated if supported)",
    Value    = false,
    Callback = function(v)
        AvatarSpoof:SetKorbloxLeg(v)
        N("Korblox Leg", v and "Korblox leg ON" or "Korblox leg OFF")
    end
})
ConfigMgr:Register("AvatarKorblox", korbloxToggle)

accessoryIdInput = AvatarGroup:Input({
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

savedAccDropdown = AvatarGroup:Dropdown({
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

AvatarGroup:Button({
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

AvatarGroup:Button({
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

AvatarGroup:Button({
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

AvatarGroup:Button({
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

AvatarGroup:Button({
    Title    = "Remove All",
    Icon     = "trash",
    Tooltip  = "Unequip and clear all saved accessories",
    Callback = function()
        AvatarSpoof:ClearAllSaved()
        N("Avatar Customizer", "All accessories removed & cleared")
        refreshAccDropdown()
    end
})

local ServerGroup = PlayerTab:Group({ Title = "Server & Account", Icon = "server" })
ServerGroup:Paragraph({ Title = "Username", Content = lp.Name })
ServerGroup:Paragraph({ Title = "User ID",  Content = tostring(lp.UserId) })
ServerGroup:Button({
    Title    = "Copy Player ID",
    Icon     = "copy",
    Tooltip = "Copy your Roblox user ID to clipboard",
    Callback = function()
        pcall(function() setclipboard(tostring(lp.UserId)) end)
        N("Player ID", tostring(lp.UserId))
    end
})

autoRejoinToggle = ServerGroup:Toggle({
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

ServerGroup:Button({
    Title    = "Rejoin Current Server",
    Icon     = "refresh-cw",
    Tooltip  = "Reconnect to this server instance",
    Callback = function()
        N("Server", "Rejoining...")
        ServerUtils:Rejoin()
    end
})
ServerGroup:Button({
    Title    = "Server Hop",
    Icon     = "shuffle",
    Tooltip  = "Join a different server of the same game",
    Callback = function()
        N("Server", "Finding new server...")
        ServerUtils:ServerHop()
    end
})
ServerGroup:Button({
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
local QuickPosGroup = TeleTab:Group({ Title = "Quick Position Memory", Icon = "navigation" })

QuickPosGroup:Button({
    Title    = "Copy My Position",
    Icon     = "map-pin",
    Tooltip = "Save your current position",
    Callback = function()
        local p = Teleport:SavePosition()
        if p then N("Teleport", ("Saved: %.0f, %.0f, %.0f"):format(p.X,p.Y,p.Z))
        else N("Teleport", "No character") end
    end
})
QuickPosGroup:Button({
    Title    = "Go to Saved Position",
    Icon     = "navigation",
    Tooltip = "Teleport to your last saved position",
    Callback = function()
        if Teleport:GotoSaved(Fly) then N("Teleport", "Teleported")
        else N("Teleport", "No position saved") end
    end
})

local PlayerTPGroup = TeleTab:Group({ Title = "Teleport to Player", Icon = "user" })

selectedPlayer = nil
tpDrop = PlayerTPGroup:Dropdown({
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

PlayerTPGroup:Button({
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
PlayerTPGroup:Button({
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

local WaypointGroup = TeleTab:Group({ Title = "Custom Waypoints", Icon = "map-pin" })

wpNameIn = WaypointGroup:Input({
    Title       = "Waypoint Name",
    Tooltip = "Name for your waypoint",
    Placeholder = "e.g. spawn",
    Value       = "",
    Callback    = function() end
})

selectedWaypoint = nil
local wpDrop

WaypointGroup:Button({
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

wpDrop = WaypointGroup:Dropdown({
    Title    = "Select Waypoint",
    Tooltip = "Choose a waypoint to teleport to",
    Values   = Waypoint:GetList(),
    Value    = 1,
    Callback = function(v) selectedWaypoint = v end
})
do local list = Waypoint:GetList(); selectedWaypoint = list[1] end

WaypointGroup:Button({
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
WaypointGroup:Button({
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
WaypointGroup:Button({
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

WaypointGroup:Keybind({
    Title    = "Teleport Keybind",
    Tooltip = "Press to teleport to selected waypoint",
    Value    = "G",
    Callback = function(k)
        tpWaypointKey = Enum.KeyCode[k] or Enum.KeyCode.G
        N("TP Keybind", k)
    end
})

local WPQueueGroup = TeleTab:Group({ Title = "Waypoint Queue (Sequential)", Icon = "list" })

WPQueueGroup:Paragraph({
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

WPQueueGroup:Button({
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

WPQueueGroup:Button({
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

WPQueueGroup:Button({
    Title = "Clear Queue",
    Icon  = "trash",
    Tooltip = "Clear the waypoint queue",
    Callback = function()
        Waypoint:ClearQueue()
        refreshWpQueue()
        N("Queue", "Queue cleared")
    end
})

wpQueueDropdown = WPQueueGroup:Dropdown({
    Title = "Current Queue",
    Tooltip = "View waypoints in the teleport queue",
    Values = refreshWpQueue(),
    Value = 1,
    Callback = function(v) selectedWpQueueItem = v end
})

queueDelaySlider = WPQueueGroup:Slider({
    Title = "Delay Between TPs (sec)",
    Tooltip = "Wait time between queue teleports (1-10s)",
    Value = { Min = 1, Max = 10, Default = 2 },
    Step = 1,
    Callback = function(v) Waypoint:SetQueueDelay(v) end
})
ConfigMgr:Register("WpQueueDelay", queueDelaySlider)

WPQueueGroup:Button({
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

WPQueueGroup:Button({
    Title = "Stop Queue",
    Icon  = "square",
    Tooltip = "Stop the waypoint queue",
    Callback = function()
        Waypoint:StopQueue()
        N("Queue", "Queue stopped")
    end
})

WPQueueGroup:Keybind({
    Title    = "Queue Keybind",
    Tooltip = "Press to start/stop waypoint queue",
    Value    = "X",
    Callback = function(k)
        wpQueueKey = Enum.KeyCode[k] or Enum.KeyCode.X
        N("Queue Keybind", k)
    end
})

local ServerTPGroup = TeleTab:Group({ Title = "Server Actions", Icon = "server" })

ServerTPGroup:Button({
    Title    = "Rejoin Server",
    Tooltip = "Reconnect to the same server",
    Callback = function()
        N("Rejoin", "Rejoining...")
        task.wait(1.5)
        Rejoin:Execute()
    end
})
ServerTPGroup:Button({
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
local InstantPromptsGroup = AutoTab:Group({ Title = "Proximity Prompts", Icon = "sparkles" })

instantPromptsToggle = InstantPromptsGroup:Toggle({
    Title    = "Instant Prompts",
    Value    = false,
    Tooltip  = "Auto-complete all ProximityPrompts instantly",
    Callback = function(v)
        if v then InstantPrompts:Enable() else InstantPrompts:Disable() end
        N("Instant Prompts", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("InstantPrompts", instantPromptsToggle)

local AutoClickerGroup = AutoTab:Group({ Title = "Auto Clicker System", Icon = "zap" })

autoClickerToggle = AutoClickerGroup:Toggle({
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

cpsSlider = AutoClickerGroup:Slider({
    Title    = "Clicks Per Second (CPS)",
    Value    = { Min = 1, Max = 100, Default = 10 },
    Step     = 1,
    Tooltip  = "How many clicks per second (1-100)",
    Callback = function(v) AutoClicker:SetCPS(v) end
})
ConfigMgr:Register("AutoClickerCPS", cpsSlider)

clickTypeDrop = AutoClickerGroup:Dropdown({
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

holdDownToggle = AutoClickerGroup:Toggle({
    Title    = "Hold Mouse Down",
    Value    = false,
    Tooltip  = "Hold mouse button instead of clicking",
    Callback = function(v) 
        AutoClicker:SetHoldDown(v)
        N("Auto Clicker", v and "Hold mode" or "Click mode")
    end
})
ConfigMgr:Register("AutoClickerHold", holdDownToggle)

randomDelayToggle = AutoClickerGroup:Toggle({
    Title    = "Random Delay",
    Value    = true,
    Tooltip  = "Randomize click timing to avoid detection",
    Callback = function(v) 
        AutoClicker:SetRandomDelay(v)
        N("Auto Clicker", v and "Randomized timing" or "Fixed timing")
    end
})
ConfigMgr:Register("AutoClickerRandom", randomDelayToggle)

AutoClickerGroup:Keybind({
    Title    = "Auto Clicker Keybind",
    Value    = "C",
    Tooltip  = "Press to toggle auto clicker on/off",
    Callback = function(k)
        autoClickerKey = Enum.KeyCode[k] or Enum.KeyCode.C
        N("AutoClicker Keybind", k)
    end
})

-- Populate Favorites Quick Access Tab (default pinned items)
local PinnedGroup = FavTab:Group({ Title = "Essential Shortcuts", Icon = "star" })

PinnedGroup:Toggle({
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

PinnedGroup:Toggle({
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

PinnedGroup:Toggle({
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

PinnedGroup:Toggle({
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

PinnedGroup:Toggle({
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

PinnedGroup:Toggle({
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
local CustomStarredGroup = FavTab:Group({ Title = "Your Starred Features", Icon = "bookmark" })
local defaults = { Fly=true, SpeedHack=true, ESP=true, SuperAntiLag=true, Noclip=true, AutoClicker=true }

local function isGameFlag(flagKey)
    local s = tostring(flagKey)
    return s:match("^VD_") or s:match("^RAP_") or s:match("^GAG_") or s:match("^SNA_") or s:match("^SAE_") or s:match("^FAM_")
end

Library._favCb = function(flagKey, isStarred, info)
    if isStarred then
        -- Only create in CustomStarredGroup if not a default pinned item, not already created, and not a game flag
        if not defaults[flagKey] and not _favDynamicToggles[flagKey] and not isGameFlag(flagKey) then
            pcall(function()
                local toggle = CustomStarredGroup:Toggle({
                    Title      = (info and info.Title) or flagKey,
                    Flag       = (info and info.Flag) or flagKey,
                    Icon       = (info and info.Icon) or "star",
                    _isStarred = true,
                    Value      = false,
                    Tooltip    = (info and info.Tooltip) or ("Quick toggle for " .. tostring(info and info.Title or flagKey)),
                    Callback   = info and info.Callback,
                })
                _favDynamicToggles[flagKey] = toggle
            end)
        end
    else
        -- Remove the dynamic toggle if present
        if _favDynamicToggles[flagKey] then
            pcall(function()
                local toggle = _favDynamicToggles[flagKey]
                if toggle and toggle.Frame then
                    toggle.Frame:Destroy()
                end
                _favDynamicToggles[flagKey] = nil
            end)
        end
    end

    -- Save scoped favorites
    pcall(function()
        if Library.SaveFavorites then
            Library:SaveFavorites()
        end
    end)
end

-- Recreate any previously saved custom starred features on boot
pcall(function()
    for flagKey, _ in pairs(Library._fav) do
        if isGameFlag(flagKey) then
            -- Purge foreign game flags from universal favorites
            Library._fav[flagKey] = nil
        elseif not defaults[flagKey] and not _favDynamicToggles[flagKey] then
            local reg = Library.Registry and Library.Registry[flagKey]
            -- Only show if this component actually exists in the current UI registry
            if reg and reg._elements and #reg._elements > 0 then
                local el = reg._elements[1]
                local title = el.Name or flagKey
                local icon = el.Icon or "star"
                local cb = el.Callback
                pcall(function()
                    local toggle = CustomStarredGroup:Toggle({
                        Title      = title,
                        Flag       = flagKey,
                        Icon       = icon,
                        _isStarred = true,
                        Value      = (reg.Get and reg.Get()) or false,
                        Tooltip    = "Quick toggle for " .. tostring(title),
                        Callback   = cb,
                    })
                    _favDynamicToggles[flagKey] = toggle
                end)
            else
                -- Not registered in this mode, purge so it doesn't linger
                Library._fav[flagKey] = nil
            end
        end
    end
    if Library.SaveFavorites then Library:SaveFavorites() end
end)



-- ══════════════════════════════════════════════════════════════════════════════
-- SETTINGS TAB
-- ══════════════════════════════════════════════════════════════════════════════
local InterfaceGroup = SetTab:Group({ Title = "Interface & Appearance", Icon = "palette" })

InterfaceGroup:Keybind({
    Title    = "Toggle UI Key",
    Value    = "U",
    Tooltip  = "Key to show/hide the Leon X interface",
    Callback = function(k)
        Window:SetToggleKey(Enum.KeyCode[k])
        N("Toggle Key", k)
    end
})
themeDrop = InterfaceGroup:Dropdown({
    Title    = "Theme",
    Values   = {"Default","Tangerine","Volt","Monochrome","Crimson","Cyan","Emerald","Frost","Gold","Rose","Violet"},
    Value    = "Default",
    Tooltip  = "Change the UI color theme",
    Callback = function(v)
        Window:SetTheme(v)
        N("Theme", v)
    end
})
ConfigMgr:Register("Theme", themeDrop)

local WebhookGroup = SetTab:Group({ Title = "Discord Webhook Logger", Icon = "bell" })
webhookUrlInput = WebhookGroup:Input({
    Title       = "Webhook URL",
    Placeholder = "https://discord.com/api/webhooks/...",
    Value       = "",
    Tooltip     = "Discord webhook URL for remote event logs",
    Callback    = function(v) WebhookLogger:SetUrl(v) end
})
ConfigMgr:Register("WebhookUrl", webhookUrlInput)

WebhookGroup:Button({
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

local ConfigGroup = SetTab:Group({ Title = "Configuration Manager", Icon = "sliders" })

autoSaveToggle = ConfigGroup:Toggle({
    Title    = "Auto Save Config",
    Value    = true,
    Tooltip  = "Automatically save settings when they change",
    Callback = function(v)
        ConfigMgr:SetAutoSave(v)
        N("Auto Save", v and "Enabled" or "Disabled")
    end
})
ConfigMgr:Register("AutoSaveConfig", autoSaveToggle)

autoSaveIntervalSlider = ConfigGroup:Slider({
    Title    = "Auto Save Interval (s)",
    Value    = { Min = 1, Max = 30, Default = 2 },
    Step     = 1,
    Tooltip  = "How often to check for changes and save (seconds)",
    Callback = function(v) ConfigMgr:SetAutoSaveInterval(v) end
})
ConfigMgr:Register("AutoSaveInterval", autoSaveIntervalSlider)

cfgNameIn = ConfigGroup:Input({
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
cfgDrop = ConfigGroup:Dropdown({
    Title    = "Select Config",
    Values   = getCfgList(),
    Value    = 1,
    Tooltip  = "Choose a saved config to load or manage",
    Callback = function(v) selectedConfig = v end
})
do local list = getCfgList(); selectedConfig = list[1] end

ConfigGroup:Button({
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
ConfigGroup:Button({
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
ConfigGroup:Button({
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
ConfigGroup:Button({
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

local ShareGroup = SetTab:Group({ Title = "Config Code (Base64)", Icon = "share-2" })

shareCodeInput = ShareGroup:Input({
    Title       = "Share Code",
    Placeholder = "Paste LX1-... code here",
    Value       = "",
    Tooltip     = "Base64 config code for sharing settings",
    Callback    = function() end
})

ShareGroup:Button({
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

ShareGroup:Button({
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

local SystemGroup = SetTab:Group({ Title = "System & Cache", Icon = "cpu" })
SystemGroup:Button({
    Title    = "Clear Encrypted Cache",
    Icon     = "refresh-cw",
    Tooltip  = "Purge local decrypted/encrypted module cache and re-download fresh code on next execute",
    Callback = function()
        clearLocalCache()
        N("Cache", "Cache cleared! Next execution will fetch fresh modules.")
    end
})

SystemGroup:Paragraph({
    Title   = "Leon X Pro",
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
-- PANIC KEY SETTINGS (Handler registered globally above)
-- ════════════════════════════════════════════════════════════════════════════

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
        if flingToggle and flingToggle.Value == true and not Fling.Enabled then Fling:Enable() end
        pcall(function() Fling:SetPower(flingPowerSlider.Value or 50000) end)
        pcall(function() Fling:SetMode(flingModeDrop.Value or "AngularVelocity") end)
        pcall(function() Fling:SetTeamCheck(flingTeamToggle.Value or false) end)
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
        tw(SplashBarFill, 0.2, {Size = UDim2.new(1, 0, 1, 0)}, Enum.EasingStyle.Quad)
        SplashPct.Text = "100%"
        SplashStatus.Text = "Ready • Launching Leon X"
        updateSplashNodes(1)
    end)
    task.wait(0.25)
    pcall(function()
        tw(SplashCard, 0.3, {
            BackgroundTransparency = 1,
            Size = UDim2.new(0, 400, 0, 224)
        }, Enum.EasingStyle.Quart)
        for _, child in ipairs(SplashCard:GetDescendants()) do
            pcall(function()
                if child:IsA("TextLabel") then
                    TweenService:Create(child, TweenInfo.new(0.22, Enum.EasingStyle.Quad), {TextTransparency = 1}):Play()
                elseif child:IsA("ImageLabel") then
                    TweenService:Create(child, TweenInfo.new(0.22, Enum.EasingStyle.Quad), {ImageTransparency = 1}):Play()
                elseif child:IsA("Frame") then
                    TweenService:Create(child, TweenInfo.new(0.22, Enum.EasingStyle.Quad), {BackgroundTransparency = 1}):Play()
                elseif child:IsA("UIStroke") then
                    TweenService:Create(child, TweenInfo.new(0.22, Enum.EasingStyle.Quad), {Transparency = 1}):Play()
                end
            end)
        end
        tw(SplashBg, 0.3, {BackgroundTransparency = 1}, Enum.EasingStyle.Quad)
    end)
    task.wait(0.32)
    pcall(function()
        if SplashGui and SplashGui.Parent then SplashGui:Destroy() end
    end)
    splashDestroyed = true
end)

-- Guaranteed fallback: force-destroy splash after 2s
task.delay(2, function()
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



