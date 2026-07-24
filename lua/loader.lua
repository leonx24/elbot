local userKey = _G.Key

print("[Leon X Loader] Memulai verifikasi...")

if not userKey or userKey == "" then
    warn("[Leon X Loader] Error: Key tidak ditemukan di _G.Key!")
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

-- Memanggil file load.php di website dengan cache busting
local webUrl = string.format(
    "https://api.leonthings.my.id/load.php?key=%s&roblox_id=%s&hwid=%s&username=%s&executor=%s&place_id=%s&t=%s",
    HttpService:UrlEncode(userKey), 
    HttpService:UrlEncode(robloxId), 
    HttpService:UrlEncode(hwid),
    HttpService:UrlEncode(localPlayer.Name),
    HttpService:UrlEncode(executor),
    HttpService:UrlEncode(tostring(game.PlaceId)),
    tostring(os.time())
)

print("[Leon X Loader] Mengirim permintaan verifikasi ke server...")

-- Melakukan HTTP Request ke website
local success, response = pcall(function()
    return game:HttpGet(webUrl)
end)

if not success then
    warn("[Leon X Loader] Error: Gagal terhubung ke server! Detail: " .. tostring(response))
    localPlayer:Kick("Gagal terhubung ke server verifikasi LeonThings!")
    return
end

if not response or response == "" then
    warn("[Leon X Loader] Error: Response dari server kosong (empty body).")
    return
end

print(string.format("[Leon X Loader] Server merespon (%d bytes). Memuat script...", #response))

-- Menjalankan script utama yang dikirimkan oleh website jika verifikasi lolos
local func, compileErr = loadstring(response)
if not func then
    warn("[Leon X Loader] Error Syntax/Compilation: Response bukan Lua script valid!")
    warn("Detail Error: " .. tostring(compileErr))
    warn("Isi Response (200 char pertama): " .. tostring(response:sub(1, 200)))
    return
end

local loadSuccess, loadErr = pcall(func)
if not loadSuccess then
    warn("[Leon X Loader] Error Runtime saat menjalankan script utama: " .. tostring(loadErr))
end

