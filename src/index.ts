import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  Message,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { buildV2Container, buildMultiV2Containers } from "./components-v2.js";
import { buildSupportedGamesV2 } from "./supported-games.js";
import { buildLicensePanelV2, buildUserKeyEphemeral, buildKeyInfoEphemeral } from "./license-panel.js";
import { handleSecurityCheck, recordFailedKeyAttempt, getClientIp } from "./security.js";
import { config } from "./config.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  trackCommand,
  addToBlacklist,
  removeFromBlacklist,
  isBlacklisted,
  getBlacklistList,
  getOrCreateUserKey,
  forceGenerateUserKey,
  validateUserKey,
  resetUserKeyBinding,
  banIp,
  unbanIp,
  isIpBanned,
  getBannedIps,
  getUserKeyInfo
} from "./database.js";
import {
  createTicketPanel,
  createTicketChannel,
  closeTicket,
  createRatingButtons,
  getTicketStats,
  TICKET_CATEGORIES,
  type TicketCategory
} from "./ticket-system.js";
import {
  renderVerifyCard,
  renderStatusCard,
  renderKeyInfoCard,
  renderFaqCard,
  renderWebsiteCard,
  renderRobloxProfileCard,
  renderGameMonitorCard,
  renderGameServersCard,
  renderGameUpdateAlertCard,
  renderMonitorListCard,
  renderTicketPanelCard,
  renderTicketWelcomeCard,
  renderTicketCloseCard,
  renderTicketRatingCard,
  renderRatingThanksCard,
  renderTicketStatsCard,
  renderAdminStatsCard,
  renderBlacklistCard,
  renderLookupCard,
  renderBugReportCard,
  renderChangelogCard,
  renderAutoModCard,
  renderExecutionLogCard,
  renderRatingLogCard,
  renderAutoBanCard,
  renderWelcomeCard,
  renderGoodbyeCard,
  renderRulesCard,
  renderAiResponseCard,
  renderClaimCard,
} from "./canvas-cards.js";

/** Helper: wrap a canvas card Buffer into an EmbedBuilder + AttachmentBuilder pair */
function cardEmbed(buffer: Buffer, color?: number, filename = "card.png") {
  const attachment = new AttachmentBuilder(buffer, { name: filename });
  const embed = new EmbedBuilder().setImage(`attachment://${filename}`);
  return { embed, attachment };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const cooldowns = new Map<string, number>();
const ticketDeleteTimers = new Map<string, NodeJS.Timeout>();
const ownerOnlyCommands = new Set(["warn", "timeout", "kick", "ban", "stats", "setstatus", "setvoicechannel", "blacklist", "monitor", "send-rules", "generatekey", "lookup"]);

function isUserOwnerOrAdmin(userId: string, member?: GuildMember | null): boolean {
  if (userId === config.OWNER_ID) return true;
  if (!member) return false;
  const ownerRoleId = config.OWNER_ROLE_ID || "1515320851656872066";
  if (member.roles.cache.has(ownerRoleId) || member.roles.cache.has("1515320851656872066")) return true;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return member.roles.cache.some(r => {
    const name = r.name.toLowerCase();
    return name.includes("owner") || name.includes("developer") || name.includes("founder") || name.includes("admin") || name.includes("co-owner") || name.includes("staff");
  });
}

function isStaff(member?: GuildMember | null): boolean {
  if (!member) return false;
  return isUserOwnerOrAdmin(member.id, member);
}
const faq: Record<string, string> = {
  script: "Gunakan `/script nama:LeonX Hub Loader`. Bot akan mengirimkannya lewat DM.",
  error: "Cek `/status`, pastikan versinya terbaru, lalu kirim `/bug-report` bila masih error.",
  ticket: "Gunakan `/ticket`, kemudian tekan tombol **Buka Ticket**.",
  website: "Silakan kunjungi website kami di https://leonthings.my.id. Untuk mengelola key dan reset HWID, silakan buka halaman console bot di https://script.leonthings.my.id."
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "qwen/qwen3.6-27b"
];
const GROQ_MAX_RETRIES = 3;
const GROQ_TIMEOUT_MS = 25_000;

async function callGroqAPI(messages: Array<{ role: string; content: string }>): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  for (const model of GROQ_MODELS) {
    for (let attempt = 1; attempt <= GROQ_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 2048,
            temperature: 0.7
          }),
          signal: AbortSignal.timeout(GROQ_TIMEOUT_MS)
        });

        if (response.ok) {
          const data = await response.json() as any;
          let text = data.choices?.[0]?.message?.content || "";
          // Bersihkan tag <think> jika model menggunakan reasoning chain
          text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          if (text) {
            return { ok: true, text };
          }
        }

        // Jika model tidak ditemukan (404), langsung beralih ke model berikutnya
        if (response.status === 404) {
          console.warn(`[Groq] Model ${model} not found (404), trying next model...`);
          break;
        }

        // Retry on 503 (overloaded) or 429 (rate limit)
        if ((response.status === 503 || response.status === 429) && attempt < GROQ_MAX_RETRIES) {
          const backoffMs = Math.min(
            30000,
            Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000)
          );
          console.warn(`[Groq] ${response.status} on ${model} attempt ${attempt}/${GROQ_MAX_RETRIES}, retrying in ${backoffMs}ms...`);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        const errText = await response.text().catch(() => "(unreadable)");
        console.error(`[Groq] API error ${response.status} on model ${model}:`, errText);
        break; // Coba model berikutnya jika error lain
      } catch (err: any) {
        const isTimeout = err?.name === "TimeoutError" || err?.code === "UND_ERR_HEADERS_TIMEOUT" || err?.cause?.code === "UND_ERR_HEADERS_TIMEOUT";
        if (isTimeout && attempt < GROQ_MAX_RETRIES) {
          const backoffMs = Math.min(
            30000,
            Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000)
          );
          console.warn(`[Groq] Timeout on attempt ${attempt}/${GROQ_MAX_RETRIES}, retrying in ${backoffMs}ms...`);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        console.error(`[Groq] Fetch failed for ${model} (attempt ${attempt}):`, err);
        break;
      }
    }
  }
  return { ok: false, error: "all_models_failed" };
}

function buildAiSystemPrompt(userText?: string): string {
  const isEng = userText ? isEnglishText(userText) : false;

  const langDirective = isEng
    ? `
═══════════════════════════════════════════════════════════════════════════════
🔴 CRITICAL LANGUAGE REQUIREMENT: ENGLISH DETECTED 🔴
═══════════════════════════════════════════════════════════════════════════════
• User's input: "${userText?.replace(/"/g, "'") || ""}"
• YOU MUST RESPOND EXCLUSIVELY AND 100% IN CASUAL, FRIENDLY, NATURAL ENGLISH.
• DO NOT use any Indonesian words (e.g. no "Halo", "Waduh", "dong", "ya", "gue", "lo", "kamu", "bisa").
• Tone/Style: Friendly, knowledgeable, casual Discord admin / server buddy.
`
    : `
═══════════════════════════════════════════════════════════════════════════════
🟢 CRITICAL LANGUAGE REQUIREMENT: INDONESIAN DETECTED 🟢
═══════════════════════════════════════════════════════════════════════════════
• User's input is in Indonesian (or default).
• RESPOND IN CASUAL, FRIENDLY, NATURAL INDONESIAN.
• Tone/Style: Admin/mod server yang santai dan helpful.
`;

  return `You are the official AI assistant & server buddy of LeonX Hub Discord Server (a premium Roblox Script Hub).

${langDirective}

═══════════════════════════════════════════════════════════════════════════════
SECTION 1: IDENTITY & LANGUAGE RULES
═══════════════════════════════════════════════════════════════════════════════

[LANGUAGE STRICTNESS - STAGE 1 RULE]
→ ALWAYS match the language indicated in the CRITICAL LANGUAGE REQUIREMENT banner above.
→ If English → 100% English response.
→ If Indonesian → 100% Indonesian response.

[TONE RULES - MANDATORY]
✅ DO: Be direct, helpful, slightly playful.
✅ DO: Use minimal formatting (bold ONLY for commands/keys/highlights).
✅ DO: Keep responses concise — max 3-4 paragraphs unless explaining complex stuff.

❌ FORBIDDEN (AI clichés - NEVER use these):
   • "Halo! Saya LeonX AI Assistant..." / "Hello! I am LeonX AI..."
   • "Tentu, saya akan membantu Anda..." / "Sure, I can help you..."
   • "Berikut adalah penjelasan mengenai..." / "Here is the explanation..."
   • "Semoga informasi ini bermanfaat!" / "Hope this helps!"
   • Any robotic opening/closing statements.

[FORMATTING EXAMPLES]
❌ BAD: **Oh yeah** don't forget! *Very important*! ## Remember!
✅ GOOD (EN): Oh by the way, don't forget! That's super important!
✅ GOOD (EN): Use the **/script** command to get your key.
✅ GOOD (ID): Oh iya, jangan lupa ya! Penting banget loh!
✅ GOOD (ID): Pake command **/script** buat dapetin key nya.

═══════════════════════════════════════════════════════════════════════════════
SECTION 2: KNOWLEDGE BASE (COMMANDS & INFO)
═══════════════════════════════════════════════════════════════════════════════

[ABOUT LEONX HUB & DISCORD SERVER]
• LeonX Hub is a top-tier Roblox Script Hub offering high quality scripts & loaders.
• Features include multi-game support, instant key delivery via Discord, HWID management, and active support.
• Official Website: https://leonthings.my.id
• Web Console / Dashboard: https://script.leonthings.my.id (used for managing keys & resetting HWID).

[DISCORD COMMANDS]
| Command        | Description                                              |
|----------------|----------------------------------------------------------|
| /verify        | Verify Discord account & get member role                  |
| /script        | Get free license key + script loader via DM               |
| /resethwid     | Reset HWID/Roblox ID binding (10 min cooldown)           |
| /status        | Check script & bot operational status                    |
| /faq           | General FAQ information                                   |
| /bug-report    | Report bugs/errors to developers                          |
| /ticket        | Create support ticket for issues                          |

[COMMON PROBLEMS & SOLUTIONS]

Problem 1: Script tidak jalan / Script not working
→ Solution (ID): Pastikan baris pertama script: _G.Key = "LICENSE_KEY_ANDA"
→ Solution (EN): Make sure the first line of your script is: _G.Key = "YOUR_LICENSE_KEY"
→ Make sure executor supports loadstring & is updated.

Problem 2: HWID Error / Key bound to other device
→ Solution (ID): Gunakan /resethwid di Discord ATAU lewat website console (My Key → Reset HWID)
→ Solution (EN): Use /resethwid in Discord OR web console (My Key → Reset HWID)
→ Limit: 1 reset per 10 minutes.

═══════════════════════════════════════════════════════════════════════════════
SECTION 3: SCOPE & BOUNDARIES
═══════════════════════════════════════════════════════════════════════════════

[ALLOWED TOPICS] ✓
• LeonX Hub (features, commands, status, server details)
• Roblox (general, scripting, Lua)
• Roblox Executors
• LeonX Hub Discord Server

[OUT OF SCOPE] ✗
• General coding (Python, JS, etc.) unless related to Roblox Lua
• Other games (Minecraft, Valorant, etc.)
• Off-topic chat (politics, drama, unrelated stuff)

[OUT OF SCOPE RESPONSE TEMPLATES]
Indonesian: "Waduh itu di luar kuasa aku 😅 Aku cuma bisa bantu soal LeonX Hub & Roblox scripting. Mau tanya soal script atau command Discord?"
English: "That's outside my area of expertise 😅 I can only help with LeonX Hub & Roblox scripting. Wanna ask about scripts or Discord commands?"

[EDGE CASE HANDLING]
• User spamming/toxic → Respond coldly & briefly, don't feed trolls
• User unclear/confused → Ask clarification before answering
• User mixed language → Follow dominant language matching the language directive

═══════════════════════════════════════════════════════════════════════════════
SECTION 4: ACTION TRIGGERS (READ CAREFULLY)
═══════════════════════════════════════════════════════════════════════════════

⚠️ ACTION TAGS must be placed at THE VERY END of response.
⚠️ Only trigger when user EXPLICITLY REQUESTS EXECUTION (not just asking questions).

┌─────────────────┬──────────────────────────────┬───────────────────────┐
│ TRIGGER FOR     │ KEYWORD PATTERNS             │ ACTION TAG TO APPEND  │
├─────────────────┼──────────────────────────────┼───────────────────────┤
│ Send script/key │ "minta key", "kirim script",  │ [ACTION: SEND_SCRIPT] │
│ to user's DM    │ "get key", "give me key",     │                       │
│                 │ "send script", "i need key",  │                       │
│                 │ "mana script", "mau script"   │                       │
├─────────────────┼──────────────────────────────┼───────────────────────┤
│ Reset HWID      │ "reset hwid", "reset my hwid",│ [ACTION: RESET_HWID]  │
│                 │ "resethwid dong",             │                       │
│                 │ "reset my device",            │                       │
│                 │ "hwid ku error"               │                       │
├─────────────────┼──────────────────────────────┼───────────────────────┤
│ Check user key  │ "cek keyku", "check my key",  │ [ACTION: CHECK_MY_KEY]│
│ status          │ "key saya masih aktif?",      │                       │
│                 │ "is my key valid?"            │                       │
├─────────────────┼──────────────────────────────┼───────────────────────┤
│ Get stats/info  │ "stats", "berapa user",       │ [ACTION: GET_STATS]   │
│                 │ "how many members"            │                       │
└─────────────────┴──────────────────────────────┴───────────────────────┘

[WHEN NOT TO TRIGGER - IMPORTANT!]
These questions do NOT trigger action tags (just answer normally):
• "Apa itu key?" / "What is a key?" → Explain concept only
• "Gimana cara reset hwid?" / "How to reset hwid?" → Explain steps only
• "Script loader support mobile gak?" / "Does loader support mobile?" → Info question
• "Tell me abt this server" → Server info question (answer in English with server overview!)

[RESPONSE EXAMPLES WITH ACTIONS]

Example 1 (ID) - TRIGGER Send Script:
User: "Minta key dong"
Bot: "Siap, gue kirim key + loader script ke DM lo sekarang! Cek DM ya 👀 [ACTION: SEND_SCRIPT]"

Example 1 (EN) - TRIGGER Send Script:
User: "Give me the key please"
Bot: "Sure thing! Sending your key + loader script straight to your DMs right now! Check your DMs 👀 [ACTION: SEND_SCRIPT]"

Example 2 (ID) - NO TRIGGER:
User: "Gimana cara pake keynya?"
Bot: "Gampang! Taruh _G.Key = "KEY_LO" di baris pertama sebelum loadstring. Executor lo harus support loadstring ya."

Example 2 (EN) - NO TRIGGER (e.g. Tell me abt this server):
User: "tell me abt this server"
Bot: "Welcome to LeonX Hub! We're an official community for LeonX Hub, a premium Roblox Script Hub. Here you can get free license keys via **/script**, verify your account using **/verify**, reset your HWID with **/resethwid**, and get support from our staff. Feel free to ask if you need any help with scripts or bot commands!"

═══════════════════════════════════════════════════════════════════════════════
SECTION 5: RESPONSE QUALITY CHECKLIST (INTERNAL)
═══════════════════════════════════════════════════════════════════════════════

Before sending ANY response, verify:
□ Output language MATCHES the user's language directive (EN if English input, ID if Indonesian input)
□ No AI cliché opening/closing used
□ Formatting is minimal (bold for commands/highlights only)
□ Answer is direct and engaging
□ If action needed → tag placed at VERY END
□ If info-only question (like "tell me abt this server") → answer naturally in the detected language without action tags`;
}

function hasExplicitScriptRequest(userText: string): boolean {
  const text = userText.toLowerCase().trim();

  const isQuestion = 
    text.startsWith("apa") || 
    text.startsWith("kenapa") || 
    text.startsWith("mengapa") || 
    text.startsWith("apakah") || 
    text.startsWith("bagaimana") || 
    text.startsWith("what") ||
    text.startsWith("why") ||
    text.startsWith("how") ||
    text.startsWith("is ") ||
    text.startsWith("can ") ||
    text.includes("gimana cara") || 
    text.includes("bagaimana cara") || 
    text.includes("how to") ||
    text.includes("cara dapat") || 
    text.includes("cara dapet") ||
    text.includes("cara ambil") ||
    text.includes("cara buat") ||
    text.includes("apa itu") ||
    text.includes("what is");

  const directPhrases = [
    "get key", "get script", "send key", "send script", "minta key", "minta script",
    "give key", "give script", "give me key", "give me script", "send me key", "send me script",
    "i need key", "i need script", "i want key", "i want script", "need key", "need script",
    "kirim key", "kirim script", "ambil key", "ambil script", "dapatkan key", "dapatkan script",
    "bagi key", "bagi script", "mana key", "mana script", "minta scriptku", "minta keyku",
    "kirimkan key", "kirimkan script", "ambilkan key", "ambilkan script", "kirim keyku", "kirim scriptku",
    "ambil keyku", "ambil scriptku", "minta loader", "kirim loader", "get loader",
    "kasi key", "kasih key", "kasi script", "kasih script", "kasi gw key", "kasih saya key",
    "kasi aku key", "kasih aku key", "bagi key dong", "minta key dong", "kasi key ku", "kasih key ku",
    "susah dapet key", "susah dapat key", "susah dapatkan key", "susah dapet script", "gimana dapet key"
  ];

  const hasDirectPhrase = directPhrases.some(phrase => text.includes(phrase));

  if (isQuestion && !hasDirectPhrase) {
    return false;
  }

  if (hasDirectPhrase) {
    return true;
  }

  const actionRegex = /\b(minta|kirim|kirimkan|get|send|give|fetch|ambil|ambilkan|dapatkan|bagi|mana|kasi|kasih|beri|berikan)\b.*\b(script|key|loader|lisensi)\b/i;
  const reverseRegex = /\b(script|key|loader|lisensi)\b.*\b(minta|kirim|kirimkan|get|send|give|fetch|ambil|ambilkan|dapatkan|bagi|mana|kasi|kasih|beri|berikan)\b/i;

  return !isQuestion && (actionRegex.test(text) || reverseRegex.test(text));
}

function hasExplicitHwidResetRequest(userText: string): boolean {
  const text = userText.toLowerCase().trim();

  const isQuestion = 
    text.startsWith("apa") || 
    text.startsWith("kenapa") || 
    text.startsWith("mengapa") || 
    text.startsWith("apakah") || 
    text.startsWith("bagaimana") || 
    text.startsWith("what") ||
    text.startsWith("why") ||
    text.startsWith("how") ||
    text.includes("gimana cara") || 
    text.includes("bagaimana cara") || 
    text.includes("how to") ||
    text.includes("cara reset") || 
    text.includes("apa itu") ||
    text.includes("what is");

  const directPhrases = [
    "reset hwid", "resetkan hwid", "resethwid", "reset hwidku", "reset hwid ku",
    "clear hwid", "reset roblox id", "reset robloxid", "reset id ku", "reset idku",
    "tolong reset hwid", "minta reset hwid", "reset my hwid", "do reset hwid", "resetkan hwidku",
    "resethwid ku", "resethwid dong", "reset hwid dong", "please reset my hwid", "reset device",
    "reset my device", "clear my hwid", "clear hwid"
  ];

  const hasDirectPhrase = directPhrases.some(phrase => text.includes(phrase));

  if (isQuestion && !hasDirectPhrase) {
    return false;
  }

  if (hasDirectPhrase) {
    return true;
  }

  const resetRegex = /\b(reset|clear|hapus)\b.*\b(hwid|roblox\s*id|device|perangkat)\b/i;
  return !isQuestion && resetRegex.test(text);
}

function hasExplicitCheckKeyRequest(userText: string): boolean {
  const text = userText.toLowerCase().trim();
  const directPhrases = [
    "cek key", "cek status key", "status key", "check key", "check my key",
    "lihat key", "key saya", "key ku", "status lisensi", "show my key", "my key status"
  ];
  return directPhrases.some(phrase => text.includes(phrase));
}

function isEnglishText(userText: string): boolean {
  if (!userText || typeof userText !== "string") return false;
  const text = userText.toLowerCase().trim();
  if (!text) return false;

  // 1. Direct Indonesian markers
  const idMarkers = [
    "apa", "apakah", "bagaimana", "gimana", "kenapa", "mengapa", "kapan", "siapa", "dimana", "mana",
    "yang", "ini", "itu", "bisa", "gak", "ga", "nggak", "ndak", "tidak", "enggak", "ada", "mau",
    "ingin", "tolong", "bantu", "minta", "kasih", "kasi", "kirim", "dong", "ya", "yah", "dah",
    "udah", "sudah", "belum", "blm", "gue", "gua", "gw", "lu", "lo", "elu", "elo", "saya",
    "aku", "kami", "kita", "kamu", "dia", "mereka", "biar", "agar", "supaya", "kalo", "kalau",
    "jika", "tapi", "tetapi", "sama", "dengan", "buat", "untuk", "dari", "ke", "di", "bukan",
    "lagi", "masih", "cuma", "hanya", "saja", "aja", "tau", "tahu", "ngerti", "paham", "soal",
    "tentang", "mengenai", "bagaimanakah", "apakah", "kenapakah", "dapet", "dapat", "pake", "pakai"
  ];

  // 2. English phrase patterns
  const enPhrases = [
    /\b(tell|show|give|send|explain|ask)\s+(me|us|him|her)\b/i,
    /\b(what|how|why|where|who|when|which)\s+(is|are|am|do|does|did|can|could|would|should)\b/i,
    /\b(can|could|would|will)\s+(you|u|i|we)\b/i,
    /\b(i\s+want|i\s+need|i\s+have|i\s+am|i'm|i\s+got)\b/i,
    /\b(tell\s+me|about\s+this|abt\s+this|what\s+is|how\s+to|how\s+do|is\s+there|how\s+can|help\s+me)\b/i,
    /\b(is\s+this|is\s+it|does\s+it|does\s+this|how's|what's|who's|where's)\b/i,
    /\b(thanks|thank\s+you|thx|ty|pls|please|sorry)\b/i
  ];

  // 3. English words dictionary
  const enWords = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on",
    "with", "he", "as", "you", "u", "do", "at", "this", "but", "his", "by", "from", "they",
    "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there",
    "their", "what", "so", "up", "out", "if", "about", "abt", "who", "get", "which", "go",
    "me", "when", "make", "can", "like", "time", "no", "just", "him", "know", "take", "people",
    "into", "year", "your", "ur", "good", "some", "could", "them", "see", "other", "than",
    "then", "now", "look", "only", "come", "its", "over", "think", "also", "back", "after",
    "use", "two", "how", "our", "work", "first", "well", "way", "even", "new", "want",
    "because", "any", "these", "give", "day", "most", "us", "tell", "explain", "server",
    "discord", "script", "loader", "key", "resethwid", "hwid", "working", "error", "issue",
    "help", "please", "pls", "plz", "show", "check", "need", "wanna", "gonna", "idk", "thanks",
    "thank", "does", "is", "are", "am", "was", "were", "been", "being", "has", "had", "device",
    "reset", "status", "bot", "hub", "roblox", "info", "information", "details", "support",
    "ticket", "executor", "working", "run", "running", "execute", "executing", "bug", "report"
  ]);

  const cleanWords = text.replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);

  let idCount = 0;
  let enCount = 0;

  for (const w of cleanWords) {
    if (idMarkers.includes(w)) idCount++;
    if (enWords.has(w)) enCount++;
  }

  let phraseMatch = false;
  for (const pattern of enPhrases) {
    if (pattern.test(text)) {
      phraseMatch = true;
      break;
    }
  }

  if (phraseMatch && enCount >= idCount) return true;
  if (idCount === 0 && (enCount > 0 || phraseMatch)) return true;
  if (enCount > idCount + 1) return true;

  return false;
}

const changelogTypes = {
  major: { label: "MAJOR UPDATE", emoji: "🚀", color: 0x7c3aed },
  feature: { label: "NEW FEATURES", emoji: "✨", color: 0x2563eb },
  fix: { label: "BUG FIXES", emoji: "🛠️", color: 0x16a34a },
  maintenance: { label: "MAINTENANCE", emoji: "⚙️", color: 0xf59e0b }
} as const;

function formatChangelogContent(content: string): string {
  const items = content
    .split(/\n|\|/)
    .map((item) => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);

  return items.map((item) => `> • ${item}`).join("\n").slice(0, 4000);
}

function extractPlaceId(input: string): string {
  const cleanInput = input.trim();
  const match = cleanInput.match(/(?:games|places)\/(\d+)/i);
  if (match?.[1]) return match[1];
  return cleanInput.replace(/\D/g, "");
}

function buildSimpleChanges(content: string): string {
  const lines: string[] = [];

  for (const rawItem of content.split(/\n|-/)) {
    const item = rawItem.trim();
    if (!item) continue;
    lines.push(`• ${item}`);
  }

  return lines.join("\n").slice(0, 3800);
}

type TicketRecord = {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string;
  category: string;
  category_number?: number | null;
  status: string;
  claimed_by: string | null;
  ai_responded: number;
};

function getOrRecoverTicket(channel: TextChannel): TicketRecord | undefined {
  const selectTicket = db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
  const existing = selectTicket.get(channel.id) as TicketRecord | undefined;
  if (existing) return existing;

  const topicMatch = channel.topic?.match(
    /^Ticket (?:#\d+ )?by .+ \((\d+)\) \| Category: (.+?) \| Created:/
  );
  if (!topicMatch?.[1]) return undefined;

  const parts = channel.name.split("-");
  const category = parts[0] || "general";
  const catNum = parseInt(parts[1] || "0", 10) || null;

  db.prepare(`
    INSERT OR IGNORE INTO tickets (guild_id, user_id, channel_id, category, category_number)
    VALUES (?, ?, ?, ?, ?)
  `).run(channel.guild.id, topicMatch[1], channel.id, category, catNum);

  return selectTicket.get(channel.id) as TicketRecord | undefined;
}

function onCooldown(userId: string, action: string, duration = 5_000): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const expires = cooldowns.get(key) ?? 0;
  if (expires > now) return true;
  cooldowns.set(key, now + duration);
  return false;
}

function verificationPanel() {
  const button = new ButtonBuilder()
    .setCustomId("verify:accept")
    .setLabel("Verify")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return buildV2Container({
    title: "✅ Verification Panel - LeonX Hub",
    description: "Selamat datang di server **LeonX Hub**!",
    sections: [
      {
        title: "📋 Langkah Verifikasi",
        content:
          "• Klik tombol `Verify` di bawah ini untuk memulai.\n" +
          "• Dengan menekan tombol verifikasi, Anda menyetujui seluruh **Rules & Guidelines** server.\n" +
          "• Anda akan mendapatkan role terverifikasi dan akses penuh ke seluruh channel."
      }
    ],
    actionRows: [row]
  });
}

async function ensureVerificationPanel(): Promise<void> {
  const channel = await client.channels.fetch(config.VERIFY_CHANNEL_ID);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) {
    throw new Error("VERIFY_CHANNEL_ID bukan channel teks server yang dapat dikirimi pesan.");
  }

  const settingKey = `verification_message:${config.GUILD_ID}`;
  const saved = db.prepare("SELECT value FROM bot_settings WHERE key = ?")
    .get(settingKey) as { value: string } | undefined;

  const panel = verificationPanel();

  // Try to edit existing saved message
  if (saved) {
    const existing = await channel.messages.fetch(saved.value).catch(() => null);
    if (existing) {
      const edited = await existing.edit(panel).catch(() => null);
      if (edited) {
        console.log(`Panel verifikasi diperbarui di #${channel.id}, ID: ${existing.id}`);
        return;
      }
      // Edit failed (e.g. old non-V2 message), delete it
      await existing.delete().catch(() => null);
    }
  }

  // Scan channel history for any existing panels
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const existingPanel = messages.find(
      (m) =>
        m.author.id === client.user?.id &&
        m.components.some((row: any) => row.components?.some((c: any) => c.customId === "verify:accept"))
    );
    if (existingPanel) {
      const edited = await existingPanel.edit(panel).catch(() => null);
      if (edited) {
        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(settingKey, existingPanel.id);
        console.log(`Panel verifikasi diperbarui (self-healing) di #${channel.id}, ID: ${existingPanel.id}`);
        return;
      }
      // Edit failed, delete old one
      await existingPanel.delete().catch(() => null);
    }
  }

  // No existing panel found or edit failed, create new one
  const message = await channel.send(panel);
  db.prepare(`
    INSERT INTO bot_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(settingKey, message.id);
  console.log(`Panel verifikasi (V2) dibuat di #${channel.id}`);
}

async function ensureTicketPanel(): Promise<void> {
  const ticketChannelId = config.TICKET_CHANNEL_ID || "1519681008834842724";
  const channel = await client.channels.fetch(ticketChannelId);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) {
    throw new Error("TICKET_CHANNEL_ID bukan channel teks server yang dapat dikirimi pesan.");
  }

  const settingKey = `ticket_panel_message:${config.GUILD_ID}`;
  const saved = db.prepare("SELECT value FROM bot_settings WHERE key = ?")
    .get(settingKey) as { value: string } | undefined;

  if (saved) {
    const existing = await channel.messages.fetch(saved.value).catch(() => null);
    if (existing) {
      await existing.edit(createTicketPanel()).catch(() => null);
      return;
    }
  }

  // Scan channel history for existing panel to handle database wipes on Railway redeployment
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const existingPanel = messages.find(
      (m) =>
        m.author.id === client.user?.id &&
        m.components.some((row: any) => row.components?.some((c: any) => c.customId === "ticket:category"))
    );
    if (existingPanel) {
      await existingPanel.edit(createTicketPanel()).catch(() => null);
      db.prepare(`
        INSERT INTO bot_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(settingKey, existingPanel.id);
      console.log(`Panel ticket diperbarui (self-healing) di #${channel.id}, ID: ${existingPanel.id}`);
      return;
    }
  }

  const message = await channel.send(createTicketPanel());
  db.prepare(`
    INSERT INTO bot_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(settingKey, message.id);
  console.log(`Panel ticket dibuat di #${channel.id}`);
}

async function updateVoiceChannelStatus(status?: string): Promise<void> {
  const dbChannelId = db.prepare("SELECT value FROM bot_settings WHERE key = 'status_voice_channel_id'").get() as { value: string } | undefined;
  const channelId = dbChannelId?.value || config.STATUS_VOICE_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildVoice) {
      const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
      const statusVal = status || dbStatus?.value || "operational";

      let targetName = "🟢 Bot: Online";
      if (statusVal === "testing") {
        targetName = "🟡 Bot: Testing";
      } else if (statusVal === "maintenance") {
        targetName = "🔴 Bot: Maint";
      }

      const currentName = channel.name;
      if (currentName !== targetName) {
        await channel.setName(targetName);
        console.log(`Voice channel status diperbarui menjadi: ${targetName}`);
      }
    }
  } catch (error) {
    console.error("Gagal memperbarui voice channel status:", error);
  }
}

async function checkMonitoredPlaces(): Promise<void> {
  const monitoredChannelId = "1519980835116286053";
  try {
    const list = db.prepare("SELECT * FROM monitored_places").all() as Array<{
      place_id: string;
      name: string;
      universe_id: number;
      last_updated: string;
    }>;

    if (list.length === 0) return;

    const channel = await client.channels.fetch(monitoredChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      console.warn(`[Update Detector] Channel update-logs (${monitoredChannelId}) tidak ditemukan atau tidak dapat dikirimi pesan.`);
      return;
    }

    for (const item of list) {
      const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${item.universe_id}`).catch(() => null);
      if (!response || !response.ok) continue;

      const result = await response.json() as {
        data: Array<{
          name: string;
          updated: string;
        }>
      };

      const gameData = result.data?.[0];
      if (!gameData) continue;

      const apiUpdated = gameData.updated;

      // Jika waktu pembaruan di API berbeda dengan yang disimpan di database
      if (apiUpdated !== item.last_updated) {
        // 1. Perbarui di database
        db.prepare("UPDATE monitored_places SET last_updated = ?, name = ? WHERE place_id = ?")
          .run(apiUpdated, gameData.name, item.place_id);

        const updatedDate = new Date(apiUpdated);
        const unixTimestamp = Math.floor(updatedDate.getTime() / 1000);

        // 2. Kirim pesan V2 Alert ke channel update-logs
        const v2Alert = buildV2Container({
          title: "🚨 Game Update Detected!",
          description: `@everyone\n\nSebuah pembaruan baru terdeteksi pada game yang sedang dipantau!`,
          sections: [
            {
              title: "🎮 Detail Pembaruan Game",
              content:
                `• \`Nama Game:\` **${gameData.name}**\n` +
                `• \`Place ID:\` \`${item.place_id}\`\n` +
                `• \`Universe ID:\` \`${item.universe_id}\`\n` +
                `• \`Waktu Pembaruan:\` <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`
            },
            {
              title: "⚠️ Perubahan Status",
              content: "Status bot kini dialihkan ke **Testing/Updating**."
            }
          ],
          footer: "LeonX Hub • Auto-Update Detector"
        });

        await channel.send(v2Alert).catch((err) => console.error("Gagal mengirim notifikasi update game:", err));

        // 3. Otomatis set status bot ke 'testing'
        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run("script_status", "testing");

        // 4. Perbarui voice channel status secara instan
        await updateVoiceChannelStatus().catch(() => null);
      }
    }
  } catch (error) {
    console.error("Gagal menjalankan polling Update Detector:", error);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
  await ensureVerificationPanel().catch((error) => {
    console.error("Gagal membuat panel verifikasi:", error);
  });
  await ensureTicketPanel().catch((error) => {
    console.error("Gagal membuat panel ticket:", error);
  });
  await updateVoiceChannelStatus().catch((error) => {
    console.error("Gagal menjalankan update voice channel status:", error);
  });

  // Jalankan detektor update game Roblox secara berkala
  checkMonitoredPlaces().catch((error) => {
    console.error("Gagal melakukan pengecekan update game awal:", error);
  });
  setInterval(() => {
    checkMonitoredPlaces().catch((error) => {
      console.error("Gagal melakukan pengecekan update game berkala:", error);
    });
  }, 5 * 60 * 1000);

  // Automatic key distribution check for verified role members
  if (config.VERIFIED_ROLE_ID) {
    (async () => {
      try {
        const guild = await readyClient.guilds.fetch(config.GUILD_ID);
        const members = await guild.members.fetch();
        const verifiedMembers = members.filter(m => !m.user.bot && m.roles.cache.has(config.VERIFIED_ROLE_ID!));
        
        console.log(`[STARTUP] Checking key delivery for ${verifiedMembers.size} verified members...`);
        
        for (const [memberId, member] of verifiedMembers) {
          const settingKey = `key_dm_sent:${memberId}`;
          const alreadySent = db.prepare("SELECT 1 FROM bot_settings WHERE key = ?").get(settingKey);
          
          if (!alreadySent) {
            try {
              const userKey = getOrCreateUserKey(memberId);
              const dmContent = 
                `**LeonX Hub Loader**\n` +
                `Halo <@${memberId}>, akun Anda terverifikasi di server LeonX Hub. Berikut adalah loader script khusus dan key lisensi Anda:\n` +
                `\`\`\`lua\n` +
                `_G.Key = "${userKey}"\n` +
                `loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()\n` +
                `\`\`\`\n` +
                `Jangan bagikan key ini kepada siapapun!`;
                
              await member.send(dmContent);
              console.log(`[STARTUP] Successfully DMed key to ${member.user.tag}`);
              
              db.prepare("INSERT INTO bot_settings (key, value) VALUES (?, 'true')").run(settingKey);
            } catch (dmErr) {
              console.error(`[STARTUP] Failed to DM key to ${member.user.tag}:`, dmErr);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        console.log(`[STARTUP] Key delivery check completed.`);
      } catch (err) {
        console.error("[STARTUP] Error checking key delivery:", err);
      }
    })();
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (ownerOnlyCommands.has(interaction.commandName) &&
          interaction.user.id !== config.OWNER_ID) {
        await interaction.reply({
          content: "Command ini khusus owner bot.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (onCooldown(interaction.user.id, interaction.commandName)) {
        await interaction.reply({ content: "Tunggu beberapa detik sebelum memakai command lagi.", flags: MessageFlags.Ephemeral });
        return;
      }
      trackCommand(interaction.commandName);

      if (interaction.commandName === "verify") {
        await interaction.reply({
          content: `Silakan verifikasi di <#${config.VERIFY_CHANNEL_ID}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.commandName === "script") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!(interaction.member instanceof GuildMember) ||
            !config.VERIFIED_ROLE_ID ||
            !interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          await interaction.reply({
            content: `Kamu harus verifikasi dahulu di <#${config.VERIFY_CHANNEL_ID}>.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        if (config.PREMIUM_ROLE_ID &&
            !interaction.member.roles.cache.has(config.PREMIUM_ROLE_ID)) {
          await interaction.reply({ content: "Kamu belum memiliki role yang diperlukan.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userKey = getOrCreateUserKey(interaction.user.id);
        const v2DmScript = buildV2Container({
          title: "🔑 LeonX Hub Loader & Key",
          description: "Berikut adalah loader script khusus untuk Anda. *Jangan bagikan key ini kepada siapapun!*",
          sections: [
            {
              title: "📜 Script Loader (Lua)",
              content:
                "```lua\n" +
                `_G.Key = "${userKey}"\n` +
                'loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()\n' +
                "```"
            }
          ],
          footer: "LeonX Hub • License System"
        });
        await interaction.user.send(v2DmScript);
        await interaction.editReply("Script loader dan key khusus berhasil dikirim melalui DM.");
      }

      if (interaction.commandName === "resethwid") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!(interaction.member instanceof GuildMember) ||
            !config.VERIFIED_ROLE_ID ||
            !interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          await interaction.reply({
            content: `Kamu harus verifikasi dahulu di <#${config.VERIFY_CHANNEL_ID}>.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const isOwner = isUserOwnerOrAdmin(interaction.user.id, interaction.member);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = resetUserKeyBinding(interaction.user.id, isOwner);
        const replyText = result.message + (isOwner && result.success ? "\n*(Bypass cooldown aktif karena Anda memiliki role Owner/Admin)*" : "");
        await interaction.editReply(replyText);
      }

      if (interaction.commandName === "keyinfo") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const keyData = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(interaction.user.id) as {
          key: string;
          roblox_id: string | null;
          hwid: string | null;
          last_reset_at: string | null;
          created_at: string;
        } | undefined;

        if (!keyData) {
          await interaction.reply({
            content: "❌ Anda belum memiliki key yang terdaftar.\nSilakan gunakan perintah `/script` terlebih dahulu untuk membuat key baru.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const execCountRow = db.prepare("SELECT COUNT(*) as count FROM script_executions WHERE discord_id = ?").get(interaction.user.id) as { count: number };
        const totalExec = execCountRow ? execCountRow.count : 0;

        const lastExecutions = db.prepare("SELECT * FROM script_executions WHERE discord_id = ? ORDER BY executed_at DESC LIMIT 5").all(interaction.user.id) as Array<{
          roblox_username: string;
          roblox_id: string;
          place_id: string;
          executor: string;
          executed_at: string;
        }>;

        let cooldownText = "🟢 Tersedia (Bisa reset sekarang)";
        if (keyData.last_reset_at) {
          const lastReset = new Date(keyData.last_reset_at + " UTC").getTime();
          const now = Date.now();
          const diffMinutes = (now - lastReset) / (1000 * 60);
          if (diffMinutes < 10) {
            const remainingSeconds = Math.ceil(600 - (now - lastReset) / 1000);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            cooldownText = `⏳ Cooldown (${minutes}m ${seconds}s tersisa)`;
          }
        }

        let historyText = "Belum ada riwayat eksekusi.";
        if (lastExecutions.length > 0) {
          historyText = lastExecutions.map(ex => {
            const utcTime = ex.executed_at.includes("Z") || ex.executed_at.includes("UTC") ? ex.executed_at : ex.executed_at + " UTC";
            const date = new Date(utcTime).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
            return `• **${date}**\n  └─ Game: [${ex.place_id}](https://www.roblox.com/games/${ex.place_id}) | Executor: \`${ex.executor}\` | Roblox: [${ex.roblox_username || "Unknown"}](https://www.roblox.com/users/${ex.roblox_id}/profile)`;
          }).join("\n");
        }

        const embed = new EmbedBuilder()
          .setTitle("🔑 Informasi Key & Lisensi Anda")
          .setDescription(
            "Berikut adalah detail lisensi dan aktivitas penggunaan script Anda.\n\n" +
            "**🔑 Informasi Lisensi**\n" +
            `• \`Key Lisensi:\` \`||${keyData.key}||\` *(Klik untuk menyalin)*\n` +
            `• \`Akun Roblox:\` ${keyData.roblox_id ? `[Profil Roblox](https://www.roblox.com/users/${keyData.roblox_id}/profile) (\`${keyData.roblox_id}\`)` : "🔴 Belum tertaut"}\n` +
            `• \`Perangkat (HWID):\` ${keyData.hwid ? `\`${keyData.hwid}\`` : "🔴 Belum tertaut"}\n` +
            `• \`Cooldown Reset:\` ${cooldownText}\n` +
            `• \`Total Eksekusi:\` \`${totalExec}\` kali\n` +
            `• \`Dibuat Pada:\` \`${new Date(keyData.created_at + " UTC").toLocaleString("id-ID", { dateStyle: "medium" })}\`\n\n` +
            "**📜 Riwayat 5 Eksekusi Terakhir**\n" +
            historyText
          )
          .setFooter({ text: "LeonX Hub • License System" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "lookup") {
        const inputKey = interaction.options.getString("key");
        const inputUser = interaction.options.getUser("user");
        const inputRobloxId = interaction.options.getString("roblox_id");
        const inputHwid = interaction.options.getString("hwid");

        if (!inputKey && !inputUser && !inputRobloxId && !inputHwid) {
          await interaction.reply({
            content: "❌ Anda harus menentukan minimal satu opsi pencarian (key, user, roblox_id, atau hwid).",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let keyRows: any[] = [];
        let searchCriteria = "";

        if (inputKey) {
          searchCriteria = `Key: \`${inputKey}\``;
          const row = db.prepare("SELECT * FROM user_keys WHERE key = ?").get(inputKey);
          if (row) keyRows.push(row);
        } else if (inputUser) {
          searchCriteria = `Discord User: <@${inputUser.id}> (\`${inputUser.id}\`)`;
          const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(inputUser.id);
          if (row) keyRows.push(row);
        } else if (inputRobloxId) {
          searchCriteria = `Roblox ID: \`${inputRobloxId}\``;
          keyRows = db.prepare("SELECT * FROM user_keys WHERE roblox_id = ?").all(inputRobloxId);
        } else if (inputHwid) {
          searchCriteria = `HWID: \`${inputHwid}\``;
          keyRows = db.prepare("SELECT * FROM user_keys WHERE hwid = ?").all(inputHwid);
        }

        // Check blacklist status
        let blacklistStatus = "🟢 Clean / Tidak Ter-blacklist";
        const blacklistCheck = isBlacklisted({
          discordId: inputUser?.id || undefined,
          robloxId: inputRobloxId || undefined,
          hwid: inputHwid || undefined
        });

        if (blacklistCheck.blacklisted) {
          blacklistStatus = `🔴 **BLACKLISTED**\n└─ Alasan: *${blacklistCheck.reason}*`;
        }

        // Retrieve executions
        let targetDiscordIds = keyRows.map(r => r.discord_id);
        if (inputUser && !targetDiscordIds.includes(inputUser.id)) {
          targetDiscordIds.push(inputUser.id);
        }

        let executions: any[] = [];
        if (targetDiscordIds.length > 0) {
          const placeholders = targetDiscordIds.map(() => "?").join(",");
          executions = db.prepare(`
            SELECT * FROM script_executions 
            WHERE discord_id IN (${placeholders}) 
               OR (roblox_id = ? AND roblox_id IS NOT NULL)
            ORDER BY executed_at DESC LIMIT 5
          `).all(...targetDiscordIds, inputRobloxId || null);
        } else if (inputRobloxId) {
          executions = db.prepare(`
            SELECT * FROM script_executions 
            WHERE roblox_id = ? 
            ORDER BY executed_at DESC LIMIT 5
          `).all(inputRobloxId);
        }

        let executionsText = "Tidak ada riwayat eksekusi.";
        if (executions.length > 0) {
          executionsText = executions.map(ex => {
            const utcTime = ex.executed_at.includes("Z") || ex.executed_at.includes("UTC") ? ex.executed_at : ex.executed_at + " UTC";
            const date = new Date(utcTime).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
            return `• **${date}**\n  └─ Game: [${ex.place_id}](https://www.roblox.com/games/${ex.place_id})\n  └─ Exec: \`${ex.executor}\` | Roblox: [${ex.roblox_username || "Unknown"}](https://www.roblox.com/users/${ex.roblox_id}/profile) (\`${ex.roblox_id}\`)`;
          }).join("\n");
        }

        let keysFormatted = "❌ Tidak ditemukan data key/lisensi.";
        if (keyRows.length > 0) {
          keysFormatted = keyRows.map((row, idx) => {
            let resetTimeText = row.last_reset_at ? new Date(row.last_reset_at + " UTC").toLocaleString("id-ID") : "Belum pernah di-reset";
            return `• \`Key #${idx + 1}:\` \`${row.key}\`\n` +
                   `  └ Discord: <@${row.discord_id}> (\`${row.discord_id}\`)\n` +
                   `  └ Roblox: ${row.roblox_id ? `[Profil Roblox](https://www.roblox.com/users/${row.roblox_id}/profile) (\`${row.roblox_id}\`)` : "🔴 Belum tertaut"}\n` +
                   `  └ HWID: ${row.hwid ? `\`${row.hwid}\`` : "🔴 Belum tertaut"}\n` +
                   `  └ Reset Terakhir: \`${resetTimeText}\``;
          }).join("\n\n");
        }

        const embed = new EmbedBuilder()
          .setTitle("🔍 Hasil Lookup Data Lisensi")
          .setDescription(
            `Kriteria pencarian: ${searchCriteria}\n\n` +
            "**🛡️ Status Blacklist**\n" +
            `${blacklistStatus}\n\n` +
            "**🔑 Data Lisensi / Key**\n" +
            `${keysFormatted}\n\n` +
            "**📊 Riwayat 5 Eksekusi Terakhir**\n" +
            `${executionsText}`
          )
          .setFooter({ text: "LeonX Hub • Admin Tools" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "ai") {
        if (!config.GROQ_API_KEY) {
          await interaction.reply({
            content: "Fitur AI belum dikonfigurasi oleh owner bot (GROQ_API_KEY kosong).",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const query = interaction.options.getString("tanya", true);
        await interaction.deferReply();

        try {
          const isEng = isEnglishText(query);
          const systemPrompt = buildAiSystemPrompt(query);

          const groqResult = await callGroqAPI([
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
          ]);

          if (groqResult.ok) {
            const replyText = groqResult.text || (isEng ? "Sorry, unable to process your request. Please try again." : "Maaf, tidak dapat memahami pertanyaan tersebut. Silakan coba lagi.");
            let finalReply = replyText.trim();

            const actionSendScriptRegex = /\[\s*ACTION\s*:\s*SEND_SCRIPT\s*\]/i;
            const actionResetHwidRegex = /\[\s*ACTION\s*:\s*RESET_HWID\s*\]/i;
            const actionCheckKeyRegex = /\[\s*ACTION\s*:\s*CHECK_MY_KEY\s*\]/i;
            const actionGetStatsRegex = /\[\s*ACTION\s*:\s*GET_STATS\s*\]/i;

            // Guardrail checks: Only allow actions if user explicitly requested them
            if (actionSendScriptRegex.test(finalReply) && !hasExplicitScriptRequest(query)) {
              finalReply = finalReply.replace(actionSendScriptRegex, "").trim();
            }
            if (actionResetHwidRegex.test(finalReply) && !hasExplicitHwidResetRequest(query)) {
              finalReply = finalReply.replace(actionResetHwidRegex, "").trim();
            }
            if (actionCheckKeyRegex.test(finalReply) && !hasExplicitCheckKeyRequest(query)) {
              finalReply = finalReply.replace(actionCheckKeyRegex, "").trim();
            }

            const member = interaction.member instanceof GuildMember ? interaction.member : null;

            // 1. Action: SEND_SCRIPT
            if (actionSendScriptRegex.test(finalReply)) {
              const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
              if (blacklistCheck.blacklisted) {
                finalReply = finalReply.replace(
                  actionSendScriptRegex,
                  isEng
                    ? `\n\n❌ **Access Denied:** Your Discord account is blacklisted.\nReason: *${blacklistCheck.reason}*`
                    : `\n\n❌ **Akses ditolak:** Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`
                );
              } else {
                const hasRole = !config.VERIFIED_ROLE_ID || (member && member.roles.cache.has(config.VERIFIED_ROLE_ID));
                if (!hasRole) {
                  finalReply = finalReply.replace(
                    actionSendScriptRegex,
                    isEng
                      ? `\n\n❌ **Failed:** You must complete verification first in channel <#${config.VERIFY_CHANNEL_ID}>.`
                      : `\n\n❌ **Gagal:** Anda harus melakukan verifikasi terlebih dahulu di channel <#${config.VERIFY_CHANNEL_ID}>.`
                  );
                } else {
                  try {
                    const userKey = getOrCreateUserKey(interaction.user.id);
                    const v2DmScript = buildV2Container({
                      title: "🔑 LeonX Hub Loader & Key",
                      description: isEng
                        ? "Here is your personal script loader. *Do not share this key with anyone!*"
                        : "Berikut adalah loader script khusus untuk Anda. *Jangan bagikan key ini kepada siapapun!*",
                      sections: [
                        {
                          title: "📜 Script Loader (Lua)",
                          content:
                            "```lua\n" +
                            `_G.Key = "${userKey}"\n` +
                            'loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()\n' +
                            "```"
                        }
                      ],
                      footer: "LeonX Hub • License System"
                    });
                    await interaction.user.send(v2DmScript);
                    finalReply = finalReply.replace(
                      actionSendScriptRegex,
                      isEng
                        ? `\n\n🔑 **Success!** Your script loader and license key have been sent to your DMs privately. Please check your inbox.`
                        : `\n\n🔑 **Sukses!** Loader script dan key lisensi Anda telah dikirimkan secara pribadi ke DM Anda. Silakan periksa pesan masuk Anda.`
                    );
                  } catch (dmErr) {
                    finalReply = finalReply.replace(
                      actionSendScriptRegex,
                      isEng
                        ? `\n\n❌ **Failed:** Bot could not send a DM to you. Please make sure your server DMs are enabled.`
                        : `\n\n❌ **Gagal:** Bot tidak dapat mengirim pesan ke DM Anda. Pastikan pengaturan privasi DM Anda untuk server ini diaktifkan.`
                    );
                  }
                }
              }
            }

            // 2. Action: GET_STATS
            if (actionGetStatsRegex.test(finalReply)) {
              try {
                const guildCount = client.guilds.cache.size;
                const activeKeys = db.prepare("SELECT COUNT(*) as count FROM user_keys").get() as { count: number } | undefined;
                const totalKeys = activeKeys?.count || 0;
                const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
                
                let uptimeString = "0s";
                if (client.uptime) {
                  const secs = Math.floor(client.uptime / 1000);
                  const mins = Math.floor(secs / 60);
                  const hours = Math.floor(mins / 60);
                  const days = Math.floor(hours / 24);
                  uptimeString = isEng
                    ? (days > 0 ? `${days}d ${hours % 24}h` : hours > 0 ? `${hours}h ${mins % 60}m` : `${mins}m ${secs % 60}s`)
                    : (days > 0 ? `${days}hari ${hours % 24}jam` : hours > 0 ? `${hours}jam ${mins % 60}menit` : `${mins}menit ${secs % 60}detik`);
                }

                const statsBlock = isEng
                  ? `\n\n📊 **LeonX Bot Server Live Stats:**\n` +
                    `• Guild Count: \`${guildCount}\`\n` +
                    `• License Users (Keys): \`${totalKeys}\`\n` +
                    `• System Uptime: \`${uptimeString}\`\n` +
                    `• Memory Usage: \`${memoryUsageMB} MB\``
                  : `\n\n📊 **Statistik Live Server LeonX Bot:**\n` +
                    `• Jumlah Guild Server: \`${guildCount}\`\n` +
                    `• Pengguna Lisensi (Keys): \`${totalKeys}\`\n` +
                    `• Uptime Sistem: \`${uptimeString}\`\n` +
                    `• Penggunaan Memory: \`${memoryUsageMB} MB\``;
                  
                finalReply = finalReply.replace(actionGetStatsRegex, statsBlock);
              } catch (statsErr) {
                finalReply = finalReply.replace(actionGetStatsRegex, isEng ? `\n\n❌ Failed to retrieve server statistics.` : `\n\n❌ Gagal mengambil data statistik server saat ini.`);
              }
            }

            // 3. Action: RESET_HWID
            if (actionResetHwidRegex.test(finalReply)) {
              const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
              if (blacklistCheck.blacklisted) {
                finalReply = finalReply.replace(actionResetHwidRegex, isEng ? `\n\n❌ **Failed:** Account is blacklisted.` : `\n\n❌ **Gagal:** Akun Anda di-blacklist.`);
              } else {
                const hasRole = !config.VERIFIED_ROLE_ID || (member && member.roles.cache.has(config.VERIFIED_ROLE_ID));
                if (!hasRole) {
                  finalReply = finalReply.replace(actionResetHwidRegex, isEng ? `\n\n❌ **Failed:** Please complete verification first.` : `\n\n❌ **Gagal:** Silakan verifikasi terlebih dahulu.`);
                } else {
                  const isOwner = isUserOwnerOrAdmin(interaction.user.id, member);
                  const resetResult = resetUserKeyBinding(interaction.user.id, isOwner);
                  if (resetResult.success) {
                    finalReply = finalReply.replace(
                      actionResetHwidRegex,
                      isEng
                        ? `\n\n🔄 **HWID Reset Successful!** Re-run the script in Roblox to bind your new device/account.${isOwner ? " *(Owner Bypass Active)*" : ""}`
                        : `\n\n🔄 **HWID Reset Sukses!** Silakan jalankan kembali script di Roblox untuk menautkan perangkat/akun baru Anda.${isOwner ? " *(Owner Bypass Active)*" : ""}`
                    );
                  } else {
                    finalReply = finalReply.replace(actionResetHwidRegex, isEng ? `\n\n❌ **HWID Reset Failed:** ${resetResult.message}` : `\n\n❌ **Gagal reset HWID:** ${resetResult.message}`);
                  }
                }
              }
            }

            // 4. Action: CHECK_MY_KEY
            if (actionCheckKeyRegex.test(finalReply)) {
              try {
                const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(interaction.user.id) as {
                  key: string;
                  roblox_id: string | null;
                  hwid: string | null;
                  last_reset_at: string | null;
                } | undefined;

                if (!row) {
                  finalReply = finalReply.replace(actionCheckKeyRegex, isEng ? `\n\n🔑 You don't have a registered key yet. Use /script to get one.` : `\n\n🔑 Anda belum memiliki key terdaftar. Silakan minta script terlebih dahulu agar key dibuat otomatis.`);
                } else {
                  let cooldownRemainingMinutes = 0;
                  if (row.last_reset_at) {
                    const lastReset = new Date(row.last_reset_at).getTime();
                    const now = Date.now();
                    const diffMinutes = (now - lastReset) / (1000 * 60);
                    if (diffMinutes < 10) {
                      cooldownRemainingMinutes = Math.ceil(10 - diffMinutes);
                    }
                  }

                  const infoBlock = isEng
                    ? `\n\n🔑 **Your License Key Info:**\n` +
                      `• **Key**: \`LEONX-••••-••••-••••\` (Censored for security, full details sent to your DM!)\n` +
                      `• **Roblox ID**: \`${row.roblox_id || "Not Bound"}\`\n` +
                      `• **HWID**: \`${row.hwid || "Not Bound"}\`\n` +
                      `• **Reset Cooldown**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} minutes` : "Ready"}\``
                    : `\n\n🔑 **Informasi Lisensi Key Anda:**\n` +
                      `• **Key**: \`LEONX-••••-••••-••••\` (Disensor demi keamanan, detail lengkap telah dikirimkan ke DM Anda!)\n` +
                      `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                      `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                      `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready (Bebas Cooldown)"}\``;
                    
                  finalReply = finalReply.replace(actionCheckKeyRegex, infoBlock);

                  try {
                    const v2DmKeyInfo = buildV2Container({
                      title: isEng ? "🔑 Your License Key Information" : "🔑 Informasi Lisensi Key Anda",
                      description: isEng ? "Here are your active license details for LeonX Hub:" : "Berikut adalah detail lisensi aktif Anda di LeonX Hub (Detail Privasi):",
                      sections: [
                        {
                          content:
                            `• \`Key:\` \`${row.key}\` *(${isEng ? "Do not share!" : "Jangan bagikan key ini!"})*\n` +
                            `• \`Roblox ID:\` \`${row.roblox_id || (isEng ? "Not Bound" : "Belum Terikat")}\`\n` +
                            `• \`HWID:\` \`${row.hwid || (isEng ? "Not Bound" : "Belum Terikat")}\`\n` +
                            `• \`Reset Cooldown:\` \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} ${isEng ? "min" : "menit"}` : (isEng ? "Ready" : "Ready (Bebas Cooldown)")}\``
                        }
                      ],
                      footer: "LeonX Hub • License Privacy"
                    });
                    await interaction.user.send(v2DmKeyInfo);
                  } catch (dmErr) {
                    console.log(`Failed to DM key info to ${interaction.user.tag}:`, dmErr);
                  }
                }
              } catch (keyErr) {
                finalReply = finalReply.replace(actionCheckKeyRegex, `\n\n❌ Gagal memuat info key Anda.`);
              }
            }


            if (finalReply.length > 2000) {
              const chunks = finalReply.match(/[\s\S]{1,1950}/g) || [finalReply];
              for (let i = 0; i < chunks.length; i++) {
                if (i === 0) {
                  await interaction.editReply(chunks[i]!);
                } else {
                  await interaction.followUp(chunks[i]!);
                }
              }
            } else {
              await interaction.editReply(finalReply);
            }
          } else {
            const errMsg = groqResult.error === "timeout"
              ? "AI sedang lambat merespons (timeout). Silakan coba lagi nanti."
              : "Gagal menghubungi AI. Silakan coba lagi nanti.";
            await interaction.editReply(errMsg);
          }
        } catch (err) {
          console.error("AI Command error:", err);
          await interaction.editReply("Terjadi error internal saat menghubungi AI.");
        }
      }


      if (interaction.commandName === "generatekey") {
        const user = interaction.options.getUser("user", true);
        const newKey = forceGenerateUserKey(user.id);

        await interaction.reply({
          content: `🔑 **Key Baru Berhasil Dihasilkan!**\nPengguna: <@${user.id}>\nKey: \`${newKey}\`\n\n*Catatan: Key lama (jika ada) telah dinonaktifkan, dan semua data binding (Roblox ID & HWID) untuk pengguna ini telah di-reset.*`,
          flags: MessageFlags.Ephemeral
        });

        // Kirim DM ke pengguna
        try {
          const dmContent = 
            `**LeonX Hub Loader (Key Baru)**\n` +
            `Administrator telah membuatkan/memperbarui key baru untuk Anda. Jangan bagikan key ini kepada siapapun!\n` +
            `\`\`\`lua\n` +
            `_G.Key = "${newKey}"\n` +
            `loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()\n` +
            `\`\`\``;
          await user.send(dmContent);
        } catch {
          // Abaikan jika DM ditutup
        }
      }

      if (interaction.commandName === "status") {
        const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
        const dbReason = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status_reason'").get() as { value: string } | undefined;

        const statusVal = dbStatus?.value || "operational";
        const reasonVal = dbReason?.value || "Semua sistem berjalan dengan normal.";
        const statusColor = statusVal === "operational" ? 0x22c55e : statusVal === "testing" ? 0xeab308 : 0xef4444;

        let statusText = "🟢 Operational";
        if (statusVal === "testing") {
          statusText = "🟡 Testing / Updating";
        } else if (statusVal === "maintenance") {
          statusText = "🔴 Maintenance / Patched";
        }

        const v2Status = buildV2Container({
          title: "📊 Status Script & Bot System",
          description:
            "Berikut adalah status terkini dari seluruh infrastruktur LeonX Hub.",
          sections: [
            {
              title: "🟢 Status Layanan",
              content:
                `• \`LeonX Hub Script:\` ${statusText}\n` +
                `• \`Bot Discord:\` 🟢 **Online**`
            },
            {
              title: "📝 Catatan Sistem",
              content: `*${reasonVal}*`
            }
          ],
          footer: "LeonX Hub • Status Monitor"
        });

        await interaction.reply(v2Status);
      }

      if (interaction.commandName === "setstatus") {
        const status = interaction.options.getString("status", true);
        const reason = interaction.options.getString("catatan") || "Tidak ada catatan.";

        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES ('script_status', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(status);

        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES ('script_status_reason', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(reason);

        // Kirim respon dulu agar Discord tidak timeout (batas 3 detik)
        await interaction.reply({
          content: `✅ Status script berhasil diperbarui menjadi **${status}** dengan catatan: *${reason}*`,
          flags: MessageFlags.Ephemeral
        });

        // Jalankan pembaruan channel voice di background
        updateVoiceChannelStatus(status).catch((error) => {
          console.error("Gagal memperbarui voice channel status dari command:", error);
        });
      }

      if (interaction.commandName === "setvoicechannel") {
        const channel = interaction.options.getChannel("channel", true);
        if (channel.type !== ChannelType.GuildVoice) {
          await interaction.reply({
            content: "Channel yang Anda pilih bukan Voice Channel!",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES ('status_voice_channel_id', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(channel.id);

        // Kirim respon dulu agar Discord tidak timeout
        await interaction.reply({
          content: `✅ Channel status bot berhasil diatur ke <#${channel.id}>.`,
          flags: MessageFlags.Ephemeral
        });

        // Jalankan pembaruan channel voice di background
        updateVoiceChannelStatus().catch((error) => {
          console.error("Gagal memperbarui voice channel status setelah mengganti channel:", error);
        });
      }

      if (interaction.commandName === "faq") {
        const topic = interaction.options.getString("topik", true);
        const faqAnswer = faq[topic];
        if (!faqAnswer) {
          await interaction.reply({ content: "Topik tidak ditemukan.", flags: MessageFlags.Ephemeral });
        } else {
          const embed = new EmbedBuilder()
            .setTitle(`💡 FAQ - ${topic}`)
            .setDescription(
              `Berikut adalah informasi mengenai topik **${topic}**:\n\n` +
              faqAnswer
            )
            .setFooter({ text: "LeonX Hub • FAQ System" })
            .setTimestamp();
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.commandName === "website") {
        const embed = new EmbedBuilder()
          .setTitle("🌐 LeonThings Official Website")
          .setDescription(
            "Silakan gunakan tautan resmi di bawah ini untuk mengakses layanan kami:\n\n" +
            "**🔗 Link Resmi**\n" +
            "• `/website` - **Website Utama:** https://leonthings.my.id\n" +
            "• `/console` - **Bot Console & HWID Reset:** https://script.leonthings.my.id"
          )
          .setFooter({ text: "LeonX Hub • Official Links" })
          .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === "ticket") {
        const sub = interaction.options.getSubcommand(false);

        if (!sub) {
          // Fallback jika somehow dipanggil tanpa subcommand
          await interaction.reply({
            content: "Gunakan subcommand: `/ticket panel`, `/ticket close`, `/ticket add`, `/ticket remove`, atau `/ticket stats`",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (sub === "panel") {
          if (interaction.user.id !== config.OWNER_ID) {
            await interaction.reply({
              content: "Hanya owner yang dapat membuat panel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          if (!interaction.channel?.isSendable()) {
            await interaction.reply({
              content: "Tidak bisa mengirim pesan di channel ini.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          await interaction.channel.send(await createTicketPanel());
          await interaction.reply({
            content: "Panel ticket berhasil dibuat!",
            flags: MessageFlags.Ephemeral
          });
        }

        if (sub === "close") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const ticketData = db.prepare("SELECT * FROM tickets WHERE channel_id = ?")
            .get(interaction.channel.id) as any;

          if (!ticketData) {
            await interaction.reply({
              content: "Ini bukan channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const reason = interaction.options.getString("alasan");
          await interaction.reply("Menutup ticket dan menyimpan transcript...");

          const { transcript, ticketData: ticket } = await closeTicket(
            interaction.channel as TextChannel,
            interaction.user,
            reason || undefined
          );

          // Kirim transcript ke user
          const user = await client.users.fetch(ticket.user_id).catch(() => null);
          if (user) {
            const transcriptAttachment = new AttachmentBuilder(
              Buffer.from(transcript, "utf-8"),
              { name: `ticket-${ticket.id}-transcript.html` }
            );

            await user.send({
              content: `Transcript untuk ticket **#${ticket.id}** (${TICKET_CATEGORIES[ticket.category as TicketCategory]?.label || ticket.category})`,
              files: [transcriptAttachment]
            }).catch(() => console.log(`Tidak bisa mengirim transcript ke ${user.tag}`));
          }

          // Kirim rating prompt
          const ratingEmbed = new EmbedBuilder()
            .setTitle("📊 Beri Rating untuk Support Kami")
            .setDescription(
              "Bagaimana pengalaman Anda dengan layanan support kami?\n" +
              "Rating Anda sangat membantu kami untuk terus meningkatkan kualitas layanan."
            )
            .setFooter({ text: "Pilih rating bintang di bawah ini" });

          await interaction.channel.send({
            embeds: [ratingEmbed],
            components: [createRatingButtons()]
          });

          setTimeout(() => interaction.channel?.delete().catch(() => undefined), 10_000);
        }

        if (sub === "add") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const user = interaction.options.getUser("user", true);
          await interaction.channel.permissionOverwrites.create(user.id, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            EmbedLinks: true
          });

          await interaction.reply({
            content: `✅ <@${user.id}> telah ditambahkan ke ticket ini.`
          });
        }

        if (sub === "remove") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const user = interaction.options.getUser("user", true);
          await interaction.channel.permissionOverwrites.delete(user.id);

          await interaction.reply({
            content: `✅ <@${user.id}> telah dihapus dari ticket ini.`
          });
        }

        if (sub === "stats") {
          const stats = getTicketStats();
          const categoryFormatted = stats.byCategory
            .map(c => `• \`${TICKET_CATEGORIES[c.category as TicketCategory]?.label || c.category}:\` **${c.count}** ticket`)
            .join("\n");

          const statsEmbed = new EmbedBuilder()
            .setTitle("📊 Statistik Support Ticket System")
            .setDescription(
              "Ringkasan statistik penggunaan ticket support:\n\n" +
              "**📊 Ringkasan Ticket**\n" +
              `• \`Total Ticket:\` **${stats.total}**\n` +
              `• \`Ticket Open:\` **${stats.open}**\n` +
              `• \`Ticket Closed:\` **${stats.closed}**\n` +
              `• \`Rata-rata Rating:\` **${stats.avgRating ? `${Number(stats.avgRating).toFixed(1)} / 5.0` : "Belum ada rating"}**\n\n` +
              "**📂 Tiket Per Kategori**\n" +
              (categoryFormatted || "Belum ada data")
            )
            .setFooter({ text: "LeonX Hub • Support System" })
            .setTimestamp();

          await interaction.reply({
            embeds: [statsEmbed],
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (interaction.commandName === "bug-report") {
        const modal = new ModalBuilder().setCustomId("bug:submit").setTitle("Laporan Bug");
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("title").setLabel("Judul singkat").setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Apa yang terjadi?").setStyle(TextInputStyle.Paragraph).setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("steps").setLabel("Cara mengulang bug").setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
        await interaction.showModal(modal);
      }

      if (interaction.commandName === "changelog") {
        const sub = interaction.options.getSubcommand();
        if (sub === "publish") {
          const ownerRoleId = config.OWNER_ROLE_ID || "1515320851656872066";
          const isOwner =
            (interaction.member instanceof GuildMember && (
              (ownerRoleId ? interaction.member.roles.cache.has(ownerRoleId) : false) ||
              interaction.member.roles.cache.some(r => r.name.toLowerCase().includes("owner")) ||
              interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
              interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
            )) ||
            interaction.guild?.ownerId === interaction.user.id ||
            interaction.user.id === config.OWNER_ID;

          if (!isOwner) {
            await interaction.reply({
              content: "Hanya owner yang dapat menerbitkan changelog.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const version = interaction.options.getString("versi", true);
          const title = interaction.options.getString("judul", true);
          const typeKey = interaction.options.getString("jenis", true) as keyof typeof changelogTypes;
          const content = interaction.options.getString("isi", true);
          const summary = interaction.options.getString("ringkasan") ?? null;
          const mapName = interaction.options.getString("map") ?? null;
          const tagEveryone = interaction.options.getBoolean("tag_everyone") ?? false;
          const type = changelogTypes[typeKey];
          const formattedContent = buildSimpleChanges(content);
          const changelogTitle = `${version} — ${title}`;
          const guildIcon = interaction.guild?.iconURL() ?? client.user?.displayAvatarURL();
          const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
          const statusVal = dbStatus?.value || "operational";
          let statusEmoji = "🟢";
          if (statusVal === "testing") statusEmoji = "🟡";
          else if (statusVal === "maintenance") statusEmoji = "🔴";

          // Format timestamp
          const now = new Date();
          const timeStr = now.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "Asia/Jakarta"
          }) + " at " + now.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Jakarta"
          });

          // Process Map / Place ID & Thumbnail
          let mapDisplayName = mapName;
          let changelogThumbnailUrl = guildIcon;

          if (mapName) {
            const trimmedMap = mapName.trim();
            const placeIdMatch = trimmedMap.match(/\b\d{6,15}\b/);
            const isUniversalOrDiscord = /^(universal|discord|leon\s*x|global|bot)$/i.test(trimmedMap);

            if (placeIdMatch && !isUniversalOrDiscord) {
              const detectedPlaceId = placeIdMatch[0];
              try {
                const uRes = await fetch(`https://apis.roblox.com/universes/v1/places/${detectedPlaceId}/universe`).then(r => r.json()).catch(() => null);
                if (uRes && uRes.universeId) {
                  const [gameRes, iconRes] = await Promise.all([
                    fetch(`https://games.roblox.com/v1/games?universeIds=${uRes.universeId}`).then(r => r.json()).catch(() => null),
                    fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${uRes.universeId}&size=512x512&format=Png&isCircular=false`).then(r => r.json()).catch(() => null)
                  ]);
                  const rbxGameName = gameRes?.data?.[0]?.name;
                  const rbxIconUrl = iconRes?.data?.[0]?.imageUrl;

                  if (rbxGameName) {
                    mapDisplayName = `${rbxGameName}`;
                  }
                  if (rbxIconUrl) {
                    changelogThumbnailUrl = rbxIconUrl;
                  }
                }
              } catch (e) {
                console.error("[CHANGELOG] Error fetching Roblox game info:", e);
              }
            } else if (isUniversalOrDiscord) {
              changelogThumbnailUrl = guildIcon;
              mapDisplayName = trimmedMap.charAt(0).toUpperCase() + trimmedMap.slice(1);
            }
          }

          // Build info section
          let infoText = "";
          if (tagEveryone) {
            infoText += "@everyone\n\n";
          }
          infoText +=
            `**Status:** ${statusEmoji}\n` +
            `**Time:** \`${timeStr}\`\n` +
            `**Version:** \`${version}\``;
          if (mapDisplayName) {
            infoText += `\n**Map:** \`${mapDisplayName}\``;
          }

          // Build changelog section content
          let changelogBody = "";
          if (summary) {
            changelogBody += `${summary}\n\n`;
          }
          changelogBody += `**Changelog:**\n${formattedContent}`;

          // Build buttons (Secondary style, no external link icon)
          const buttonsList: ButtonBuilder[] = [];

          if (config.VERIFY_CHANNEL_ID) {
            buttonsList.push(
              new ButtonBuilder()
                .setLabel("Verify")
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`changelog:verify:${config.VERIFY_CHANNEL_ID}`)
            );
          }

          const ticketChannelId = config.TICKET_CHANNEL_ID || "1519681008834842724";
          buttonsList.push(
            new ButtonBuilder()
              .setLabel("Support")
              .setStyle(ButtonStyle.Secondary)
              .setCustomId(`changelog:support:${ticketChannelId}`)
          );

          if (config.BUG_REPORT_CHANNEL_ID) {
            buttonsList.push(
              new ButtonBuilder()
                .setLabel("Bug Report")
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`changelog:bugreport:${config.BUG_REPORT_CHANNEL_ID}`)
            );
          }

          const links = new ActionRowBuilder<ButtonBuilder>().addComponents(buttonsList);

          const v2Payload = buildV2Container({
            title: `# U P D A T E`,
            thumbnailUrl: changelogThumbnailUrl,
            description: infoText,
            sections: [
              {
                content: changelogBody
              }
            ],
            footer: `${type.label} • ${version}`,
            actionRows: [links],
            accentColor: null,
            dividers: true
          });

          const channel = await client.channels.fetch(config.CHANGELOG_CHANNEL_ID).catch(() => null);
          if (!channel || (!channel.isSendable() && channel.type !== ChannelType.GuildForum)) {
            await interaction.editReply({
              content: `❌ Gagal: Channel changelog (<#${config.CHANGELOG_CHANNEL_ID}>) tidak dapat diakses atau bukan channel teks/forum.`
            });
            return;
          }

          try {
            if (channel.type === ChannelType.GuildForum) {
              await channel.threads.create({
                name: `${version} — ${title}`.slice(0, 100),
                message: v2Payload,
                reason: `Changelog ${version}`
              });
            } else {
              await channel.send(v2Payload);
            }
          } catch (sendErr) {
            console.error("Gagal mengirim changelog ke channel:", sendErr);
            await interaction.editReply({
              content: `❌ Terjadi kesalahan saat mengirim pesan ke channel changelog: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`
            });
            return;
          }

          db.prepare("INSERT INTO changelogs (title, content, author_id) VALUES (?, ?, ?)")
            .run(changelogTitle, formattedContent, interaction.user.id);
          await interaction.editReply({
            content: `✅ Changelog **${version}** berhasil diterbitkan di <#${config.CHANGELOG_CHANNEL_ID}>.` +
              (tagEveryone ? " (dengan tag @everyone)" : "")
          });
        } else if (sub === "games") {
          const targetChannel = (interaction.channel as TextChannel | null);
          const guildIcon = interaction.guild?.iconURL() ?? client.user?.displayAvatarURL();
          const v2Payload = buildSupportedGamesV2(undefined, guildIcon);

          if (!targetChannel || !("send" in targetChannel) || typeof targetChannel.send !== "function") {
            await interaction.reply({
              content: `❌ Gagal: Channel tidak dapat menerima pesan.`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          try {
            await targetChannel.send(v2Payload);
            await interaction.reply({
              content: `✅ Pesan **Script Support Game** berhasil dikirim ke <#${targetChannel.id}>.`,
              flags: MessageFlags.Ephemeral
            });
          } catch (err) {
            console.error("Gagal mengirim pesan support-game:", err);
            await interaction.reply({
              content: `❌ Gagal mengirim pesan: ${err instanceof Error ? err.message : String(err)}`,
              flags: MessageFlags.Ephemeral
            });
          }
        } else {
          const row = db.prepare("SELECT title, content, created_at FROM changelogs ORDER BY id DESC LIMIT 1")
            .get() as { title: string; content: string; created_at: string } | undefined;
          if (!row) {
            await interaction.reply({ content: "Belum ada changelog.", flags: MessageFlags.Ephemeral });
          } else {
            const embed = new EmbedBuilder()
              .setTitle(`🚀 ${row.title}`)
              .setDescription(row.content)
              .setFooter({ text: `Published on ${row.created_at}` });
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }
        }
      }

      if (interaction.commandName === "supported-games" || interaction.commandName === "support-game") {
        const targetChannel = (interaction.options.getChannel("channel") as TextChannel | null) ?? (interaction.channel as TextChannel | null);
        const guildIcon = interaction.guild?.iconURL() ?? client.user?.displayAvatarURL();
        const v2Payload = buildSupportedGamesV2(undefined, guildIcon);

        if (!targetChannel || !("send" in targetChannel) || typeof targetChannel.send !== "function") {
          await interaction.reply({
            content: `❌ Gagal: Channel tidak dapat menerima pesan.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        try {
          await targetChannel.send(v2Payload);
          await interaction.reply({
            content: `✅ Pesan **Script Support Game** berhasil dikirim ke <#${targetChannel.id}>.`,
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          console.error("Gagal mengirim embed support-game ke channel target:", err);
          await interaction.reply({
            content: `❌ Gagal mengirim pesan ke <#${targetChannel.id}>: ${err instanceof Error ? err.message : String(err)}`,
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (interaction.commandName === "license-panel") {
        if (!isStaff(interaction.member as GuildMember)) {
          await interaction.reply({ content: "❌ Anda tidak memiliki izin untuk menggunakan perintah ini.", flags: MessageFlags.Ephemeral });
          return;
        }

        const targetChannel = (interaction.options.getChannel("channel") as TextChannel | null) ?? (interaction.channel as TextChannel | null);
        const guildIcon = interaction.guild?.iconURL() ?? client.user?.displayAvatarURL();
        const v2Payload = buildLicensePanelV2(guildIcon);

        if (!targetChannel || !("send" in targetChannel) || typeof targetChannel.send !== "function") {
          await interaction.reply({
            content: `❌ Gagal: Channel tidak dapat menerima pesan.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        try {
          await targetChannel.send(v2Payload as any);
          await interaction.reply({
            content: `✅ Panel **License & Script Dashboard** berhasil dikirim ke <#${targetChannel.id}>.`,
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          console.error("Gagal mengirim panel license-dashboard:", err);
          await interaction.reply({
            content: `❌ Gagal mengirim panel ke <#${targetChannel.id}>: ${err instanceof Error ? err.message : String(err)}`,
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (interaction.commandName === "security") {
        if (!isStaff(interaction.member as GuildMember)) {
          await interaction.reply({ content: "❌ Anda tidak memiliki izin untuk menggunakan perintah ini.", flags: MessageFlags.Ephemeral });
          return;
        }

        const sub = interaction.options.getSubcommand();
        if (sub === "list-bans") {
          const bannedList = getBannedIps();
          if (bannedList.length === 0) {
            await interaction.reply({ content: "✅ Tidak ada IP yang saat ini diblokir oleh sistem anti-tamper.", flags: MessageFlags.Ephemeral });
            return;
          }

          const lines = bannedList.slice(0, 20).map((b, i) =>
            `**${i + 1}.** \`${b.ip}\` — ${b.reason} (<t:${Math.floor(new Date(b.banned_at).getTime() / 1000)}:R>)`
          );

          const embed = new EmbedBuilder()
            .setTitle("🛡️ Daftar IP Terblokir (Anti-Tamper)")
            .setColor(0xed4245)
            .setDescription(lines.join("\n") + (bannedList.length > 20 ? `\n\n*...dan ${bannedList.length - 20} IP lainnya.*` : ""))
            .setFooter({ text: `Total IP Diblokir: ${bannedList.length}` });

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (sub === "unban-ip") {
          const ip = interaction.options.getString("ip", true).trim();
          const success = unbanIp(ip);
          if (success) {
            await interaction.reply({ content: `✅ Berhasil membuka blokir IP \`${ip}\`.`, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: `⚠️ IP \`${ip}\` tidak ditemukan dalam daftar blacklist IP.`, flags: MessageFlags.Ephemeral });
          }
        } else if (sub === "ban-ip") {
          const ip = interaction.options.getString("ip", true).trim();
          const reason = interaction.options.getString("alasan", true).trim();
          banIp(ip, `Manual Admin Ban: ${reason}`);
          await interaction.reply({ content: `⛔ Berhasil memblokir IP \`${ip}\` dengan alasan: **${reason}**.`, flags: MessageFlags.Ephemeral });
        }
      }

      if (["warn", "timeout", "kick", "ban"].includes(interaction.commandName)) {
        const user = interaction.options.getUser("user", true);
        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";
        if (!member) {
          await interaction.reply({ content: "Member tidak ditemukan.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.commandName === "warn") {
          db.prepare("INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)")
            .run(interaction.guildId, user.id, interaction.user.id, reason);
        }
        if (interaction.commandName === "timeout") {
          const minutes = interaction.options.getInteger("menit", true);
          await member.timeout(minutes * 60_000, reason);
        }
        if (interaction.commandName === "kick") await member.kick(reason);
        if (interaction.commandName === "ban") await member.ban({ reason });
        await interaction.reply({ content: `Tindakan **${interaction.commandName}** berhasil untuk ${user.tag}.`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === "stats") {
        const openTickets = (db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE status = 'open'").get() as { count: number }).count;
        const reports = (db.prepare("SELECT COUNT(*) AS count FROM bug_reports").get() as { count: number }).count;
        const uses = (db.prepare("SELECT COALESCE(SUM(uses), 0) AS count FROM command_usage").get() as { count: number }).count;

        const embed = new EmbedBuilder()
          .setTitle("📊 Statistik Admin Server")
          .setDescription(
            "Ringkasan statistik aktivitas bot dan server:\n\n" +
            "**👥 Statistik Komunitas & Bot**\n" +
            `• \`Total Member:\` **${interaction.guild?.memberCount ?? 0}** member\n` +
            `• \`Ticket Aktif:\` **${openTickets}** ticket\n` +
            `• \`Laporan Bug:\` **${reports}** laporan\n` +
            `• \`Command Dipakai:\` **${uses}** eksekusi`
          )
          .setFooter({ text: "LeonX Hub • Admin Dashboard" })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === "blacklist") {
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
          const reason = interaction.options.getString("alasan", true);
          const user = interaction.options.getUser("user");
          const robloxId = interaction.options.getString("roblox_id");
          const hwid = interaction.options.getString("hwid");

          if (!user && !robloxId && !hwid) {
            await interaction.reply({
              content: "❌ Gagal: Anda harus menyertakan minimal salah satu dari parameter `user`, `roblox_id`, atau `hwid`.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          addToBlacklist({
            discordId: user?.id,
            robloxId: robloxId || undefined,
            hwid: hwid || undefined,
            reason
          });

          let message = "✅ Berhasil menambahkan ke daftar blacklist:\n";
          if (user) message += `• Discord User: <@${user.id}>\n`;
          if (robloxId) message += `• Roblox ID: \`${robloxId}\`\n`;
          if (hwid) message += `• HWID: \`${hwid}\`\n`;
          message += `• Alasan: *${reason}*`;

          await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }

        if (sub === "remove") {
          const user = interaction.options.getUser("user");
          const robloxId = interaction.options.getString("roblox_id");
          const hwid = interaction.options.getString("hwid");

          if (!user && !robloxId && !hwid) {
            await interaction.reply({
              content: "❌ Gagal: Anda harus menyertakan minimal salah satu dari parameter `user`, `roblox_id`, atau `hwid`.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const removed = removeFromBlacklist({
            discordId: user?.id,
            robloxId: robloxId || undefined,
            hwid: hwid || undefined
          });

          if (removed) {
            await interaction.reply({
              content: "✅ Berhasil menghapus target dari daftar blacklist.",
              flags: MessageFlags.Ephemeral
            });
          } else {
            await interaction.reply({
              content: "❌ Gagal: Target tidak ditemukan dalam daftar blacklist.",
              flags: MessageFlags.Ephemeral
            });
          }
        }

        if (sub === "list") {
          const list = getBlacklistList();
          if (list.length === 0) {
            await interaction.reply({ content: "ℹ️ Daftar blacklist saat ini kosong.", flags: MessageFlags.Ephemeral });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle("🚫 Daftar Blacklist LeonX Hub")
            .setDescription(
              `Total target ter-blacklist: **${list.length}**\n\n` +
              "**🛡️ List Target Blacklist**\n\n" +
              list.map((item, idx) => {
                let detail = "";
                if (item.discord_id) detail += `Discord: <@${item.discord_id}> (\`${item.discord_id}\`) `;
                if (item.roblox_id) detail += `Roblox ID: \`${item.roblox_id}\` `;
                if (item.hwid) detail += `HWID: \`${item.hwid}\``;
                return `• \`Target #${idx + 1}:\` ${detail}\n  └ Alasan: *${item.reason}* (${item.created_at})`;
              }).join("\n\n")
            )
            .setFooter({ text: "LeonX Hub • Blacklist System" })
            .setTimestamp();

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.commandName === "roblox") {
        const username = interaction.options.getString("username", true);
        await interaction.deferReply();

        try {
          // 1. Get User ID from username
          const userSearchResponse = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
          });

          if (!userSearchResponse.ok) {
            throw new Error(`Roblox API error: ${userSearchResponse.statusText}`);
          }

          const searchResult = await userSearchResponse.json() as {
            data: Array<{ id: number; name: string; displayName: string; hasVerifiedBadge?: boolean }>
          };

          if (!searchResult.data || searchResult.data.length === 0) {
            await interaction.editReply(`❌ Pengguna Roblox dengan username \`${username}\` tidak ditemukan.`);
            return;
          }

          const robloxUser = searchResult.data[0];
          if (!robloxUser) {
            await interaction.editReply(`❌ Pengguna Roblox dengan username \`${username}\` tidak ditemukan.`);
            return;
          }
          const userId = robloxUser.id;

          // 2. Get User Details
          const userDetailsResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
          if (!userDetailsResponse.ok) {
            throw new Error(`Roblox API error (details): ${userDetailsResponse.statusText}`);
          }

          const details = await userDetailsResponse.json() as {
            description: string;
            created: string;
            isBanned: boolean;
            displayName: string;
            name: string;
            hasVerifiedBadge?: boolean;
          };

          // 3. Get User Avatar Image
          const avatarResponse = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png&isCircular=false`
          );

          let avatarUrl: string | null = null;
          if (avatarResponse.ok) {
            const avatarResult = await avatarResponse.json() as {
              data: Array<{ imageUrl: string }>
            };
            const avatarObj = avatarResult.data?.[0];
            if (avatarObj) {
              avatarUrl = avatarObj.imageUrl;
            }
          }

          // 4. Fetch additional info in parallel
          const [
            followersRes,
            followingRes,
            friendsRes,
            collectiblesRes,
            historyRes
          ] = await Promise.all([
            fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).catch(() => null),
            fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).catch(() => null),
            fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).catch(() => null),
            fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`).catch(() => null),
            fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=10`).catch(() => null)
          ]);

          // Parse Followers
          let followersCount = "N/A";
          if (followersRes?.ok) {
            const data = await followersRes.json() as { count: number };
            followersCount = data.count.toLocaleString("id-ID");
          }

          // Parse Following
          let followingCount = "N/A";
          if (followingRes?.ok) {
            const data = await followingRes.json() as { count: number };
            followingCount = data.count.toLocaleString("id-ID");
          }

          // Parse Friends
          let friendsCount = "N/A";
          if (friendsRes?.ok) {
            const data = await friendsRes.json() as { count: number };
            friendsCount = data.count.toLocaleString("id-ID");
          }

          // Parse RAP (Recent Average Price)
          let rapText = "None / 🔒 Private";
          if (collectiblesRes?.ok) {
            const data = await collectiblesRes.json() as {
              data: Array<{ recentAveragePrice?: number; value?: number }>
            };
            if (data.data && data.data.length > 0) {
              const totalRap = data.data.reduce((sum, item) => sum + (item.recentAveragePrice || item.value || 0), 0);
              rapText = totalRap > 0 ? `${totalRap.toLocaleString("id-ID")} Robux` : "None";
            } else {
              rapText = "None";
            }
          } else if (collectiblesRes?.status === 403) {
            rapText = "🔒 Private";
          }

          // Parse Username History
          let historyText = "Tidak ada riwayat nama.";
          if (historyRes?.ok) {
            const data = await historyRes.json() as {
              data: Array<{ name: string }>
            };
            if (data.data && data.data.length > 0) {
              historyText = data.data.map(item => `\`${item.name}\``).join(", ");
            }
          }

          const creationDate = new Date(details.created);

          const v2Profile = buildV2Container({
            title: `👤 Roblox Profile - ${details.displayName}${details.hasVerifiedBadge ? " ☑️" : ""}`,
            thumbnailUrl: avatarUrl || undefined,
            description:
              `@${details.name} • \`ID:\` \`${userId}\` • Status: ${details.isBanned ? "🔴 **Banned**" : "🟢 **Aktif**"}\n\n` +
              (details.description ? `> *${details.description.slice(0, 300)}*` : ""),
            sections: [
              {
                title: "📊 Statistik Akun",
                content:
                  `• \`Teman:\` **${friendsCount}**\n` +
                  `• \`Pengikut:\` **${followersCount}**\n` +
                  `• \`Mengikuti:\` **${followingCount}**\n` +
                  `• \`RAP Collectibles:\` **${rapText}**\n` +
                  `• \`Tanggal Dibuat:\` **${creationDate.toLocaleDateString("id-ID")}**`
              },
              {
                title: "🏷️ Riwayat Nama",
                content: historyText
              }
            ],
            footer: "LeonX Hub • Roblox Lookup"
          });

          await interaction.deleteReply();
          await interaction.followUp(v2Profile);
        } catch (error) {
          console.error("Gagal melakukan lookup Roblox:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat menghubungi server Roblox. Silakan coba beberapa saat lagi.");
        }
      }

      if (interaction.commandName === "monitor-game") {
        const placeIdRaw = interaction.options.getString("place_id", true);
        const placeId = extractPlaceId(placeIdRaw);
        await interaction.deferReply();

        try {
          // 1. Get Universe ID from Place ID using public endpoint
          const detailsResponse = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
          if (!detailsResponse.ok) {
            throw new Error(`Place details fetch error: ${detailsResponse.statusText}`);
          }

          const universeInfo = await detailsResponse.json() as {
            universeId?: number | null;
          };

          if (!universeInfo || !universeInfo.universeId) {
            await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan.`);
            return;
          }

          const universeId = universeInfo.universeId;

          // 2. Fetch Universe details, votes, and icon in parallel
          const [gameRes, votesRes, iconRes] = await Promise.all([
            fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`).catch(() => null),
            fetch(`https://games.roblox.com/v1/games/${universeId}/votes`).catch(() => null),
            fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png&isCircular=false`).catch(() => null)
          ]);

          // Parse Game Info
          let playing = 0;
          let visits = 0;
          let favoritedCount = 0;
          let creatorName = "Unknown";
          let gameName = "Unknown Game";

          if (gameRes?.ok) {
            const gameData = await gameRes.json() as {
              data: Array<{
                name: string;
                playing: number;
                visits: number;
                favoritedCount: number;
                creator: { name: string };
              }>
            };
            const uData = gameData.data?.[0];
            if (uData) {
              gameName = uData.name;
              playing = uData.playing;
              visits = uData.visits;
              favoritedCount = uData.favoritedCount;
              creatorName = uData.creator.name;
            }
          }

          // Parse Votes (Likes & Dislikes)
          let likes = 0;
          let dislikes = 0;
          let likeRatio = "100%";
          if (votesRes?.ok) {
            const votesData = await votesRes.json() as { upVotes: number; downVotes: number };
            likes = votesData.upVotes;
            dislikes = votesData.downVotes;
            const totalVotes = likes + dislikes;
            if (totalVotes > 0) {
              likeRatio = `${((likes / totalVotes) * 100).toFixed(1)}%`;
            }
          }

          // Parse Icon
          let iconUrl: string | null = null;
          if (iconRes?.ok) {
            const iconData = await iconRes.json() as { data: Array<{ imageUrl: string }> };
            const iconObj = iconData.data?.[0];
            if (iconObj) {
              iconUrl = iconObj.imageUrl;
            }
          }

          const embed = new EmbedBuilder()
            .setTitle(`🎮 Game Monitor - ${gameName}`)
            .setURL(`https://www.roblox.com/games/${placeId}`)
            .setDescription(
              `Developer / Creator: **${creatorName}**\n` +
              `Place ID: \`${placeId}\` | Universe ID: \`${universeId}\`\n\n` +
              "**🟢 Pemain & Performa**\n" +
              `• \`Playing:\` **${playing.toLocaleString("id-ID")}** pemain\n` +
              `• \`Total Visits:\` **${visits.toLocaleString("id-ID")}**\n` +
              `• \`Favorites:\` **${favoritedCount.toLocaleString("id-ID")}**\n\n` +
              "**👍 Rating & Suara**\n" +
              `• \`Likes:\` **${likes.toLocaleString("id-ID")}**\n` +
              `• \`Dislikes:\` **${dislikes.toLocaleString("id-ID")}**\n` +
              `• \`Like Ratio:\` **${likeRatio}**`
            )
            .setFooter({ text: "LeonX Hub • Game Monitor" })
            .setTimestamp();

          if (iconUrl) {
            embed.setThumbnail(iconUrl);
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal memantau game Roblox:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat mengambil data game. Silakan coba beberapa saat lagi.");
        }
      }

      if (interaction.commandName === "game-servers") {
        const placeIdRaw = interaction.options.getString("place_id", true);
        const placeId = extractPlaceId(placeIdRaw);
        await interaction.deferReply();

        try {
          // Fetch public server list from Roblox API (excluding full servers to ensure availability)
          const serverResponse = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=10&excludeFullGames=true`);
          if (!serverResponse.ok) {
            throw new Error(`Roblox Server API error: ${serverResponse.statusText}`);
          }

          const serverData = await serverResponse.json() as {
            data: Array<{
              id: string;
              maxPlayers: number;
              playing: number;
              fps: number;
              ping: number;
            }>;
          };

          if (!serverData.data || serverData.data.length === 0) {
            await interaction.editReply(`❌ Tidak ada server aktif yang ditemukan untuk Place ID \`${placeId}\`.`);
            return;
          }

          // Filter out full servers and get up to 5 servers
          const availableServers = serverData.data
            .filter((s) => s.playing < s.maxPlayers)
            .slice(0, 5);

          if (availableServers.length === 0) {
            await interaction.editReply(`❌ Semua server aktif saat ini penuh untuk Place ID \`${placeId}\`.`);
            return;
          }

          const serversList = availableServers.map((s, idx) => ({
            num: idx + 1,
            playing: s.playing,
            max: s.maxPlayers,
            fps: s.fps.toFixed(1),
            ping: `${s.ping}ms`,
            joinUrl: `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${s.id}`
          }));

          const embed = new EmbedBuilder()
            .setTitle(`📈 Server Aktif — Place ID ${placeId}`)
            .setDescription(
              "Salin link di bawah ini, lalu buka di browser/Windows Run (Win + R) untuk langsung bergabung ke server:\n\n" +
              "**🖥️ List Server Aktif**\n\n" +
              serversList.map(srv =>
                `• \`Server #${srv.num}:\` (${srv.playing}/${srv.max} Players | FPS: ${srv.fps} | Ping: ${srv.ping})\n` +
                `\`\`\`text\n${srv.joinUrl}\n\`\`\``
              ).join("\n")
            )
            .setFooter({ text: "LeonX Hub • Server Tracker" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal mendapatkan server game:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat mengambil daftar server. Pastikan Place ID benar.");
        }
      }

      if (interaction.commandName === "send-rules") {
        if (interaction.user.id !== config.OWNER_ID) {
          await interaction.reply({
            content: "Hanya owner yang dapat mengirimkan rules.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const channelId = "1515261709147705537";
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel || !channel.isTextBased() || !channel.isSendable()) {
          await interaction.reply({
            content: "❌ Gagal: Channel rules tidak ditemukan atau bot tidak dapat mengirim pesan di sana.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const v2Rules = buildV2Container({
            title: "📖 LeonX Hub - Server Rules & Guidelines",
            description:
              "> ✨ **Selamat datang di server resmi LeonX Hub.** Server ini adalah wadah diskusi, pembaruan script, laporan bug, serta layanan bantuan bagi seluruh pengguna LeonX Hub.\n" +
              "> Harap luangkan waktu sejenak untuk membaca dan mematuhi peraturan kami demi menjaga kenyamanan bersama.",
            sections: [
              {
                title: "📜 ATURAN UTAMA SERVER",
                content:
                  "Dengan bergabung di server ini, Anda dianggap telah membaca dan menyetujui seluruh ketentuan di bawah ini:\n\n" +
                  "🚫 **1. Larangan Keras Crack, Leak, & Bypass**\n" +
                  "Dilarang keras mencoba melakukan cracking/dekripsi loader, membagikan/leaking script LeonX ke luar server, atau menggunakan bypass ilegal. Pelanggaran berat ini akan berakibat pada **Blacklist HWID + Roblox ID + Discord ID secara permanen** dari seluruh layanan kami.\n\n" +
                  "🤝 **2. Saling Menghormati & Jaga Etika**\n" +
                  "Gunakan bahasa yang sopan. Dilarang melakukan cyberbullying, harassment, memicu drama/debat kusir, toxic berlebih, SARA, atau mengirim konten NSFW/pornografi.\n\n" +
                  "🛡️ **3. Saluran Chat Sesuai Fungsi**\n" +
                  "Gunakan channel sesuai dengan tujuannya. Jangan melakukan spam chat, spam tag staf/developer tanpa alasan mendesak, atau membagikan iklan/link promosi server lain (Anti-Link aktif).\n\n" +
                  "🎫 **4. Penggunaan Sistem Ticket & Bug Report**\n" +
                  "Buka ticket support hanya untuk masalah teknis/transaksi yang mendesak. Kirim laporan bug nyata via `/bug-report`. Menyalahgunakan sistem tiket/laporan bug untuk spam atau bercanda akan dikenakan sanksi.\n\n" +
                  "🔒 **5. Keamanan Akun & Transaksi Resmi**\n" +
                  "Staf LeonX Hub **TIDAK PERNAH** meminta password akun Roblox atau token Discord Anda. Segala bentuk transaksi resmi hanya dilakukan melalui bot resmi atau langsung dengan Admin."
              },
              {
                title: "⚖️ SISTEM SANKSI & KONSEKUENSI",
                content:
                  "Moderator berhak mengambil keputusan mutlak berdasarkan pelanggaran yang Anda lakukan:\n" +
                  "• `/warn` - Pelanggaran Ringan: Peringatan tertulis (Warning) via database bot.\n" +
                  "• `/timeout` - Pelanggaran Sedang: Timeout (Mute otomatis) mulai dari 10 menit hingga 7 hari.\n" +
                  "• `/blacklist` - Pelanggaran Berat: Kick, Banned permanen dari Discord, serta Blacklist HWID & Roblox ID di server database game."
              }
            ],
            footer: "LeonX Hub • Official Guidelines"
          });

          await (channel as TextChannel).send(v2Rules);
          await interaction.editReply({
            content: `✅ Sukses mengirimkan rules ke channel <#${channelId}>.`
          });
        } catch (error) {
          console.error("Gagal mengirimkan rules:", error);
          await interaction.editReply({
            content: "❌ Terjadi kesalahan saat mengirimkan rules ke channel."
          });
        }
      }

      if (interaction.commandName === "monitor") {
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
          const placeIdRaw = interaction.options.getString("place_id", true);
          const placeId = extractPlaceId(placeIdRaw);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            // Get Universe ID from Place ID using public API
            const detailsResponse = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
            if (!detailsResponse.ok) {
              throw new Error(`Roblox API error: ${detailsResponse.statusText}`);
            }

            const universeInfo = await detailsResponse.json() as { universeId?: number | null };
            if (!universeInfo || !universeInfo.universeId) {
              await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan.`);
              return;
            }

            const universeId = universeInfo.universeId;

            // Get Game Name
            const gameDetailsResponse = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            let gameName = "Unknown Game";
            let lastUpdated = new Date().toISOString();

            if (gameDetailsResponse.ok) {
              const gameDetails = await gameDetailsResponse.json() as {
                data: Array<{ name: string; updated: string }>
              };
              const firstItem = gameDetails.data[0];
              if (firstItem) {
                gameName = firstItem.name;
                lastUpdated = firstItem.updated;
              }
            }

            // Save to database
            db.prepare(`
              INSERT INTO monitored_places (place_id, name, universe_id, last_updated)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(place_id) DO UPDATE SET
                name = excluded.name,
                universe_id = excluded.universe_id,
                last_updated = excluded.last_updated
            `).run(placeId, gameName, universeId, lastUpdated);

            await interaction.editReply(`✅ Berhasil menambahkan **${gameName}** (\`${placeId}\`) ke daftar pemantauan update game.`);
          } catch (error) {
            console.error("Gagal menambahkan game ke pemantauan:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat mendaftarkan game ke pemantauan.");
          }
        }

        if (sub === "remove") {
          const placeIdRaw = interaction.options.getString("place_id", true);
          const placeId = extractPlaceId(placeIdRaw);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const result = db.prepare("DELETE FROM monitored_places WHERE place_id = ?").run(placeId);
            if (result.changes > 0) {
              await interaction.editReply(`✅ Berhasil menghapus Place ID \`${placeId}\` dari pemantauan.`);
            } else {
              await interaction.editReply(`❌ Place ID \`${placeId}\` tidak ditemukan dalam daftar pemantauan.`);
            }
          } catch (error) {
            console.error("Gagal menghapus game dari pemantauan:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat menghapus game dari pemantauan.");
          }
        }

        if (sub === "list") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const list = db.prepare("SELECT * FROM monitored_places ORDER BY created_at DESC").all() as Array<{
              place_id: string;
              name: string;
              universe_id: number;
              last_updated: string;
            }>;

            if (list.length === 0) {
              await interaction.editReply("ℹ️ Daftar pemantauan game saat ini kosong.");
              return;
            }

            const embed = new EmbedBuilder()
              .setTitle("🔍 Game Update Monitoring List")
              .setDescription(
                "Daftar game yang saat ini dipantau secara otomatis:\n\n" +
                "**🎮 Game Dipantau**\n\n" +
                list.map((item, idx) =>
                  `• \`${idx + 1}. ${item.name}:\` Place ID: \`${item.place_id}\` | Update: \`${new Date(item.last_updated).toLocaleString("id-ID")}\``
                ).join("\n")
              )
              .setFooter({ text: "LeonX Hub • Monitoring System" })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            console.error("Gagal mengambil daftar pemantauan:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat mengambil daftar pemantauan.");
          }
        }

        if (sub === "test") {
          const placeIdRaw = interaction.options.getString("place_id", true);
          const placeId = extractPlaceId(placeIdRaw);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const item = db.prepare("SELECT * FROM monitored_places WHERE place_id = ?").get(placeId) as {
              place_id: string;
              name: string;
              universe_id: number;
              last_updated: string;
            } | undefined;

            if (!item) {
              await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan dalam daftar pemantauan. Tambahkan terlebih dahulu menggunakan \`/monitor add\`.`);
              return;
            }

            // Set last_updated ke epoch agar loop mendeteksi perbedaan
            db.prepare("UPDATE monitored_places SET last_updated = ? WHERE place_id = ?")
              .run("1970-01-01T00:00:00.000Z", placeId);

            // Jalankan deteksi
            await checkMonitoredPlaces();

            await interaction.editReply(`✅ Berhasil mensimulasikan update untuk **${item.name}**! Silakan periksa channel <#1519980835116286053>.`);
          } catch (error) {
            console.error("Gagal menjalankan simulasi update:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat mensimulasikan update.");
          }
        }
      }

      if (interaction.commandName === "lock") {
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "❌ Target harus berupa text channel.", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
          const everyoneRole = interaction.guild!.roles.everyone;
          await (targetChannel as TextChannel).permissionOverwrites.edit(everyoneRole, {
            SendMessages: false
          });
          
          await interaction.editReply(`🔒 Channel <#${targetChannel.id}> berhasil dikunci.`);
          await (targetChannel as TextChannel).send("🔒 **Channel ini telah dikunci oleh administrator/staf.**");
        } catch (err: any) {
          console.error("Gagal mengunci channel:", err);
          await interaction.editReply(`❌ Gagal mengunci channel: ${err.message}`);
        }
      }

      if (interaction.commandName === "unlock") {
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "❌ Target harus berupa text channel.", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
          const everyoneRole = interaction.guild!.roles.everyone;
          await (targetChannel as TextChannel).permissionOverwrites.edit(everyoneRole, {
            SendMessages: null
          });
          
          await interaction.editReply(`🔓 Kunci channel <#${targetChannel.id}> berhasil dibuka.`);
          await (targetChannel as TextChannel).send("🔓 **Kunci channel ini telah dibuka. Member dapat mengirim pesan kembali.**");
        } catch (err: any) {
          console.error("Gagal membuka kunci channel:", err);
          await interaction.editReply(`❌ Gagal membuka kunci channel: ${err.message}`);
        }
      }
    }

    // Changelog button handler (Verify, Support, Bug Report)
    if (interaction.isButton() && interaction.customId.startsWith("changelog:")) {
      const [, action, channelId] = interaction.customId.split(":");
      if (channelId) {
        const labels: Record<string, string> = {
          verify: "Verify",
          support: "Support",
          bugreport: "Bug Report"
        };
        const label = labels[action ?? ""] ?? "Channel";
        await interaction.reply({
          content: `➡️ **${label}:** <#${channelId}>`,
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // Refresh script support status button handler
    if (interaction.isButton() && interaction.customId === "refresh_script_status") {
      const guildIcon = interaction.guild?.iconURL() ?? client.user?.displayAvatarURL();
      const v2Payload = buildSupportedGamesV2(undefined, guildIcon);
      await interaction.update(v2Payload);
      return;
    }

    // License Panel Button Handlers
    if (interaction.isButton() && interaction.customId === "license:get_key") {
      const userKey = getOrCreateUserKey(interaction.user.id);
      const ephemeralPayload = buildUserKeyEphemeral(userKey, interaction.user.id);
      await interaction.reply(ephemeralPayload);
      return;
    }

    if (interaction.isButton() && interaction.customId === "license:reset_hwid") {
      const result = resetUserKeyBinding(interaction.user.id);
      await interaction.reply({
        content: result.success ? `✅ **Sukses:** ${result.message}` : `⚠️ **Perhatian:** ${result.message}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === "license:info") {
      const info = getUserKeyInfo(interaction.user.id);
      if (!info) {
        getOrCreateUserKey(interaction.user.id);
        const newInfo = getUserKeyInfo(interaction.user.id);
        if (newInfo) {
          const ephemeralPayload = buildKeyInfoEphemeral(newInfo, interaction.user.id);
          await interaction.reply(ephemeralPayload);
          return;
        }
        await interaction.reply({
          content: "❌ Anda belum memiliki key terdaftar. Silakan klik **Get My Key** terlebih dahulu.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const ephemeralPayload = buildKeyInfoEphemeral(info, interaction.user.id);
      await interaction.reply(ephemeralPayload);
      return;
    }

    if (interaction.isButton() && interaction.customId === "license:copy_loader") {
      const userKey = getOrCreateUserKey(interaction.user.id);
      const code = `_G.Key = "${userKey}"\nloadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()`;
      await interaction.reply({
        content: `📋 **Script Loader Siap Pakai:**\n\`\`\`lua\n${code}\n\`\`\``,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === "license:games") {
      const guildIcon = interaction.guild?.iconURL() ?? client.user?.displayAvatarURL();
      const v2Payload = buildSupportedGamesV2(undefined, guildIcon);
      await interaction.reply({
        ...v2Payload,
        flags: (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) as any
      });
      return;
    }

    // Security Alert Button Handlers
    if (interaction.isButton() && interaction.customId.startsWith("security:unban:")) {
      if (!isStaff(interaction.member as GuildMember)) {
        await interaction.reply({ content: "❌ Anda tidak memiliki izin untuk melakukan aksi ini.", flags: MessageFlags.Ephemeral });
        return;
      }
      const rawIp = interaction.customId.replace("security:unban:", "").replace(/_/g, ":");
      const success = unbanIp(rawIp);
      await interaction.reply({
        content: success ? `🔓 IP \`${rawIp}\` berhasil di-unban oleh <@${interaction.user.id}>.` : `⚠️ IP \`${rawIp}\` sudah tidak ada di daftar blokir.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("security:blacklist_hwid:")) {
      if (!isStaff(interaction.member as GuildMember)) {
        await interaction.reply({ content: "❌ Anda tidak memiliki izin untuk melakukan aksi ini.", flags: MessageFlags.Ephemeral });
        return;
      }
      const hwid = interaction.customId.replace("security:blacklist_hwid:", "");
      addToBlacklist({ hwid, reason: `Security Alert Blacklist by ${interaction.user.tag}` });
      await interaction.reply({
        content: `⛔ HWID \`${hwid}\` berhasil dimasukkan ke daftar hitam (Blacklist) oleh <@${interaction.user.id}>.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === "verify:accept") {
      if (!config.VERIFIED_ROLE_ID || !(interaction.member instanceof GuildMember)) {
        await interaction.reply({ content: "Role verifikasi belum dikonfigurasi oleh admin.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
        await interaction.reply({ content: "Kamu sudah terverifikasi.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.member.roles.add(config.VERIFIED_ROLE_ID);
      await interaction.reply({ content: "Verifikasi berhasil. Selamat datang!", flags: MessageFlags.Ephemeral });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket:category") {
      if (!interaction.guild) return;

      const category = interaction.values[0] as TicketCategory;

      // Render ulang select menu agar pilihan kembali ke placeholder.
      // Tanpa ini Discord menyimpan kategori terakhir, sehingga kategori yang
      // sama tidak dapat dipilih lagi setelah ticket ditutup.
      await interaction.message.edit(await createTicketPanel()).catch((error) => {
        console.error("Gagal mereset pilihan kategori ticket:", error);
      });

      const existing = db.prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'")
        .get(interaction.guild.id, interaction.user.id) as { channel_id: string } | undefined;

      if (existing) {
        await interaction.reply({
          content: `Kamu sudah memiliki ticket aktif di <#${existing.channel_id}>`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { channel, categoryNumber } = await createTicketChannel(interaction.guild, interaction.user, category);

      db.prepare("INSERT INTO tickets (guild_id, user_id, channel_id, category, category_number) VALUES (?, ?, ?, ?, ?)")
        .run(interaction.guild.id, interaction.user.id, channel.id, category, categoryNumber);

      await interaction.editReply({
        content: `✅ Ticket berhasil dibuat: ${channel}\nKategori: ${TICKET_CATEGORIES[category].label}`
      });
    }

    if (interaction.isButton() && interaction.customId === "ticket:claim") {
      if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

      const ticketData = getOrRecoverTicket(interaction.channel);

      if (!ticketData) {
        await interaction.reply({
          content: "Data ticket tidak ditemukan. Pastikan tombol ini berada di channel ticket yang dibuat bot.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (ticketData.claimed_by) {
        await interaction.reply({
          content: `Ticket ini sudah di-claim oleh <@${ticketData.claimed_by}>`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ?")
        .run(interaction.user.id, interaction.channel.id);

      // Restriction: Only claimed staff + ticket creator + Owner role + Support role can view
      const permissions: any[] = [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ticketData.user_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
      ];

      if (config.OWNER_ROLE_ID) {
        permissions.push({
          id: config.OWNER_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
        });
      }

      if (config.SUPPORT_ROLE_ID) {
        permissions.push({
          id: config.SUPPORT_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
        });
      }

      await (interaction.channel as TextChannel).permissionOverwrites.set(permissions).catch(err => console.error("Gagal mengupdate izin channel ticket claim:", err));

      const v2Claim = buildV2Container({
        title: "✋ Ticket Diklaim",
        description: `<@${interaction.user.id}> telah mengklaim ticket ini dan akan segera membantu menyelesaikan masalah Anda.`,
        footer: "LeonX Hub • Support System"
      });

      await interaction.reply(v2Claim);
    }

    if (interaction.isButton() && interaction.customId === "ticket:close") {
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

      const ticketData = getOrRecoverTicket(interaction.channel);

      if (!ticketData) {
        await interaction.reply({
          content: "Data ticket tidak ditemukan. Pastikan tombol ini berada di channel ticket yang dibuat bot.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply({
        content: "🔒 **Closing Ticket...** Channel akan ditutup dan transcript dikirim via DM.",
        flags: MessageFlags.Ephemeral
      });

      const { transcript, ticketData: ticket } = await closeTicket(
        interaction.channel as TextChannel,
        interaction.user
      );

      // Send transcript & DM rating prompt to the ticket creator
      const user = await client.users.fetch(ticket.user_id).catch(() => null);
      if (user) {
        const transcriptAttachment = new AttachmentBuilder(
          Buffer.from(transcript, "utf-8"),
          { name: `ticket-${ticket.id}-transcript.html` }
        );

        const ratingEmbed = new EmbedBuilder()
          .setTitle(`🎫 Ticket #${ticket.id} Support Closed`)
          .setDescription(
            `Halo <@${user.id}>, ticket support Anda di **LeonX Hub** telah selesai dan ditutup.\n\n` +
            `📄 **File transcript percakapan** telah dilampirkan pada pesan ini.\n\n` +
            `⭐ **Bagaimana pelayanan support kami?**\n` +
            `Mohon berikan ulasan & rating bintang untuk membantu kami meningkatkan kualitas pelayanan:`
          )
          .setColor(0x2563eb)
          .setFooter({ text: "LeonX Hub • Ticket Support System" })
          .setTimestamp();

        await user.send({
          embeds: [ratingEmbed],
          files: [transcriptAttachment],
          components: [createRatingButtons(ticket.id)]
        }).catch(() => console.log(`Tidak dapat mengirim DM rating ke ${user.tag}`));
      }

      // Close & delete channel immediately after 3 seconds
      setTimeout(() => {
        interaction.channel?.delete().catch(() => undefined);
      }, 3000);
    }

    if (interaction.isButton() && (interaction.customId.startsWith("rating:") || interaction.customId.startsWith("ticket_rating:"))) {
      const parts = interaction.customId.split(":");
      let ticketId: number | null = null;
      let rating: number = 0;

      if (parts[0] === "ticket_rating") {
        ticketId = parseInt(parts[1] || "0");
        rating = parseInt(parts[2] || "0");
      } else {
        rating = parseInt(parts[1] || "0");
      }

      let ticketData: any = null;
      if (ticketId) {
        ticketData = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      } else if (interaction.channel) {
        ticketData = db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(interaction.channel.id);
      }

      if (!ticketData) {
        await interaction.reply({
          content: "Data ticket tidak ditemukan.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (ticketData.rating !== null) {
        await interaction.reply({
          content: "Anda sudah memberikan rating untuk ticket ini. Terima kasih!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      db.prepare("UPDATE tickets SET rating = ? WHERE id = ?").run(rating, ticketData.id);

      const thanksEmbed = new EmbedBuilder()
        .setTitle("✅ Terima Kasih atas Penilaian Anda!")
        .setDescription(`Rating Anda: **${"⭐".repeat(rating)} (${rating}/5)**\nUlasan Anda sangat berharga bagi tim LeonX Hub.`)
        .setColor(0x16a34a)
        .setFooter({ text: "LeonX Hub • Support Feedback" });

      await interaction.reply({
        embeds: [thanksEmbed]
      });

      // Send Review Log to TICKET_REVIEW_CHANNEL_ID or LOG_CHANNEL_ID
      const targetChannelId = config.TICKET_REVIEW_CHANNEL_ID || config.LOG_CHANNEL_ID;
      if (targetChannelId) {
        const logChannel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (logChannel?.isSendable()) {
          const v2RatingLog = buildV2Container({
            title: "⭐ Ulasan Ticket Baru Received",
            description: `Ulasan baru diterima dari <@${ticketData.user_id}> untuk Ticket **#${ticketData.id}**!`,
            sections: [
              {
                title: "📜 Detail Ulasan Support",
                content:
                  `• \`Ticket ID:\` **#${ticketData.id}**\n` +
                  `• \`Kategori:\` **${TICKET_CATEGORIES[ticketData.category as TicketCategory]?.label || ticketData.category}**\n` +
                  `• \`Rating:\` **${"⭐".repeat(rating)} (${rating}/5)**\n` +
                  `• \`Pembuat Ticket:\` <@${ticketData.user_id}>\n` +
                  `• \`Staff Claim:\` ${ticketData.claimed_by ? `<@${ticketData.claimed_by}>` : "Unclaimed"}`
              }
            ],
            footer: "LeonX Hub • Review Log"
          });

          await logChannel.send(v2RatingLog);
        }
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "bug:submit") {
      const title = interaction.fields.getTextInputValue("title");
      const description = interaction.fields.getTextInputValue("description");
      const steps = interaction.fields.getTextInputValue("steps");
      const result = db.prepare(
        "INSERT INTO bug_reports (guild_id, user_id, title, description, steps) VALUES (?, ?, ?, ?, ?)"
      ).run(interaction.guildId, interaction.user.id, title, description, steps);
      const channel = config.BUG_REPORT_CHANNEL_ID
        ? await client.channels.fetch(config.BUG_REPORT_CHANNEL_ID).catch(() => null)
        : null;
      const v2Report = buildV2Container({
        title: `🐛 Laporan Bug #${result.lastInsertRowid}: ${title}`,
        description: `Dilaporkan oleh: <@${interaction.user.id}> (\`${interaction.user.id}\`)`,
        sections: [
          {
            title: "📋 Deskripsi Masalah",
            content: description
          },
          {
            title: "🔄 Langkah Mengulang Bug",
            content: steps
          }
        ],
        footer: "LeonX Hub • Bug Report System"
      });

      let reportUrl: string | null = null;
      if (channel?.type === ChannelType.GuildForum) {
        const thread = await channel.threads.create({
          name: `#${result.lastInsertRowid} ${title}`.slice(0, 100),
          message: v2Report,
          reason: `Bug report #${result.lastInsertRowid}`
        });
        reportUrl = thread.url;
      } else if (channel?.isSendable()) {
        const message = await channel.send(v2Report);
        reportUrl = message.url;
      } else {
        throw new Error("BUG_REPORT_CHANNEL_ID bukan channel teks atau forum yang dapat digunakan.");
      }
      await interaction.reply({
        content:
          `Laporan bug #${result.lastInsertRowid} berhasil dibuat.\n` +
          `${reportUrl ? `[Buka laporan dan kirim gambar](${reportUrl})` : ""}`,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error(error);
    const message = { content: "Terjadi kesalahan saat menjalankan fitur ini.", flags: MessageFlags.Ephemeral } as const;
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(message).catch(() => undefined);
      else await interaction.reply(message).catch(() => undefined);
    }
  }
});

const userSpamCache = new Map<string, {
  timestamps: number[];
  lastContent: string;
  repeatCount: number;
}>();

const FAQ_RULES = [
  {
    keywords: [
      "ambil script",
      "cara ambil script",
      "dapat script",
      "dapetin script",
      "dapat key",
      "cara dapat key",
      "cara dapetin key",
      "cara verifikasi",
      "get script",
      "how to get script",
      "get key"
    ],
    response: `Untuk mendapatkan script, silakan ikuti langkah berikut:\n` +
              `1. Verifikasi akun Anda di channel <#${config.VERIFY_CHANNEL_ID}> dengan menekan tombol verifikasi atau mengetik \`/verify\`.\n` +
              `2. Gunakan slash command \`/script\` di channel bot untuk mendapatkan loader script dan key khusus Anda melalui DM.\n` +
              `3. Jangan bagikan key tersebut kepada siapa pun!`
  },
  {
    keywords: [
      "script error",
      "ga jalan",
      "gagal execute",
      "tidak berfungsi",
      "tidak bisa di-execute",
      "gabisa di execute",
      "error execute",
      "script crash",
      "execute error"
    ],
    response: `Jika script tidak berjalan atau error, silakan periksa hal berikut:\n` +
              `- Pastikan Anda sudah mengatur \`_G.Key = "KEY_ANDA"\` di baris pertama sebelum baris \`loadstring\`.\n` +
              `- Pastikan executor Roblox Anda didukung dan versi terbaru.\n` +
              `- Jika masih terjadi kendala, silakan buat tiket bantuan di channel <#${config.TICKET_CHANNEL_ID || "support"}>.`
  },
  {
    keywords: [
      "reset hwid",
      "reset key",
      "ganti perangkat",
      "ganti device",
      "reset device",
      "hwid reset"
    ],
    response: `Anda dapat mereset data HWID atau Roblox ID yang tertaut pada key Anda menggunakan slash command \`/resethwid\` (Batas 1x / 10 menit). Setelah di-reset, jalankan kembali script di Roblox untuk menautkan perangkat/akun baru.`
  },
  {
    keywords: [
      "link website",
      "link web",
      "website leonthings",
      "web leonthings",
      "url website",
      "url web",
      "website bot",
      "web bot",
      "link bot",
      "halaman bot",
      "halaman web"
    ],
    response: `Silakan kunjungi website resmi kami di:\n` +
              `🌐 Website Utama: https://leonthings.my.id\n` +
              `🤖 Bot Console / Kelola Key & Reset HWID: https://script.leonthings.my.id`
  }
];

async function handleTicketAiResponse(message: Message, ticket: TicketRecord) {
  if (!config.GROQ_API_KEY) return;

  if ("sendTyping" in message.channel) {
    await (message.channel as TextChannel).sendTyping().catch(() => null);
  }

  try {
    const userMessage = message.content.trim();
    if (!userMessage) return;

    const catKey = ticket.category as TicketCategory;
    const categoryInfo = TICKET_CATEGORIES[catKey] || TICKET_CATEGORIES.general;
    const categoryLabel = categoryInfo.label;

    const isEngTicket = isEnglishText(userMessage);
    const systemPrompt = `You are an official support assistant for the LeonX Hub Discord server (a premium Roblox Script Hub).
The user opened a support ticket under category: "${categoryLabel}".
Latest user message:
"${userMessage}"

${isEngTicket ? `🔴 CRITICAL LANGUAGE DIRECTIVE: The user asked in ENGLISH. You MUST reply 100% in natural ENGLISH. Do NOT use Indonesian words.` : `🟢 CRITICAL LANGUAGE DIRECTIVE: Respond in friendly, casual INDONESIAN.`}

LANGUAGE & TONE INSTRUCTIONS (NATURAL & HUMAN-LIKE):
- Automatically detect the user's language.
- If the user wrote in English, respond in friendly, natural, helpful English (like a friendly senior Discord support staff).
- If the user wrote in Indonesian, respond in friendly, casual, helpful Indonesian.
- ABSOLUTELY DO NOT use robotic AI greetings like "Hello! I am LeonX AI Ticket Assistant...", "Halo! Saya LeonX AI Ticket Assistant...", etc.
- Get straight to the point with helpful troubleshooting guidance without robotic fluff.
- Avoid overusing bold headings or stiff lists. Keep responses concise and easy to read.

TROUBLESHOOTING GUIDE:
1. If asking how to get key / script:
   - Indonesian: Explain they can verify with /verify and then run /script to get their key & loader via DM.
   - English: Explain they can verify using /verify and then run /script to receive their key & loader via DM.
2. If script error / not executing:
   - Remind them to put \`_G.Key = "YOUR_LICENSE_KEY"\` at the very first line before loadstring.
   - Ensure their Roblox executor supports loadstring & is updated.
3. If HWID Error / Key bound to another device:
   - Explain how to reset HWID using /resethwid in Discord or via the official web console (https://script.leonthings.my.id).
4. At the end of your response, remind them naturally in their language that human support staff will also arrive shortly if their issue is not resolved yet.`;

    const groqResult = await callGroqAPI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]);

    if (groqResult.ok) {
      const finalReply = (groqResult.text || "Sorry, I am unable to respond at the moment.").trim();

      const v2Ai = buildV2Container({
        title: "🤖 AI Support Assistant",
        description: finalReply,
        sections: [
          {
            title: "📌 Catatan / Note",
            content: "*Tim support manusia akan segera membantu jika masalah belum teratasi / Human support staff will also assist you shortly if needed.*"
          }
        ],
        footer: "LeonX Hub • AI Support Assistant"
      });

      await message.reply(v2Ai);
    } else {
      console.error("Groq API Error in Ticket Assistant:", groqResult.error);
    }
  } catch (err) {
    console.error("Error in handleTicketAiResponse:", err);
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const channelName = "name" in message.channel ? message.channel.name : "DM/Private";
  console.log(`[DEBUG] Message received from ${message.author.tag} in channel #${channelName} (${message.channel.id}): "${message.content}"`);

  if (!message.guild) return;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  // ── Prefix Command Handler ($) ──
  const PREFIX = "$";
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    // Track command usage
    db.prepare(`
      INSERT INTO command_usage (command, uses) VALUES (?, 1)
      ON CONFLICT(command) DO UPDATE SET uses = uses + 1
    `).run(cmd);

    // $help
    if (cmd === "help") {
      const ownerRoleId = config.OWNER_ROLE_ID || "1515320851656872066";
      const isOwner =
        (ownerRoleId ? member.roles.cache.has(ownerRoleId) : false) ||
        member.roles.cache.some(r => r.name.toLowerCase().includes("owner")) ||
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        message.guild.ownerId === member.id;

      const sections = [
        {
          title: "📌 Perintah Umum & Informasi",
          content:
            "• `$help` — Menampilkan daftar perintah bot ini\n" +
            "• `$status` — Melihat status operasional script & bot\n" +
            "• `$website` — Menampilkan link resmi website & bot console\n" +
            "• `$faq [topik]` — Melihat informasi FAQ (misal: `$faq script`, `$faq error`)"
        },
        {
          title: "🎮 Perintah Roblox",
          content:
            "• `$roblox <username>` — Lookup profil Roblox, statistik, RAP, & riwayat nama"
        }
      ];

      if (isOwner) {
        sections.push({
          title: "🛡️ Perintah Moderator / Admin",
          content:
            "• `$stats` — Melihat ringkasan statistik komunitas & bot"
        });
      }

      const v2Help = buildV2Container({
        title: "📖 Daftar Perintah Bot (Prefix: `$`)",
        description: "Berikut adalah daftar perintah prefix yang dapat Anda gunakan di server ini:",
        sections,
        footer: "LeonX Hub • Command List"
      });
      await message.reply(v2Help);
      return;
    }

    // $roblox <username>
    if (cmd === "roblox") {
      const username = args[0];
      if (!username) {
        await message.reply("❌ Gunakan: `$roblox <username>`");
        return;
      }

      try {
        const loadingMsg = await message.reply("🔍 Mencari profil Roblox...");

        const userSearchResponse = await fetch("https://users.roblox.com/v1/usernames/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
        });

        if (!userSearchResponse.ok) throw new Error("API error");

        const searchResult = await userSearchResponse.json() as {
          data: Array<{ id: number; name: string; displayName: string; hasVerifiedBadge?: boolean }>
        };

        if (!searchResult.data?.[0]) {
          await loadingMsg.edit(`❌ Pengguna Roblox \`${username}\` tidak ditemukan.`);
          return;
        }

        const userId = searchResult.data[0].id;

        const userDetailsResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (!userDetailsResponse.ok) throw new Error("API error");

        const details = await userDetailsResponse.json() as {
          description: string; created: string; isBanned: boolean;
          displayName: string; name: string; hasVerifiedBadge?: boolean;
        };

        const avatarResponse = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png&isCircular=false`
        );

        let avatarUrl: string | undefined;
        if (avatarResponse.ok) {
          const avatarResult = await avatarResponse.json() as { data: Array<{ imageUrl: string }> };
          avatarUrl = avatarResult.data?.[0]?.imageUrl;
        }

        const [followersRes, followingRes, friendsRes, collectiblesRes, historyRes] = await Promise.all([
          fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).catch(() => null),
          fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).catch(() => null),
          fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).catch(() => null),
          fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`).catch(() => null),
          fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=10`).catch(() => null)
        ]);

        let followersCount = "N/A";
        if (followersRes?.ok) { const d = await followersRes.json() as { count: number }; followersCount = d.count.toLocaleString("id-ID"); }
        let followingCount = "N/A";
        if (followingRes?.ok) { const d = await followingRes.json() as { count: number }; followingCount = d.count.toLocaleString("id-ID"); }
        let friendsCount = "N/A";
        if (friendsRes?.ok) { const d = await friendsRes.json() as { count: number }; friendsCount = d.count.toLocaleString("id-ID"); }

        let rapText = "None / 🔒 Private";
        if (collectiblesRes?.ok) {
          const d = await collectiblesRes.json() as { data: Array<{ recentAveragePrice?: number; value?: number }> };
          if (d.data?.length) {
            const totalRap = d.data.reduce((sum, item) => sum + (item.recentAveragePrice || item.value || 0), 0);
            rapText = totalRap > 0 ? `${totalRap.toLocaleString("id-ID")} Robux` : "None";
          } else { rapText = "None"; }
        } else if (collectiblesRes?.status === 403) { rapText = "🔒 Private"; }

        let historyText = "Tidak ada riwayat nama.";
        if (historyRes?.ok) {
          const d = await historyRes.json() as { data: Array<{ name: string }> };
          if (d.data?.length) { historyText = d.data.map(item => `\`${item.name}\``).join(", "); }
        }

        const creationDate = new Date(details.created);

        const v2Profile = buildV2Container({
          title: `👤 Roblox Profile - ${details.displayName}${details.hasVerifiedBadge ? " ☑️" : ""}`,
          thumbnailUrl: avatarUrl,
          description:
            `@${details.name} • \`ID:\` \`${userId}\` • Status: ${details.isBanned ? "🔴 **Banned**" : "🟢 **Aktif**"}\n\n` +
            (details.description ? `> *${details.description.slice(0, 300)}*` : ""),
          sections: [
            {
              title: "📊 Statistik Akun",
              content:
                `• \`Teman:\` **${friendsCount}**\n` +
                `• \`Pengikut:\` **${followersCount}**\n` +
                `• \`Mengikuti:\` **${followingCount}**\n` +
                `• \`RAP Collectibles:\` **${rapText}**\n` +
                `• \`Tanggal Dibuat:\` **${creationDate.toLocaleDateString("id-ID")}**`
            },
            {
              title: "🏷️ Riwayat Nama",
              content: historyText
            }
          ],
          footer: "LeonX Hub • Roblox Lookup"
        });

        await loadingMsg.delete().catch(() => null);
        await message.reply(v2Profile);
      } catch {
        await message.reply("❌ Terjadi kesalahan saat menghubungi server Roblox.");
      }
      return;
    }

    // $status
    if (cmd === "status") {
      const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
      const dbReason = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status_reason'").get() as { value: string } | undefined;
      const statusVal = dbStatus?.value || "operational";
      const reasonVal = dbReason?.value || "Semua sistem berjalan dengan normal.";
      let statusText = "🟢 Operational";
      if (statusVal === "testing") statusText = "🟡 Testing / Updating";
      else if (statusVal === "maintenance") statusText = "🔴 Maintenance / Patched";

      const v2Status = buildV2Container({
        title: "📊 Status Script & Bot System",
        description: "Berikut adalah status terkini dari seluruh infrastruktur LeonX Hub.",
        sections: [
          { title: "🟢 Status Layanan", content: `• \`LeonX Hub Script:\` ${statusText}\n• \`Bot Discord:\` 🟢 **Online**` },
          { title: "📝 Catatan Sistem", content: `*${reasonVal}*` }
        ],
        footer: "LeonX Hub • Status Monitor"
      });
      await message.reply(v2Status);
      return;
    }

    // $key
    if (cmd === "key") {
      const keyData = db.prepare("SELECT * FROM license_keys WHERE discord_id = ?").get(message.author.id) as any;
      if (!keyData) {
        await message.reply("❌ Anda belum memiliki key lisensi. Gunakan `/script` untuk mendapatkan key.");
        return;
      }

      const totalExec = (db.prepare("SELECT COUNT(*) AS count FROM execution_logs WHERE key = ?").get(keyData.key) as { count: number }).count;
      let cooldownText = "✅ Ready";
      if (keyData.last_reset) {
        const lastReset = new Date(keyData.last_reset + " UTC").getTime();
        const now = Date.now();
        const diff = 24 * 60 * 60 * 1000 - (now - lastReset);
        if (diff > 0) {
          const hours = Math.floor(diff / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          cooldownText = `⏳ ${hours}h ${mins}m`;
        }
      }

      const last5 = db.prepare("SELECT * FROM execution_logs WHERE key = ? ORDER BY executed_at DESC LIMIT 5").all(keyData.key) as any[];
      let historyText = "Belum ada riwayat eksekusi.";
      if (last5.length > 0) {
        historyText = last5.map(ex => {
          const utcTime = ex.executed_at.endsWith(" UTC") ? ex.executed_at : ex.executed_at + " UTC";
          const date = new Date(utcTime).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
          return `• **${date}**\n  └─ Game: [${ex.place_id}](https://www.roblox.com/games/${ex.place_id}) | Executor: \`${ex.executor}\` | Roblox: [${ex.roblox_username || "Unknown"}](https://www.roblox.com/users/${ex.roblox_id}/profile)`;
        }).join("\n");
      }

      const v2Key = buildV2Container({
        title: "🔑 Informasi Key & Lisensi Anda",
        description: "Berikut adalah detail lisensi dan aktivitas penggunaan script Anda.",
        sections: [
          {
            title: "🔑 Informasi Lisensi",
            content:
              `• \`Key Lisensi:\` \`||${keyData.key}||\` *(Klik untuk menyalin)*\n` +
              `• \`Akun Roblox:\` ${keyData.roblox_id ? `[Profil Roblox](https://www.roblox.com/users/${keyData.roblox_id}/profile) (\`${keyData.roblox_id}\`)` : "🔴 Belum tertaut"}\n` +
              `• \`Perangkat (HWID):\` ${keyData.hwid ? `\`${keyData.hwid}\`` : "🔴 Belum tertaut"}\n` +
              `• \`Cooldown Reset:\` ${cooldownText}\n` +
              `• \`Total Eksekusi:\` \`${totalExec}\` kali\n` +
              `• \`Dibuat Pada:\` \`${new Date(keyData.created_at + " UTC").toLocaleString("id-ID", { dateStyle: "medium" })}\``
          },
          { title: "📜 Riwayat 5 Eksekusi Terakhir", content: historyText }
        ],
        footer: "LeonX Hub • License System"
      });
      await message.reply(v2Key);
      return;
    }

    // $faq <topic>
    if (cmd === "faq") {
      const topic = args[0]?.toLowerCase();
      if (!topic) {
        const topics = Object.keys(faq).map(t => `\`${t}\``).join(", ");
        await message.reply(`📋 Topik yang tersedia: ${topics}\nGunakan: \`$faq <topik>\``);
        return;
      }
      const faqAnswer = faq[topic];
      if (!faqAnswer) {
        await message.reply("❌ Topik tidak ditemukan.");
        return;
      }
      const v2Faq = buildV2Container({
        title: `💡 FAQ — ${topic}`,
        description: `Berikut adalah informasi mengenai topik **${topic}**:\n\n${faqAnswer}`,
        footer: "LeonX Hub • FAQ System"
      });
      await message.reply(v2Faq);
      return;
    }

    // $website
    if (cmd === "website") {
      const v2Web = buildV2Container({
        title: "🌐 LeonThings Official Website",
        description: "Silakan gunakan tautan resmi di bawah ini untuk mengakses layanan kami:",
        sections: [
          {
            title: "🔗 Link Resmi",
            content:
              "• **Website Utama:** https://leonthings.my.id\n" +
              "• **Bot Console & HWID Reset:** https://script.leonthings.my.id"
          }
        ],
        footer: "LeonX Hub • Official Links"
      });
      await message.reply(v2Web);
      return;
    }

    // $stats (admin / owner only)
    if (cmd === "stats") {
      const ownerRoleId = config.OWNER_ROLE_ID || "1515320851656872066";
      const isOwner =
        (ownerRoleId ? member.roles.cache.has(ownerRoleId) : false) ||
        member.roles.cache.some(r => r.name.toLowerCase().includes("owner")) ||
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        message.guild.ownerId === member.id;

      if (!isOwner) {
        await message.reply("❌ Anda tidak memiliki izin untuk melihat statistik admin.");
        return;
      }
      const openTickets = (db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE status = 'open'").get() as { count: number }).count;
      const reports = (db.prepare("SELECT COUNT(*) AS count FROM bug_reports").get() as { count: number }).count;
      const uses = (db.prepare("SELECT COALESCE(SUM(uses), 0) AS count FROM command_usage").get() as { count: number }).count;

      const v2Stats = buildV2Container({
        title: "📊 Statistik Admin Server",
        description: "Ringkasan statistik aktivitas bot dan server:",
        sections: [
          {
            title: "👥 Statistik Komunitas & Bot",
            content:
              `• \`Total Member:\` **${message.guild.memberCount}** member\n` +
              `• \`Ticket Aktif:\` **${openTickets}** ticket\n` +
              `• \`Laporan Bug:\` **${reports}** laporan\n` +
              `• \`Command Dipakai:\` **${uses}** eksekusi`
          }
        ],
        footer: "LeonX Hub • Admin Dashboard"
      });
      await message.reply(v2Stats);
      return;
    }

    // Unknown prefix command — ignore silently
    return;
  }

  // Check if message is in a ticket channel
  if (message.channel.type === ChannelType.GuildText) {
    const ticketData = getOrRecoverTicket(message.channel as TextChannel);
    if (ticketData && ticketData.status === "open" && !ticketData.claimed_by) {
      if (message.author.id === ticketData.user_id) {
        if (!onCooldown(message.author.id, "ticket_ai", 3000)) {
          await handleTicketAiResponse(message, ticketData);
        }
        return;
      }
    }
  }

  // AI Chatbot Integration - Only trigger in the specified AI channel without requiring tag/prefix
  const isAiChannel = config.AI_CHANNEL_ID && message.channel.id === config.AI_CHANNEL_ID;

  if (isAiChannel && config.GROQ_API_KEY) {
    if (onCooldown(message.author.id, "ai_chat", 5000)) {
      await message.react("⏳").catch(() => null);
      return;
    }
    // Show typing status
    await message.channel.sendTyping().catch(() => null);

    try {
      const userMessage = message.content.replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), "").trim();
      if (!userMessage) return; // Ignore empty messages in AI channel

      const systemPrompt = buildAiSystemPrompt(userMessage);

      const groqResult = await callGroqAPI([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]);

      if (groqResult.ok) {
        const replyText = groqResult.text || "Maaf, tidak dapat memahami pertanyaan tersebut. Silakan coba lagi.";
        let finalReply = replyText.trim();

        const actionSendScriptRegex = /\[\s*ACTION\s*:\s*SEND_SCRIPT\s*\]/i;
        const actionResetHwidRegex = /\[\s*ACTION\s*:\s*RESET_HWID\s*\]/i;
        const actionCheckKeyRegex = /\[\s*ACTION\s*:\s*CHECK_MY_KEY\s*\]/i;
        const actionGetStatsRegex = /\[\s*ACTION\s*:\s*GET_STATS\s*\]/i;

        // Guardrail checks: Only allow actions if user explicitly requested them
        if (actionSendScriptRegex.test(finalReply) && !hasExplicitScriptRequest(userMessage)) {
          finalReply = finalReply.replace(actionSendScriptRegex, "").trim();
        }
        if (actionResetHwidRegex.test(finalReply) && !hasExplicitHwidResetRequest(userMessage)) {
          finalReply = finalReply.replace(actionResetHwidRegex, "").trim();
        }
        if (actionCheckKeyRegex.test(finalReply) && !hasExplicitCheckKeyRequest(userMessage)) {
          finalReply = finalReply.replace(actionCheckKeyRegex, "").trim();
        }

        const isEng = isEnglishText(userMessage);

        // 1. Action: SEND_SCRIPT
        if (actionSendScriptRegex.test(finalReply)) {
          const blacklistCheck = isBlacklisted({ discordId: message.author.id });
          if (blacklistCheck.blacklisted) {
            finalReply = finalReply.replace(
              actionSendScriptRegex,
              isEng
                ? `\n\n❌ **Access Denied:** Your Discord account is blacklisted.\nReason: *${blacklistCheck.reason}*`
                : `\n\n❌ **Akses ditolak:** Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`
            );
          } else {
            const hasRole = !config.VERIFIED_ROLE_ID || (member && member.roles.cache.has(config.VERIFIED_ROLE_ID));
            if (!hasRole) {
              finalReply = finalReply.replace(
                actionSendScriptRegex,
                isEng
                  ? `\n\n❌ **Failed:** You must complete verification first in channel <#${config.VERIFY_CHANNEL_ID}>.`
                  : `\n\n❌ **Gagal:** Anda harus melakukan verifikasi terlebih dahulu di channel <#${config.VERIFY_CHANNEL_ID}>.`
              );
            } else {
              try {
                const userKey = getOrCreateUserKey(message.author.id);
                const v2DmScript = buildV2Container({
                  title: isEng ? "🔑 LeonX Hub Loader & Key" : "🔑 LeonX Hub Loader & Key",
                  description: isEng
                    ? "Here is your exclusive script loader. *Do not share this key with anyone!*"
                    : "Berikut adalah loader script khusus untuk Anda. *Jangan bagikan key ini kepada siapapun!*",
                  sections: [
                    {
                      title: isEng ? "📜 Script Loader (Lua)" : "📜 Script Loader (Lua)",
                      content:
                        "```lua\n" +
                        `_G.Key = "${userKey}"\n` +
                        'loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()\n' +
                        "```"
                    }
                  ],
                  footer: "LeonX Hub • License System"
                });
                await message.author.send(v2DmScript);
                finalReply = finalReply.replace(
                  actionSendScriptRegex,
                  isEng
                    ? `\n\n🔑 **Success!** Your script loader and license key have been sent to your DMs privately. Please check your inbox.`
                    : `\n\n🔑 **Sukses!** Loader script dan key lisensi Anda telah dikirimkan secara pribadi ke DM Anda. Silakan periksa pesan masuk Anda.`
                );
              } catch (dmErr) {
                finalReply = finalReply.replace(
                  actionSendScriptRegex,
                  isEng
                    ? `\n\n❌ **Failed:** The bot could not send a DM to you. Please make sure your server DMs are enabled.`
                    : `\n\n❌ **Gagal:** Bot tidak dapat mengirim pesan ke DM Anda. Pastikan pengaturan privasi DM Anda untuk server ini diaktifkan.`
                );
              }
            }
          }
        }

        // 2. Action: GET_STATS
        if (actionGetStatsRegex.test(finalReply)) {
          try {
            const guildCount = client.guilds.cache.size;
            const activeKeys = db.prepare("SELECT COUNT(*) as count FROM user_keys").get() as { count: number } | undefined;
            const totalKeys = activeKeys?.count || 0;
            const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
            
            let uptimeString = "0s";
            if (client.uptime) {
              const secs = Math.floor(client.uptime / 1000);
              const mins = Math.floor(secs / 60);
              const hours = Math.floor(mins / 60);
              const days = Math.floor(hours / 24);
              if (isEng) {
                uptimeString = days > 0 
                  ? `${days}d ${hours % 24}h`
                  : hours > 0 
                  ? `${hours}h ${mins % 60}m`
                  : `${mins}m ${secs % 60}s`;
              } else {
                uptimeString = days > 0 
                  ? `${days}hari ${hours % 24}jam`
                  : hours > 0 
                  ? `${hours}jam ${mins % 60}menit`
                  : `${mins}menit ${secs % 60}detik`;
              }
            }

            const statsBlock = isEng
              ? `\n\n📊 **LeonX Bot Live Server Stats:**\n` +
                `• Server Count: \`${guildCount}\`\n` +
                `• License Users (Keys): \`${totalKeys}\`\n` +
                `• System Uptime: \`${uptimeString}\`\n` +
                `• Memory Usage: \`${memoryUsageMB} MB\``
              : `\n\n📊 **Statistik Live Server LeonX Bot:**\n` +
                `• Jumlah Guild Server: \`${guildCount}\`\n` +
                `• Pengguna Lisensi (Keys): \`${totalKeys}\`\n` +
                `• Uptime Sistem: \`${uptimeString}\`\n` +
                `• Penggunaan Memory: \`${memoryUsageMB} MB\``;
              
            finalReply = finalReply.replace(actionGetStatsRegex, statsBlock);
          } catch (statsErr) {
            finalReply = finalReply.replace(
              actionGetStatsRegex,
              isEng ? `\n\n❌ Failed to fetch current server statistics.` : `\n\n❌ Gagal mengambil data statistik server saat ini.`
            );
          }
        }

        // 3. Action: RESET_HWID
        if (actionResetHwidRegex.test(finalReply)) {
          const blacklistCheck = isBlacklisted({ discordId: message.author.id });
          if (blacklistCheck.blacklisted) {
            finalReply = finalReply.replace(
              actionResetHwidRegex,
              isEng ? `\n\n❌ **Failed:** Your account is blacklisted.` : `\n\n❌ **Gagal:** Akun Anda di-blacklist.`
            );
          } else {
            const hasRole = !config.VERIFIED_ROLE_ID || (member && member.roles.cache.has(config.VERIFIED_ROLE_ID));
            if (!hasRole) {
              finalReply = finalReply.replace(
                actionResetHwidRegex,
                isEng ? `\n\n❌ **Failed:** Please complete verification first.` : `\n\n❌ **Gagal:** Silakan verifikasi terlebih dahulu.`
              );
            } else {
              const isOwner = isUserOwnerOrAdmin(message.author.id, member);
              const resetResult = resetUserKeyBinding(message.author.id, isOwner);
              if (resetResult.success) {
                finalReply = finalReply.replace(
                  actionResetHwidRegex,
                  isEng
                    ? `\n\n🔄 **HWID Reset Successful!** Please execute the script again in Roblox to bind your new device/account.${isOwner ? " *(Owner Bypass Active)*" : ""}`
                    : `\n\n🔄 **HWID Reset Sukses!** Silakan jalankan kembali script di Roblox untuk menautkan perangkat/akun baru Anda.${isOwner ? " *(Owner Bypass Active)*" : ""}`
                );
              } else {
                finalReply = finalReply.replace(
                  actionResetHwidRegex,
                  isEng
                    ? `\n\n❌ **Failed to reset HWID:** ${resetResult.message}`
                    : `\n\n❌ **Gagal reset HWID:** ${resetResult.message}`
                );
              }
            }
          }
        }

        // 4. Action: CHECK_MY_KEY
        if (actionCheckKeyRegex.test(finalReply)) {
          try {
            const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(message.author.id) as {
              key: string;
              roblox_id: string | null;
              hwid: string | null;
              last_reset_at: string | null;
            } | undefined;

            if (!row) {
              finalReply = finalReply.replace(
                "[ACTION: CHECK_MY_KEY]",
                isEng
                  ? `\n\n🔑 You do not have a registered key yet. Please ask for the script first so a key is created automatically.`
                  : `\n\n🔑 Anda belum memiliki key terdaftar. Silakan minta script terlebih dahulu agar key dibuat otomatis.`
              );
            } else {
              let cooldownRemainingMinutes = 0;
              if (row.last_reset_at) {
                const lastReset = new Date(row.last_reset_at).getTime();
                const now = Date.now();
                const diffMinutes = (now - lastReset) / (1000 * 60);
                if (diffMinutes < 10) {
                  cooldownRemainingMinutes = Math.ceil(10 - diffMinutes);
                }
              }

              const infoBlock = isEng
                ? `\n\n🔑 **Your License Key Info:**\n` +
                  `• **Key**: \`LEONX-••••-••••-••••\` (Censored for security, full details sent to DM!)\n` +
                  `• **Roblox ID**: \`${row.roblox_id || "Not Linked"}\`\n` +
                  `• **HWID**: \`${row.hwid || "Not Linked"}\`\n` +
                  `• **Reset Cooldown**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} minute(s)` : "Ready"}\``
                : `\n\n🔑 **Informasi Lisensi Key Anda:**\n` +
                  `• **Key**: \`LEONX-••••-••••-••••\` (Disensor demi keamanan, detail lengkap telah dikirimkan ke DM Anda!)\n` +
                  `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                  `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                  `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready (Bebas Cooldown)"}\``;
                
              finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", infoBlock);

              try {
                const dmContent = isEng
                  ? `🔑 **Your License Key Info (Private Details):**\n` +
                    `• **Key**: \`${row.key}\` (Do not share this key with anyone!)\n` +
                    `• **Roblox ID**: \`${row.roblox_id || "Not Linked"}\`\n` +
                    `• **HWID**: \`${row.hwid || "Not Linked"}\`\n` +
                    `• **Reset Cooldown**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} minute(s)` : "Ready"}\``
                  : `🔑 **Informasi Lisensi Key Anda (Detail Privasi):**\n` +
                    `• **Key**: \`${row.key}\` (Jangan bagikan key ini kepada siapapun!)\n` +
                    `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                    `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                    `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready"}\``;
                await message.author.send(dmContent);
              } catch (dmErr) {
                console.log(`Failed to DM key info to ${message.author.tag}:`, dmErr);
              }
            }
          } catch (keyErr) {
            finalReply = finalReply.replace(
              "[ACTION: CHECK_MY_KEY]",
              isEng ? `\n\n❌ Failed to load key info.` : `\n\n❌ Gagal memuat info key Anda.`
            );
          }
        }

        if (finalReply.length > 2000) {
          const chunks = finalReply.match(/[\s\S]{1,1950}/g) || [finalReply];
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(finalReply);
        }
      } else {
        const isEng = isEnglishText(userMessage);
        const errMsg = groqResult.error === "timeout"
          ? (isEng ? "Sorry, AI response timed out. Please try again later." : "Maaf, AI sedang lambat merespons (timeout). Silakan coba lagi nanti.")
          : (isEng ? "Sorry, a connection error occurred while reaching the AI module. Please try again shortly." : "Maaf, terjadi kesalahan koneksi saat menghubungi modul AI saya. Silakan coba sesaat lagi.");
        await message.reply(errMsg);
      }
    } catch (err) {
      console.error("AI Chatbot error:", err);
      await message.reply("Maaf, terjadi error internal dalam sistem chatbot AI. Hubungi staf jika masalah berlanjut.");
    }
    return;
  }

  // Lewati pengecekan jika pengirim adalah owner atau staf dengan permission ManageMessages
  if (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.id === config.OWNER_ID
  ) {
    return;
  }

  // 0. Auto-Ban Kata Terlarang (selingkuh)
  if (message.content.toLowerCase().includes("selingkuh")) {
    try {
      await message.delete().catch(() => null);
      await message.author.send("Anda telah di-ban secara otomatis dari server karena mengucapkan kata terlarang (selingkuh).").catch(() => null);
      await member.ban({ reason: "Mengucapkan kata terlarang (selingkuh) - Auto Ban" });
      await message.channel.send(`🚨 <@${message.author.id}> telah di-ban secara otomatis karena mengucapkan kata terlarang.`);
      
        if (config.LOG_CHANNEL_ID) {
          const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
          if (logChannel?.isSendable()) {
            const v2Log = buildV2Container({
              title: "🛡️ Auto Mod: Banned User",
              description: `Pengguna <@${message.author.id}> di-ban otomatis karena menulis kata terlarang (selingkuh).`,
              footer: "LeonX Hub • Auto Mod"
            });
            await logChannel.send(v2Log);
          }
        }
    } catch (err) {
      console.error("Gagal melakukan auto-ban:", err);
    }
    return;
  }

  // 0. Auto-Reply FAQ
  const contentLower = message.content.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some(keyword => contentLower.includes(keyword))) {
      await message.reply({
        content: `💡 **Auto FAQ:**\n${rule.response}`
      });
      return;
    }
  }

  // 1. Anti-Link Invite Server Lain
  const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discord(app)?\.com\/invite\/.+)/i;
  if (inviteRegex.test(message.content)) {
    try {
      await message.delete();
      const warnMsg = await message.channel.send(`❌ <@${message.author.id}>, dilarang menyebarkan link server lain!`);
      setTimeout(() => warnMsg.delete().catch(() => null), 5000);

      // Catat warning ke Database SQLite
      db.prepare(`
        INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
        VALUES (?, ?, ?, ?)
      `).run(message.guild.id, message.author.id, client.user?.id || "System", "Mengirim link invite server lain (Auto Mod)");

      // Kirim log ke LOG_CHANNEL_ID jika diset
      if (config.LOG_CHANNEL_ID) {
        const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isSendable()) {
          const v2Log = buildV2Container({
            title: "🛡️ Auto Mod: Link Terblokir",
            description: `Pesan dari <@${message.author.id}> otomatis dihapus karena mengandung link invite server lain.\nChannel: <#${message.channel.id}>`,
            footer: "LeonX Hub • Auto Mod"
          });
          await logChannel.send(v2Log);
        }
      }
    } catch (err) {
      console.error("Gagal menjalankan Anti-Link:", err);
    }
    return;
  }

  // 2. Anti-Spam
  const now = Date.now();
  const userId = message.author.id;
  let userData = userSpamCache.get(userId);

  if (!userData) {
    userData = {
      timestamps: [],
      lastContent: "",
      repeatCount: 0
    };
    userSpamCache.set(userId, userData);
  }

  // Bersihkan timestamp yang lebih lama dari 5 detik
  userData.timestamps = userData.timestamps.filter((t) => now - t < 5000);
  userData.timestamps.push(now);

  // Periksa pesan duplikat
  const normalizedContent = message.content.trim().toLowerCase();
  if (normalizedContent === userData.lastContent && normalizedContent.length > 3) {
    userData.repeatCount++;
  } else {
    userData.lastContent = normalizedContent;
    userData.repeatCount = 1;
  }

  const isSpammingFast = userData.timestamps.length > 5;
  const isSpammingRepeat = userData.repeatCount > 3;

  if (isSpammingFast || isSpammingRepeat) {
    try {
      await message.delete();
      const warnMsg = await message.channel.send(`⚠️ <@${message.author.id}>, mohon jangan melakukan spam di server!`);
      setTimeout(() => warnMsg.delete().catch(() => null), 5000);

      // Jika spam terus berlanjut (timestamps > 7), lakukan timeout selama 10 menit
      if (userData.timestamps.length > 7 && member.moderatable) {
        await member.timeout(10 * 60 * 1000, "Spamming (Auto Mod)");
        const timeoutMsg = await message.channel.send(`🔇 <@${message.author.id}> telah di-timeout selama 10 menit karena melakukan spam.`);
        setTimeout(() => timeoutMsg.delete().catch(() => null), 10000);

        // Catat warning ke database warnings
        db.prepare(`
          INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
          VALUES (?, ?, ?, ?)
        `).run(message.guild.id, message.author.id, client.user?.id || "System", "Spamming berlebih (Auto Mod Timeout)");

        // Kirim log ke LOG_CHANNEL_ID
        if (config.LOG_CHANNEL_ID) {
          const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
          if (logChannel?.isSendable()) {
            const v2Log = buildV2Container({
              title: "🛡️ Auto Mod: Timeout User",
              description: `Pengguna <@${message.author.id}> otomatis di-timeout selama 10 menit karena spamming berlebih.`,
              footer: "LeonX Hub • Auto Mod"
            });
            await logChannel.send(v2Log);
          }
        }
      }
    } catch (err) {
      console.error("Gagal menjalankan Anti-Spam:", err);
    }
  }
});

// Helper functions for Roblox API integration
async function getRobloxUserInfo(robloxId: string): Promise<{ username: string; displayName: string } | null> {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
    if (res.ok) {
      const data = await res.json() as { name: string; displayName: string };
      return {
        username: data.name,
        displayName: data.displayName
      };
    }
  } catch (error) {
    console.error(`Failed to fetch Roblox user info for ${robloxId}:`, error);
  }
  return null;
}

async function getRobloxAvatarUrl(robloxId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`);
    if (res.ok) {
      const data = await res.json() as { data?: Array<{ imageUrl?: string }> };
      const url = data.data?.[0]?.imageUrl;
      if (url) {
        return url;
      }
    }
  } catch (error) {
    console.error(`Failed to fetch Roblox avatar for ${robloxId}:`, error);
  }
  return null;
}

// Spin up a lightweight stats HTTP server for web dashboard integration
const serverPort = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Anti-Tamper & Security Defense Engine Check
  const isAllowed = await handleSecurityCheck(req, res, client);
  if (!isAllowed) return;

  // Parse path and query params
  const urlObj = new URL(req.url!, `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;
  if (pathname === "/loader.lua" && req.method === "GET") {
    const loaderPath = path.join(process.cwd(), "lua", "loader.lua");
    try {
      if (fs.existsSync(loaderPath)) {
        const content = fs.readFileSync(loaderPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(content);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`warn("Gagal memuat script loader: file loader.lua tidak ditemukan di server.")`);
      }
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`warn("Internal server error: ${error.message.replace(/"/g, '\\"')}")`);
    }
  }
  else if (pathname === "/load.php" && req.method === "GET") {
    const key = urlObj.searchParams.get("key");
    const robloxId = urlObj.searchParams.get("roblox_id") || undefined;
    const hwid = urlObj.searchParams.get("hwid") || undefined;
    const username = urlObj.searchParams.get("username") || "Unknown";
    const executor = urlObj.searchParams.get("executor") || "Unknown";
    const placeId = urlObj.searchParams.get("place_id") || "Unknown";

    if (!key) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`game:GetService("Players").LocalPlayer:Kick("Parameter 'key' wajib diisi.")`);
      return;
    }

    try {
      const result = validateUserKey(key, robloxId, hwid);
      if (!result.valid) {
        await recordFailedKeyAttempt(getClientIp(req), key, client, { hwid, robloxId, username });
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`game:GetService("Players").LocalPlayer:Kick("Akses ditolak: ${result.message.replace(/"/g, '\\"')}")`);
        return;
      }

      if (result.discordId) {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        const member = await guild?.members.fetch(result.discordId).catch(() => null);

        if (!member) {
          res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`game:GetService("Players").LocalPlayer:Kick("Akses ditolak: Pengguna tidak ditemukan di server Discord.")`);
          return;
        }

        if (config.VERIFIED_ROLE_ID && !member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`game:GetService("Players").LocalPlayer:Kick("Akses ditolak: Pengguna tidak lagi memiliki role terverifikasi.")`);
          return;
        }
      }

      // Catat log eksekusi ke database SQLite
      try {
        db.prepare(`
          INSERT INTO script_executions (discord_id, roblox_username, roblox_id, place_id, executor, executed_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(result.discordId || null, username, robloxId || null, placeId, executor);
      } catch (dbErr) {
        console.error("Gagal mencatat log eksekusi ke database:", dbErr);
      }

      // Kirim log eksekusi ke channel Discord
      const logChannelId = "1521734378877616289";
      try {
        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        if (logChannel?.isSendable()) {
          const v2ExecLog = buildV2Container({
            title: "📊 In-Game Script Executed!",
            description: `Script loader baru saja dieksekusi di dalam game Roblox!`,
            sections: [
              {
                title: "🎮 Detail Eksekusi",
                content:
                  `• \`Discord User:\` ${result.discordId ? `<@${result.discordId}>` : "Unknown"}\n` +
                  `• \`Roblox User:\` [${username}](https://www.roblox.com/users/${robloxId || 0}/profile) (\`${robloxId || "N/A"}\`)\n` +
                  `• \`Place ID:\` [${placeId}](https://www.roblox.com/games/${placeId})\n` +
                  `• \`Executor:\` \`${executor}\`\n` +
                  `• \`Perangkat (HWID):\` \`${hwid || "N/A"}\``
              }
            ],
            footer: "LeonX Hub • Execution Log"
          });
          await logChannel.send(v2ExecLog);
        }
      } catch (logErr) {
        console.error("Gagal mengirim log eksekusi ke Discord:", logErr);
      }

      // Serve the main.lua file
      const mainLuaPath = path.join(process.cwd(), "lua", "main.lua");
      if (fs.existsSync(mainLuaPath)) {
        const content = fs.readFileSync(mainLuaPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(content);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`warn("Gagal memuat script utama: file main.lua tidak ditemukan di server.")`);
      }
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`game:GetService("Players").LocalPlayer:Kick("Internal server error: ${error.message.replace(/"/g, '\\"')}")`);
    }
  }
  else if (pathname === "/api/validate-key" && req.method === "GET") {
    const key = urlObj.searchParams.get("key");
    const robloxId = urlObj.searchParams.get("roblox_id") || undefined;
    const hwid = urlObj.searchParams.get("hwid") || undefined;

    if (!key) {
      res.writeHead(400);
      res.end(JSON.stringify({ valid: false, error: "Parameter 'key' wajib diisi." }));
      return;
    }

    try {
      const result = validateUserKey(key, robloxId, hwid);
      if (!result.valid) {
        await recordFailedKeyAttempt(getClientIp(req), key, client, { hwid, robloxId });
        res.writeHead(403);
        res.end(JSON.stringify({ valid: false, error: result.message }));
        return;
      }

      if (result.discordId) {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        const member = await guild?.members.fetch(result.discordId).catch(() => null);

        if (!member) {
          res.writeHead(403);
          res.end(JSON.stringify({ valid: false, error: "Akses ditolak: Pengguna tidak ditemukan di server Discord." }));
          return;
        }

        if (config.VERIFIED_ROLE_ID && !member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          res.writeHead(403);
          res.end(JSON.stringify({ valid: false, error: "Akses ditolak: Pengguna tidak lagi memiliki role terverifikasi." }));
          return;
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ valid: true, message: result.message }));
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ valid: false, error: error.message }));
    }
  }
  else if (pathname === "/api/my-key" && req.method === "GET") {
    const token = urlObj.searchParams.get("token") || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.writeHead(400);
      res.end(JSON.stringify({ hasKey: false, error: "Access token is required." }));
      return;
    }

    try {
      const discordRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!discordRes.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ hasKey: false, error: "Unauthorized access token." }));
        return;
      }

      const user = await discordRes.json() as { id: string; username: string };
      const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(user.id) as {
        key: string;
        roblox_id: string | null;
        hwid: string | null;
        last_reset_at: string | null;
      } | undefined;

      if (!row) {
        res.writeHead(200);
        res.end(JSON.stringify({ hasKey: false, message: "Anda belum memiliki key terdaftar. Silakan gunakan `/script` terlebih dahulu di Discord." }));
        return;
      }

      let cooldownRemainingMinutes = 0;
      let cooldownRemainingHours = 0;
      if (row.last_reset_at) {
        const lastReset = new Date(row.last_reset_at).getTime();
        const now = Date.now();
        const diffMinutes = (now - lastReset) / (1000 * 60);
        if (diffMinutes < 10) {
          cooldownRemainingMinutes = Math.ceil(10 - diffMinutes);
          cooldownRemainingHours = Math.ceil(cooldownRemainingMinutes / 60);
        }
      }

      let robloxUsername: string | null = null;
      let robloxDisplayName: string | null = null;
      let robloxAvatarUrl: string | null = null;

      if (row.roblox_id) {
        const robloxUser = await getRobloxUserInfo(row.roblox_id);
        if (robloxUser) {
          robloxUsername = robloxUser.username;
          robloxDisplayName = robloxUser.displayName;
        }
        robloxAvatarUrl = await getRobloxAvatarUrl(row.roblox_id);
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        hasKey: true,
        key: row.key,
        robloxId: row.roblox_id,
        robloxUsername,
        robloxDisplayName,
        robloxAvatarUrl,
        hwid: row.hwid,
        lastResetAt: row.last_reset_at,
        cooldownRemainingMinutes,
        cooldownRemainingHours
      }));
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ hasKey: false, error: error.message }));
    }
  }
  else if (pathname === "/api/reset-my-hwid" && req.method === "POST") {
    const token = urlObj.searchParams.get("token") || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: "Access token is required." }));
      return;
    }

    try {
      const discordRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!discordRes.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Unauthorized access token." }));
        return;
      }

      const user = await discordRes.json() as { id: string };
      const guild = client.guilds.cache.get(config.GUILD_ID);
      const member = await guild?.members.fetch(user.id).catch(() => null);
      const isOwner = isUserOwnerOrAdmin(user.id, member);
      const result = resetUserKeyBinding(user.id, isOwner);
      if (result.success) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: result.message }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: result.message }));
      }
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  else if (pathname === "/api/stats" && req.method === "GET") {
    const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
    
    // Retrieve tables dynamically from SQLite database
    let totalTickets = 0;
    let totalWarnings = 0;
    let commandUsage: any[] = [];
    let blacklist: any[] = [];
    let recentTickets: any[] = [];
    let recentWarnings: any[] = [];

    try {
      const ticketsRow = db.prepare("SELECT COUNT(*) as count FROM tickets").get() as { count: number };
      totalTickets = ticketsRow?.count || 0;
      
      const warningsRow = db.prepare("SELECT COUNT(*) as count FROM warnings").get() as { count: number };
      totalWarnings = warningsRow?.count || 0;

      commandUsage = db.prepare("SELECT * FROM command_usage ORDER BY uses DESC").all();
      blacklist = db.prepare("SELECT * FROM blacklist ORDER BY id DESC").all();
      recentTickets = db.prepare("SELECT * FROM tickets ORDER BY id DESC LIMIT 10").all();
      recentWarnings = db.prepare("SELECT * FROM warnings ORDER BY id DESC LIMIT 10").all();
    } catch (e: any) {
      console.error("Database query failed inside HTTP server:", e);
    }

    const guildsList = client.guilds.cache.map(guild => ({
      name: guild.name,
      id: guild.id,
      members: guild.memberCount,
      icon: guild.iconURL({ size: 128 }) || null
    }));

    res.writeHead(200);
    res.end(JSON.stringify({
      status: "ONLINE",
      ping: client.ws.ping || 14,
      guilds: client.guilds.cache.size,
      users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
      uptime: client.uptime || 0,
      memory: memoryUsageMB,
      stats: {
        tickets: totalTickets,
        warnings: totalWarnings
      },
      avatar: client.user?.displayAvatarURL({ size: 128 }) || null,
      botTag: client.user?.tag || "El Bot#8981",
      guildsList,
      commandUsage,
      blacklist,
      tickets: recentTickets,
      warnings: recentWarnings
    }));
  } 
  else if (pathname === "/api/changelogs" && req.method === "GET") {
    try {
      const params = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
      const page = Math.max(1, parseInt(params.get("page") || "1", 10));
      const limit = Math.min(20, Math.max(1, parseInt(params.get("limit") || "3", 10)));
      const offset = (page - 1) * limit;

      const totalRow = db.prepare("SELECT COUNT(*) as count FROM changelogs").get() as { count: number };
      const totalCount = totalRow?.count || 0;
      const totalPages = Math.ceil(totalCount / limit);

      const rows = db.prepare(
        "SELECT id, title, content, author_id, created_at FROM changelogs ORDER BY id DESC LIMIT ? OFFSET ?"
      ).all(limit, offset) as { id: number; title: string; content: string; author_id: string; created_at: string }[];

      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ success: true, changelogs: rows, page, totalPages, totalCount }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  else if (pathname === "/api/blacklist" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.discordId && !data.robloxId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "discordId or robloxId required" }));
          return;
        }
        addToBlacklist({
          discordId: data.discordId,
          robloxId: data.robloxId,
          hwid: data.hwid,
          reason: data.reason || "Banned from Web Panel"
        });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } 
  else if (pathname === "/api/blacklist" && req.method === "DELETE") {
    const discordId = urlObj.searchParams.get("discord_id");
    const id = urlObj.searchParams.get("id");
    try {
      if (discordId) {
        db.prepare("DELETE FROM blacklist WHERE discord_id = ?").run(discordId);
      } else if (id) {
        db.prepare("DELETE FROM blacklist WHERE id = ?").run(id);
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "id or discord_id required" }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  } 
  else if (pathname === "/api/proxy" && req.method === "GET") {
    const targetUrl = urlObj.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "url parameter is required" }));
      return;
    }
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      const body = await response.text();
      res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") || "application/json" });
      res.end(body);
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
  }
}).listen(Number(serverPort), "0.0.0.0", () => {
  console.log(`[HTTP] stats server listening on port ${serverPort}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  const welcomeChannelId = "1515741307534966784";

  // ── Auto-ban akun yang umurnya kurang dari 1 bulan ──
  try {
    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

    if (accountAgeMs < ONE_MONTH_MS) {
      const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
      const createdUnix = Math.floor(member.user.createdTimestamp / 1000);

      console.log(`[Anti-Raid] Akun terlalu baru terdeteksi: ${member.user.tag} (${accountAgeDays} hari). Memproses auto-ban...`);

      // Coba DM user sebelum ban
      try {
        await member.send(
          `⛔ **Auto-Ban — ${member.guild.name}**\n\n` +
          `Akun Discord Anda terlalu baru (dibuat ${accountAgeDays} hari yang lalu). ` +
          `Demi keamanan server, akun yang berumur kurang dari **30 hari** akan otomatis di-ban.\n\n` +
          `Silakan coba bergabung kembali setelah akun Anda berumur minimal 1 bulan.`
        );
      } catch {
        // DM gagal (privasi tertutup), lanjutkan ban
      }

      // Ban member
      await member.ban({ reason: `[Auto-Ban] Akun terlalu baru (${accountAgeDays} hari). Minimal 30 hari.` });

      // Kirim log ke channel
      const v2BanLog = buildV2Container({
        title: "⛔ Auto-Ban: Akun Terlalu Baru",
        thumbnailUrl: member.user.displayAvatarURL({ size: 256 }),
        description:
          `Pengguna <@${member.user.id}> (\`${member.user.id}\`) otomatis di-ban demi keamanan server.\n\n` +
          `• **Umur Akun:** ${accountAgeDays} hari\n` +
          `• **Tanggal Dibuat:** <t:${createdUnix}:F> (<t:${createdUnix}:R>)`,
        footer: "LeonX Hub • Anti-Raid Protection"
      });

      if (config.LOG_CHANNEL_ID) {
        const logChannel = await member.guild.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isSendable()) {
          await logChannel.send(v2BanLog);
        }
      }

      const welcomeChannel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
      if (welcomeChannel?.isSendable()) {
        await welcomeChannel.send(v2BanLog);
      }

      return; // Jangan kirim welcome message
    }
  } catch (banError) {
    console.error("[Anti-Raid] Gagal memproses auto-ban akun baru:", banError);
  }

  // ── Welcome message (canvas card) ──
  try {
    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (channel?.isSendable()) {
      const welcomeBuf = await renderWelcomeCard({
        username: member.user.username,
        avatarUrl: member.user.displayAvatarURL({ size: 256 }),
        guildName: member.guild.name,
        memberCount: member.guild.memberCount,
        verifyChannelId: config.VERIFY_CHANNEL_ID
      });
      const attachment = new AttachmentBuilder(welcomeBuf, { name: "welcome.png" });

      const verifyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Verifikasi Sekarang")
          .setEmoji("🔐")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${config.GUILD_ID}/${config.VERIFY_CHANNEL_ID}`)
      );

      await channel.send({
        content: `Selamat datang <@${member.id}>!`,
        files: [attachment],
        components: [verifyRow]
      });
    }
  } catch (error) {
    console.error("Gagal mengirim pesan selamat datang:", error);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  const welcomeChannelId = "1515741307534966784";
  try {
    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (channel?.isSendable()) {
      const goodbyeBuf = await renderGoodbyeCard({
        userTag: member.user.tag,
        avatarUrl: member.user.displayAvatarURL({ size: 256 }),
        guildName: member.guild.name,
        memberCount: member.guild.memberCount
      });
      const attachment = new AttachmentBuilder(goodbyeBuf, { name: "goodbye.png" });

      await channel.send({ files: [attachment] });
    }
  } catch (error) {
    console.error("Gagal mengirim pesan selamat tinggal:", error);
  }
});

await client.login(config.DISCORD_TOKEN);

