local userKey = _G.Key

if not userKey or userKey == "" then
    game:GetService("Players").LocalPlayer:Kick("Key tidak ditemukan! Silakan dapatkan key via /script di Discord.")
    return
end

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local localPlayer = Players.LocalPlayer
local robloxId = tostring(localPlayer.UserId)

-- Mendapatkan Hardware ID perangkat (HWID)
local hwid = "unknown"
if gethwid then
    hwid = gethwid()
elseif ext and ext.gethwid then
    hwid = ext.gethwid()
end

-- Mendapatkan nama executor
local executor = "Unknown"
if identifyexecutor then
    executor = identifyexecutor()
elseif checkclosure then
    executor = "Solara/Celery"
end

-- Memanggil file load.php di website Anda
local webUrl = string.format(
    "https://api.leonthings.my.id/load.php?key=%s&roblox_id=%s&hwid=%s&username=%s&executor=%s&place_id=%s",
    HttpService:UrlEncode(userKey), 
    HttpService:UrlEncode(robloxId), 
    HttpService:UrlEncode(hwid),
    HttpService:UrlEncode(localPlayer.Name),
    HttpService:UrlEncode(executor),
    HttpService:UrlEncode(tostring(game.PlaceId))
)

-- Melakukan HTTP Request ke website Anda
local success, response = pcall(function()
    return game:HttpGet(webUrl)
end)

if not success then
    localPlayer:Kick("Gagal terhubung ke server verifikasi LeonThings!")
    return
end

-- Menjalankan script utama yang dikirimkan oleh website jika verifikasi lolos
local loadSuccess, loadErr = pcall(function()
    loadstring(response)()
end)

if not loadSuccess then
    warn("Gagal memuat script utama: " .. tostring(loadErr))
end
