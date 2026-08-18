--[[
    Leon X | Official Universal Loader with Key System
    Protected Gateway: https://leonx.affavanleon.workers.dev
]]

local CoreGui = game:GetService("CoreGui")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local HttpService = game:GetService("HttpService")
local lp = game:GetService("Players").LocalPlayer

local GATEWAY_URL = "https://leonx.affavanleon.workers.dev"
local KEY_FILE = "Leon X/license.key"

local function ensureDir()
    if not isfolder("Leon X") then makefolder("Leon X") end
end

local function getSavedKey()
    if isfile and isfile(KEY_FILE) then
        local ok, content = pcall(readfile, KEY_FILE)
        if ok and content then return content:gsub("%s+", "") end
    end
    return ""
end

local function saveKey(k)
    pcall(function()
        ensureDir()
        writefile(KEY_FILE, k:gsub("%s+", ""))
    end)
end

local function getHWID()
    local id = ""
    pcall(function()
        if gethwid then id = gethwid()
        elseif identifyexecutor then id = identifyexecutor() .. "_" .. tostring(lp.UserId)
        else id = tostring(lp.UserId) end
    end)
    return id ~= "" and id or tostring(lp.UserId)
end

local function checkKeyOnline(key, rId, hwid)
    local urls = {
        "https://elbot-production.up.railway.app/api/validate-key?key=" .. HttpService:UrlEncode(key) .. "&roblox_id=" .. rId .. "&hwid=" .. HttpService:UrlEncode(hwid) .. "&t=" .. tostring(os.time()),
        GATEWAY_URL .. "/check?k=" .. HttpService:UrlEncode(key) .. "&roblox_id=" .. rId .. "&hwid=" .. HttpService:UrlEncode(hwid) .. "&t=" .. tostring(os.time())
    }
    for _, u in ipairs(urls) do
        local ok, res = pcall(function() return game:HttpGet(u, true) end)
        if ok and res then
            local data = nil
            pcall(function() data = HttpService:JSONDecode(res) end)
            if data and data.valid == true then
                return true, data.message or "Key Valid"
            end
        end
    end
    return false, "Invalid or Expired License Key."
end

local function verifyAndLoad(key, onFail)
    if not key or key == "" then
        if onFail then onFail("Please enter a license key.") end
        return
    end

    local hwid = getHWID()
    local rId = tostring(lp and lp.UserId or 0)
    local isValid, msg = checkKeyOnline(key, rId, hwid)

    if isValid then
        saveKey(key)
        getgenv().LeonX_BaseUrl = GATEWAY_URL .. "/"
        getgenv().LeonX_AuthKey = "LEONX-OWNER-BYPASS-998"

        local scriptUrl = GATEWAY_URL .. "/main.lua?k=" .. getgenv().LeonX_AuthKey .. "&t=" .. tostring(os.time())
        local loadOk, scriptCode = pcall(function()
            return game:HttpGet(scriptUrl, true)
        end)

        if loadOk and scriptCode and #scriptCode > 50 then
            local fn, err = loadstring(scriptCode)
            if fn then
                return fn()
            else
                if onFail then onFail("Compile error: " .. tostring(err)) end
            end
        else
            if onFail then onFail("Failed to load script payload.") end
        end
        return
    end

    if onFail then onFail(msg or "Invalid or Expired License Key.") end
end

-- ── Cek apakah key disediakan di _G.Key atau tersimpan di file ─────────────────
local activeKey = _G.Key or (getgenv and getgenv().Key) or (shared and shared.Key) or getSavedKey()
if activeKey and activeKey ~= "" then
    local hwid = getHWID()
    local rId = tostring(lp and lp.UserId or 0)
    local isValid, _ = checkKeyOnline(activeKey, rId, hwid)
    if isValid then
        saveKey(activeKey)
        getgenv().LeonX_BaseUrl = GATEWAY_URL .. "/"
        getgenv().LeonX_AuthKey = "LEONX-OWNER-BYPASS-998"
        local sUrl = GATEWAY_URL .. "/main.lua?k=" .. getgenv().LeonX_AuthKey .. "&t=" .. tostring(os.time())
        local fn = loadstring(game:HttpGet(sUrl, true))
        if fn then return fn() end
    end
end

-- ── Tampilkan UI Key Prompt jika belum ada key valid ─────────────────────────
local sg = Instance.new("ScreenGui")
sg.Name = "LeonX_KeySystem"
sg.ResetOnSpawn = false
sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
sg.DisplayOrder = 100000

pcall(function()
    if syn and syn.protect_gui then syn.protect_gui(sg) end
    sg.Parent = (gethui and gethui()) or CoreGui or lp:WaitForChild("PlayerGui")
end)

local main = Instance.new("Frame", sg)
main.Size = UDim2.fromOffset(360, 220)
main.Position = UDim2.fromScale(0.5, 0.5)
main.AnchorPoint = Vector2.new(0.5, 0.5)
main.BackgroundColor3 = Color3.fromRGB(12, 12, 18)
main.BorderSizePixel = 0
Instance.new("UICorner", main).CornerRadius = UDim.new(0, 14)

local stroke = Instance.new("UIStroke", main)
stroke.Color = Color3.fromRGB(100, 80, 255)
stroke.Thickness = 1.5

local title = Instance.new("TextLabel", main)
title.Size = UDim2.new(1, -30, 0, 30)
title.Position = UDim2.fromOffset(15, 16)
title.BackgroundTransparency = 1
title.Text = "Leon X — License Verification"
title.Font = Enum.Font.GothamBold
title.TextSize = 15
title.TextColor3 = Color3.fromRGB(240, 240, 255)
title.TextXAlignment = Enum.TextXAlignment.Left

local sub = Instance.new("TextLabel", main)
sub.Size = UDim2.new(1, -30, 0, 18)
sub.Position = UDim2.fromOffset(15, 42)
sub.BackgroundTransparency = 1
sub.Text = "Enter your license key to unlock the hub."
sub.Font = Enum.Font.GothamMedium
sub.TextSize = 11
sub.TextColor3 = Color3.fromRGB(140, 140, 165)
sub.TextXAlignment = Enum.TextXAlignment.Left

local boxFrame = Instance.new("Frame", main)
boxFrame.Size = UDim2.new(1, -30, 0, 42)
boxFrame.Position = UDim2.fromOffset(15, 72)
boxFrame.BackgroundColor3 = Color3.fromRGB(18, 18, 28)
boxFrame.BorderSizePixel = 0
Instance.new("UICorner", boxFrame).CornerRadius = UDim.new(0, 8)
local bStroke = Instance.new("UIStroke", boxFrame)
bStroke.Color = Color3.fromRGB(40, 40, 60)
bStroke.Thickness = 1

local input = Instance.new("TextBox", boxFrame)
input.Size = UDim2.new(1, -20, 1, 0)
input.Position = UDim2.fromOffset(10, 0)
input.BackgroundTransparency = 1
input.PlaceholderText = "e.g. LEONX-VIP-MASTER-999"
input.PlaceholderColor3 = Color3.fromRGB(90, 90, 120)
input.Text = ""
input.Font = Enum.Font.GothamBold
input.TextSize = 12
input.TextColor3 = Color3.fromRGB(255, 255, 255)
input.ClearTextOnFocus = false

local statusLbl = Instance.new("TextLabel", main)
statusLbl.Size = UDim2.new(1, -30, 0, 16)
statusLbl.Position = UDim2.fromOffset(15, 120)
statusLbl.BackgroundTransparency = 1
statusLbl.Text = ""
statusLbl.Font = Enum.Font.GothamMedium
statusLbl.TextSize = 11
statusLbl.TextColor3 = Color3.fromRGB(255, 90, 90)

local submitBtn = Instance.new("TextButton", main)
submitBtn.Size = UDim2.new(1, -30, 0, 40)
submitBtn.Position = UDim2.fromOffset(15, 148)
submitBtn.BackgroundColor3 = Color3.fromRGB(90, 70, 240)
submitBtn.BorderSizePixel = 0
submitBtn.Text = "Unlock Leon X"
submitBtn.Font = Enum.Font.GothamBold
submitBtn.TextSize = 13
submitBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
submitBtn.AutoButtonColor = false
Instance.new("UICorner", submitBtn).CornerRadius = UDim.new(0, 8)

submitBtn.MouseButton1Click:Connect(function()
    local k = input.Text:gsub("%s+", "")
    if k == "" then
        statusLbl.Text = "Please enter your key."
        return
    end

    submitBtn.Text = "Verifying..."
    statusLbl.TextColor3 = Color3.fromRGB(200, 200, 100)
    statusLbl.Text = "Checking key with server..."

    task.spawn(function()
        local success = false
        verifyAndLoad(k, function(err)
            submitBtn.Text = "Unlock Leon X"
            statusLbl.TextColor3 = Color3.fromRGB(255, 90, 90)
            statusLbl.Text = err or "Verification failed."
        end)
        
        -- If success, verifyAndLoad executed main.lua; destroy key UI
        task.wait(0.5)
        if getgenv().LeonX_AuthKey == k then
            if sg and sg.Parent then
                sg:Destroy()
            end
        end
    end)
end)
