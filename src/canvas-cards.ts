import { createCanvas, Canvas, GlobalFonts, type SKRSContext2D, loadImage } from "@napi-rs/canvas";
import { join } from "node:path";

// ──────────────────────────────────────────────────────
//  Font Registration
// ──────────────────────────────────────────────────────
const fontsDir = join(process.cwd(), "assets", "fonts");
try {
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-Regular.ttf"), "Inter");
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-Bold.ttf"), "Inter Bold");
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-SemiBold.ttf"), "Inter SemiBold");
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-Medium.ttf"), "Inter Medium");
} catch {
  console.warn("[Canvas] Font registration failed – falling back to system fonts");
}

// ──────────────────────────────────────────────────────
//  Design System
// ──────────────────────────────────────────────────────
const COLORS = {
  primary: "#7c3aed",
  primaryLight: "#a78bfa",
  secondary: "#2563eb",
  secondaryLight: "#60a5fa",
  success: "#22c55e",
  successLight: "#4ade80",
  warning: "#eab308",
  warningLight: "#facc15",
  danger: "#ef4444",
  dangerLight: "#f87171",
  info: "#06b6d4",

  bgDark: "#0f0d1a",
  bgMid: "#1a1333",
  bgCard: "rgba(255,255,255,0.04)",
  bgCardBorder: "rgba(255,255,255,0.08)",

  textPrimary: "#f2f3f5",
  textSecondary: "#949ba4",
  textMuted: "#6b7280",
  textAccent: "#a78bfa",

  white: "#ffffff",
  black: "#000000",
} as const;

const CARD_WIDTH = 800;
const CARD_PADDING = 36;
const TITLE_FONT_SIZE = 24;
const SUBTITLE_FONT_SIZE = 16;
const BODY_FONT_SIZE = 15;
const SMALL_FONT_SIZE = 12;
const FIELD_LABEL_SIZE = 13;
const FIELD_VALUE_SIZE = 15;
const LINE_HEIGHT = 1.45;
const CARD_RADIUS = 16;
const INNER_CARD_RADIUS = 12;

// ──────────────────────────────────────────────────────
//  Helper: Drawing Primitives
// ──────────────────────────────────────────────────────

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillGradientBackground(
  ctx: SKRSContext2D,
  w: number, h: number,
  colorStart: string = COLORS.bgDark, colorEnd: string = COLORS.bgMid
) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, colorStart);
  grad.addColorStop(1, colorEnd);
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, 0, 0, w, h, CARD_RADIUS);
  ctx.fill();
}

function drawOuterBorder(ctx: SKRSContext2D, w: number, h: number) {
  ctx.strokeStyle = COLORS.bgCardBorder;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, CARD_RADIUS);
  ctx.stroke();
}

function drawAccentBar(
  ctx: SKRSContext2D,
  y: number, w: number,
  color: string, barHeight = 4
) {
  const grad = ctx.createLinearGradient(CARD_PADDING, y, w - CARD_PADDING, y);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + "33");
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, CARD_PADDING, y, w - CARD_PADDING * 2, barHeight, 2);
  ctx.fill();
}

function drawInnerCard(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number
) {
  // Fill
  ctx.fillStyle = COLORS.bgCard;
  drawRoundedRect(ctx, x, y, w, h, INNER_CARD_RADIUS);
  ctx.fill();
  // Border
  ctx.strokeStyle = COLORS.bgCardBorder;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, w, h, INNER_CARD_RADIUS);
  ctx.stroke();
}

function drawDivider(ctx: SKRSContext2D, y: number, w: number) {
  const grad = ctx.createLinearGradient(CARD_PADDING + 10, y, w - CARD_PADDING - 10, y);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.2, COLORS.bgCardBorder);
  grad.addColorStop(0.8, COLORS.bgCardBorder);
  grad.addColorStop(1, "transparent");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CARD_PADDING + 10, y);
  ctx.lineTo(w - CARD_PADDING - 10, y);
  ctx.stroke();
}

function drawGlowText(
  ctx: SKRSContext2D,
  text: string,
  x: number, y: number,
  color: string,
  fontSize: number,
  fontWeight = "Bold"
) {
  ctx.font = `${fontSize}px "Inter ${fontWeight}", "Inter", sans-serif`;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function drawText(
  ctx: SKRSContext2D,
  text: string,
  x: number, y: number,
  options: {
    color?: string;
    fontSize?: number;
    fontWeight?: string;
    maxWidth?: number;
    align?: CanvasTextAlign;
  } = {}
) {
  const {
    color = COLORS.textPrimary,
    fontSize = BODY_FONT_SIZE,
    fontWeight = "",
    maxWidth,
    align = "left",
  } = options;

  const fontFamily = fontWeight ? `"Inter ${fontWeight}", "Inter", sans-serif` : `"Inter", sans-serif`;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if (maxWidth) {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.textAlign = "left";
}

function drawFieldRow(
  ctx: SKRSContext2D,
  label: string, value: string,
  x: number, y: number,
  labelColor = COLORS.textSecondary,
  valueColor = COLORS.textPrimary
) {
  drawText(ctx, label, x, y, { color: labelColor, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, value, x, y + 18, { color: valueColor, fontSize: FIELD_VALUE_SIZE });
  return y + 42;
}

function drawFieldRowInline(
  ctx: SKRSContext2D,
  label: string, value: string,
  x: number, y: number,
  labelColor = COLORS.textSecondary,
  valueColor = COLORS.textPrimary
) {
  drawText(ctx, label, x, y, { color: labelColor, fontSize: FIELD_LABEL_SIZE, fontWeight: "Medium" });
  const labelWidth = ctx.measureText(label).width;
  drawText(ctx, value, x + labelWidth + 10, y, { color: valueColor, fontSize: FIELD_LABEL_SIZE + 1 });
  return y + 22;
}

function drawStatusBadge(
  ctx: SKRSContext2D,
  text: string, x: number, y: number,
  color: string
) {
  ctx.font = `${SMALL_FONT_SIZE}px "Inter SemiBold", "Inter", sans-serif`;
  const textWidth = ctx.measureText(text).width;
  const badgeW = textWidth + 24;
  const badgeH = 22;

  // Badge background
  ctx.fillStyle = color + "22";
  drawRoundedRect(ctx, x, y, badgeW, badgeH, 6);
  ctx.fill();
  ctx.strokeStyle = color + "66";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, badgeW, badgeH, 6);
  ctx.stroke();

  // Dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 10, y + badgeH / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.fillStyle = color;
  ctx.fillText(text, x + 18, y + badgeH / 2 + 4);

  return badgeW;
}

function drawProgressBar(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number,
  progress: number,
  color: string
) {
  // Background
  ctx.fillStyle = COLORS.bgCard;
  drawRoundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  // Fill
  const fillW = Math.max(h, w * Math.min(1, progress));
  const grad = ctx.createLinearGradient(x, y, x + fillW, y);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + "88");
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, x, y, fillW, h, h / 2);
  ctx.fill();
}

function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight = ""
): string[] {
  const fontFamily = fontWeight ? `"Inter ${fontWeight}", "Inter", sans-serif` : `"Inter", sans-serif`;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function drawCircularAvatar(
  ctx: SKRSContext2D,
  url: string,
  x: number, y: number, size: number
) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();

    // Border
    ctx.strokeStyle = COLORS.bgCardBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch {
    // Draw placeholder circle
    ctx.fillStyle = COLORS.bgCard;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.bgCardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawText(ctx, "?", x + size / 2 - 6, y + size / 2 + 6, { fontSize: 20, color: COLORS.textSecondary });
  }
}

function drawFooter(ctx: SKRSContext2D, text: string, y: number, w: number) {
  drawText(ctx, text, w / 2, y, {
    color: COLORS.textMuted,
    fontSize: SMALL_FONT_SIZE,
    fontWeight: "Medium",
    align: "center",
  });
}

function createBaseCanvas(height: number): { canvas: Canvas; ctx: SKRSContext2D } {
  const canvas = createCanvas(CARD_WIDTH, height);
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

async function finalizeCard(canvas: Canvas): Promise<Buffer> {
  return Buffer.from(await canvas.encode("png"));
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 1: User-Facing
// ──────────────────────────────────────────────────────

export async function renderVerifyCard(): Promise<Buffer> {
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);
  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#161b22");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.success);

  drawGlowText(ctx, "✅  Verifikasi Member", CARD_PADDING, 60, COLORS.success, TITLE_FONT_SIZE);

  const desc = "Klik tombol Verify di bawah untuk menyetujui peraturan dan mendapatkan akses ke server.";
  const lines = wrapText(ctx, desc, CARD_WIDTH - CARD_PADDING * 2, BODY_FONT_SIZE);
  let ty = 90;
  for (const line of lines) {
    drawText(ctx, line, CARD_PADDING, ty, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ty += Math.round(BODY_FONT_SIZE * LINE_HEIGHT);
  }

  drawDivider(ctx, H - 50, CARD_WIDTH);
  drawFooter(ctx, "LeonX Hub  •  Verification System", H - 26, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderStatusCard(data: {
  status: string;
  note: string;
}): Promise<Buffer> {
  const H = 240;
  const { canvas, ctx } = createBaseCanvas(H);

  const isOp = data.status === "operational";
  const isTest = data.status === "testing";
  const accentColor = isOp ? COLORS.success : isTest ? COLORS.warning : COLORS.danger;
  const statusText = isOp ? "Operational" : isTest ? "Testing / Updating" : "Maintenance / Patched";
  const statusIcon = isOp ? "🟢" : isTest ? "🟡" : "🔴";

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#161b22");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, accentColor);

  drawGlowText(ctx, "📊  Status Script", CARD_PADDING, 60, COLORS.textPrimary, TITLE_FONT_SIZE);

  // Status fields
  const innerX = CARD_PADDING;
  const innerY = 80;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, innerX, innerY, innerW, 80);

  drawText(ctx, "LeonX Hub", innerX + 16, innerY + 28, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawStatusBadge(ctx, `${statusIcon} ${statusText}`, innerX + 16, innerY + 38, accentColor);

  drawText(ctx, "Bot", innerX + innerW / 2, innerY + 28, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawStatusBadge(ctx, "🟢 Online", innerX + innerW / 2, innerY + 38, COLORS.success);

  // Note
  drawText(ctx, "Catatan:", CARD_PADDING, H - 60, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, data.note, CARD_PADDING, H - 42, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, maxWidth: CARD_WIDTH - CARD_PADDING * 2 });

  drawFooter(ctx, "LeonX Hub  •  Status Monitor", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderKeyInfoCard(data: {
  key: string;
  robloxId: string | null;
  hwid: string | null;
  cooldownText: string;
  totalExec: number;
  createdAt: string;
  history: Array<{ date: string; placeId: string; executor: string; robloxName: string }>;
}): Promise<Buffer> {
  const historyHeight = data.history.length * 28 + 20;
  const H = 330 + historyHeight;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#1a0d2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.primary);

  drawGlowText(ctx, "🔑  Informasi Key & Lisensi Anda", CARD_PADDING, 60, COLORS.primaryLight, TITLE_FONT_SIZE);

  // Key fields
  const innerX = CARD_PADDING;
  let curY = 80;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;

  drawInnerCard(ctx, innerX, curY, innerW, 170);
  const fx = innerX + 18;
  curY += 10;
  curY = drawFieldRow(ctx, "🔑  KEY LISENSI", data.key, fx, curY + 14);
  curY = drawFieldRow(ctx, "👤  AKUN ROBLOX", data.robloxId || "Belum tertaut", fx, curY);
  curY = drawFieldRow(ctx, "💻  PERANGKAT (HWID)", data.hwid || "Belum tertaut", fx, curY);

  // Inline stats row
  curY += 6;
  const statsY = curY;
  drawInnerCard(ctx, innerX, statsY, innerW, 46);
  const third = innerW / 3;
  drawText(ctx, "🔄 Reset", fx, statsY + 18, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE });
  drawText(ctx, data.cooldownText, fx, statsY + 34, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "SemiBold" });

  drawText(ctx, "📊 Eksekusi", fx + third, statsY + 18, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE });
  drawText(ctx, `${data.totalExec} kali`, fx + third, statsY + 34, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "SemiBold" });

  drawText(ctx, "📅 Dibuat", fx + third * 2, statsY + 18, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE });
  drawText(ctx, data.createdAt, fx + third * 2, statsY + 34, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "SemiBold" });

  curY = statsY + 60;

  // History
  if (data.history.length > 0) {
    drawText(ctx, "📜  Riwayat Eksekusi Terakhir", CARD_PADDING, curY + 10, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "SemiBold" });
    curY += 30;
    drawInnerCard(ctx, innerX, curY, innerW, historyHeight);
    curY += 14;

    for (const entry of data.history) {
      drawText(ctx, `•  ${entry.date}`, fx, curY, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
      drawText(ctx, `Game: ${entry.placeId}  |  Executor: ${entry.executor}  |  ${entry.robloxName}`, fx + 18, curY + 16, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE });
      curY += 28;
    }
  }

  curY += 16;
  drawFooter(ctx, "LeonX Hub  •  License System", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderFaqCard(topic: string, answer: string): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const lines = wrapText(tempCtx, answer, CARD_WIDTH - CARD_PADDING * 2 - 20, BODY_FONT_SIZE);
  const H = 120 + lines.length * Math.round(BODY_FONT_SIZE * LINE_HEIGHT);
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#161b22");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.info);

  drawGlowText(ctx, `💡  FAQ: ${topic}`, CARD_PADDING, 58, COLORS.info, TITLE_FONT_SIZE - 2);

  let ty = 84;
  for (const line of lines) {
    drawText(ctx, line, CARD_PADDING + 4, ty, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ty += Math.round(BODY_FONT_SIZE * LINE_HEIGHT);
  }

  drawFooter(ctx, "LeonX Hub  •  FAQ", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderWebsiteCard(): Promise<Buffer> {
  const H = 180;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, "🌐  LeonThings Website", CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE);

  drawInnerCard(ctx, CARD_PADDING, 76, CARD_WIDTH - CARD_PADDING * 2, 62);
  drawText(ctx, "🌐  Website Utama", CARD_PADDING + 16, 100, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, "https://leonthings.my.id", CARD_PADDING + 16, 118, { color: COLORS.secondaryLight, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });

  drawText(ctx, "🤖  Bot Console", CARD_PADDING + CARD_WIDTH / 2 - 16, 100, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, "https://leonthings.my.id/bot", CARD_PADDING + CARD_WIDTH / 2 - 16, 118, { color: COLORS.secondaryLight, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });

  drawFooter(ctx, "LeonX Hub  •  Official Links", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 2: Roblox
// ──────────────────────────────────────────────────────

export async function renderRobloxProfileCard(data: {
  username: string;
  displayName: string;
  userId: number;
  description: string;
  isBanned: boolean;
  hasVerifiedBadge?: boolean;
  avatarUrl: string | null;
  followers: string;
  following: string;
  friends: string;
  rap: string;
  usernameHistory: string;
  createdAt: string;
}): Promise<Buffer> {
  const H = 440;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  // Avatar
  if (data.avatarUrl) {
    await drawCircularAvatar(ctx, data.avatarUrl, CARD_PADDING, 40, 72);
  }

  // Title
  const nameX = data.avatarUrl ? CARD_PADDING + 88 : CARD_PADDING;
  drawGlowText(ctx, `${data.displayName}${data.hasVerifiedBadge ? " ☑️" : ""}`, nameX, 70, COLORS.textPrimary, TITLE_FONT_SIZE);
  drawText(ctx, `@${data.username}  •  ID: ${data.userId}`, nameX, 92, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE });

  // Status badge
  const badgeColor = data.isBanned ? COLORS.danger : COLORS.success;
  const badgeText = data.isBanned ? "Banned" : "Aktif";
  drawStatusBadge(ctx, badgeText, nameX, 100, badgeColor);

  // Description
  let curY = 132;
  if (data.description) {
    drawInnerCard(ctx, CARD_PADDING, curY, CARD_WIDTH - CARD_PADDING * 2, 60);
    const descLines = wrapText(ctx, data.description.slice(0, 200), CARD_WIDTH - CARD_PADDING * 2 - 32, SMALL_FONT_SIZE + 1);
    let dy = curY + 18;
    for (const line of descLines.slice(0, 3)) {
      drawText(ctx, line, CARD_PADDING + 16, dy, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1 });
      dy += 16;
    }
    curY += 72;
  }

  // Stats grid
  const statsW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, curY, statsW, 80);
  const col = statsW / 4;
  const statItems = [
    { label: "Teman", value: data.friends },
    { label: "Pengikut", value: data.followers },
    { label: "Mengikuti", value: data.following },
    { label: "RAP", value: data.rap },
  ];
  statItems.forEach((item, i) => {
    const sx = CARD_PADDING + col * i + 16;
    drawText(ctx, item.label, sx, curY + 26, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, curY + 48, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });
  });
  curY += 96;

  // Username history
  drawText(ctx, "🏷️  Riwayat Nama", CARD_PADDING, curY + 6, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, data.usernameHistory, CARD_PADDING, curY + 24, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1, maxWidth: CARD_WIDTH - CARD_PADDING * 2 });
  curY += 44;

  // Created
  drawText(ctx, "📅  Dibuat:", CARD_PADDING, curY + 6, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, data.createdAt, CARD_PADDING + 90, curY + 6, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1 });

  drawDivider(ctx, H - 40, CARD_WIDTH);
  drawFooter(ctx, "LeonX Hub  •  Roblox Lookup", H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderGameMonitorCard(data: {
  gameName: string;
  creator: string;
  placeId: string;
  universeId: number;
  playing: string;
  visits: string;
  favorites: string;
  likes: string;
  dislikes: string;
  likeRatio: string;
  iconUrl: string | null;
}): Promise<Buffer> {
  const H = 320;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d2818");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.success);

  // Icon
  const titleX = CARD_PADDING;
  drawGlowText(ctx, `🎮  ${data.gameName}`, titleX, 58, COLORS.successLight, TITLE_FONT_SIZE);
  drawText(ctx, `by ${data.creator}  •  Place: ${data.placeId}  •  Universe: ${data.universeId}`, titleX, 80, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  // Stats grid
  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;

  drawInnerCard(ctx, innerX, 98, innerW, 80);
  const col3 = innerW / 3;
  const row1 = [
    { label: "🟢 Playing", value: data.playing },
    { label: "📈 Visits", value: data.visits },
    { label: "⭐ Favorites", value: data.favorites },
  ];
  row1.forEach((item, i) => {
    const sx = innerX + col3 * i + 16;
    drawText(ctx, item.label, sx, 122, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 144, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });
  });

  drawInnerCard(ctx, innerX, 192, innerW, 80);
  const row2 = [
    { label: "👍 Likes", value: data.likes },
    { label: "👎 Dislikes", value: data.dislikes },
    { label: "📊 Like Ratio", value: data.likeRatio },
  ];
  row2.forEach((item, i) => {
    const sx = innerX + col3 * i + 16;
    drawText(ctx, item.label, sx, 216, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 238, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });
  });

  drawDivider(ctx, H - 40, CARD_WIDTH);
  drawFooter(ctx, "LeonX Hub  •  Game Monitor", H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderGameServersCard(data: {
  placeId: string;
  servers: Array<{ num: number; playing: number; max: number; fps: string; ping: string; joinUrl: string }>;
}): Promise<Buffer> {
  const perServer = 56;
  const H = 140 + data.servers.length * perServer;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, `📈  Server Aktif — Place ${data.placeId}`, CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE - 2);
  drawText(ctx, "Salin link di bawah, lalu paste di Windows Run (Win+R) atau browser.", CARD_PADDING, 80, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 96;

  for (const srv of data.servers) {
    drawInnerCard(ctx, innerX, curY, innerW, perServer - 8);
    const sx = innerX + 16;
    drawText(ctx, `🖥️  Server #${srv.num}`, sx, curY + 18, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });
    drawText(ctx, `${srv.playing}/${srv.max}`, sx + 140, curY + 18, { color: COLORS.textAccent, fontSize: BODY_FONT_SIZE });
    drawText(ctx, `FPS: ${srv.fps}  |  Ping: ${srv.ping}`, sx + 240, curY + 18, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    drawText(ctx, srv.joinUrl, sx, curY + 36, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE, maxWidth: innerW - 40 });
    curY += perServer;
  }

  drawFooter(ctx, "LeonX Hub  •  Server Tracker", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderGameUpdateAlertCard(data: {
  gameName: string;
  placeId: string;
  universeId: number;
  updatedAt: string;
}): Promise<Buffer> {
  const H = 250;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a0d0d", "#2e0d0d");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  drawGlowText(ctx, `🚨  GAME UPDATE DETECTED`, CARD_PADDING, 58, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, innerX, 76, innerW, 100);
  const fx = innerX + 16;
  let fy = 98;
  fy = drawFieldRowInline(ctx, "Nama Game:", data.gameName, fx, fy);
  fy = drawFieldRowInline(ctx, "Place ID:", data.placeId, fx, fy);
  fy = drawFieldRowInline(ctx, "Universe ID:", String(data.universeId), fx, fy);
  fy = drawFieldRowInline(ctx, "Pembaruan:", data.updatedAt, fx, fy);

  drawText(ctx, "⚠️  Status bot otomatis diubah ke Testing/Updating.", CARD_PADDING, H - 52, { color: COLORS.warningLight, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, "Pengembang diharapkan segera cek kecocokan script loader.", CARD_PADDING, H - 34, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  drawFooter(ctx, "LeonX Hub  •  Auto-Update Detector", H - 12, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderMonitorListCard(data: {
  items: Array<{ name: string; placeId: string; lastUpdated: string }>;
}): Promise<Buffer> {
  const perItem = 40;
  const H = 110 + data.items.length * perItem;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, "🔍  Game Update Monitoring List", CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE - 2);

  let curY = 80;
  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;

  for (const item of data.items) {
    drawInnerCard(ctx, innerX, curY, innerW, perItem - 6);
    drawText(ctx, `•  ${item.name}`, innerX + 16, curY + 16, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });
    drawText(ctx, `(${item.placeId})`, innerX + 16 + ctx.measureText(`•  ${item.name} `).width, curY + 16, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    drawText(ctx, `Last Updated: ${item.lastUpdated}`, innerX + 30, curY + 30, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE });
    curY += perItem;
  }

  drawFooter(ctx, "LeonX Hub  •  Monitoring", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 3: Ticket System
// ──────────────────────────────────────────────────────

export async function renderTicketPanelCard(categories: Array<{ emoji: string; label: string; description: string }>): Promise<Buffer> {
  const perCat = 28;
  const H = 210 + categories.length * perCat;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, "🎫  Support Ticket System", CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE);

  drawText(ctx, "Butuh bantuan? Pilih kategori yang sesuai di bawah.", CARD_PADDING, 82, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });

  let curY = 106;
  drawText(ctx, "Kategori yang tersedia:", CARD_PADDING, curY, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "SemiBold" });
  curY += 24;

  for (const cat of categories) {
    drawText(ctx, `${cat.emoji}  ${cat.label}`, CARD_PADDING + 8, curY, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });
    drawText(ctx, ` — ${cat.description}`, CARD_PADDING + 8 + ctx.measureText(`${cat.emoji}  ${cat.label}`).width, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    curY += perCat;
  }

  curY += 8;
  drawInnerCard(ctx, CARD_PADDING, curY, CARD_WIDTH - CARD_PADDING * 2, 50);
  drawText(ctx, "📌  Catatan:", CARD_PADDING + 16, curY + 18, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1, fontWeight: "SemiBold" });
  drawText(ctx, "Satu user hanya bisa memiliki 1 ticket aktif  •  Tim support merespons 1-24 jam", CARD_PADDING + 16, curY + 36, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE });

  drawFooter(ctx, "LeonX Hub  •  Support System", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketWelcomeCard(data: {
  categoryEmoji: string;
  categoryLabel: string;
  userId: string;
  ticketId: string;
}): Promise<Buffer> {
  const H = 280;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, `${data.categoryEmoji}  ${data.categoryLabel}`, CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 70);
  drawText(ctx, "Kategori:", CARD_PADDING + 16, 98, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE });
  drawText(ctx, data.categoryLabel, CARD_PADDING + 85, 98, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "SemiBold" });
  drawText(ctx, "Status:", CARD_PADDING + 16, 120, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE });
  drawStatusBadge(ctx, "🟢 Open", CARD_PADDING + 70, 108, COLORS.success);

  const tips = [
    "Sertakan screenshot/video jika memungkinkan",
    "Jelaskan langkah-langkah yang sudah dicoba",
    "Sebutkan versi script yang digunakan",
  ];
  drawText(ctx, "💡  Tips:", CARD_PADDING, 168, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "SemiBold" });
  tips.forEach((tip, i) => {
    drawText(ctx, `•  ${tip}`, CARD_PADDING + 8, 192 + i * 22, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
  });

  drawDivider(ctx, H - 40, CARD_WIDTH);
  drawFooter(ctx, `Ticket ID: #${data.ticketId}`, H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketCloseCard(data: {
  closedBy: string;
  reason: string;
}): Promise<Buffer> {
  const H = 200;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a0d0d", "#1a1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  drawGlowText(ctx, "🔒  Ticket Ditutup", CARD_PADDING, 58, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 64);
  drawFieldRowInline(ctx, "Ditutup oleh:", data.closedBy, CARD_PADDING + 16, 98);
  drawFieldRowInline(ctx, "Alasan:", data.reason, CARD_PADDING + 16, 120);

  drawText(ctx, "Transcript telah disimpan. Pembuat ticket dapat memberikan rating.", CARD_PADDING, H - 44, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  drawFooter(ctx, "Terima kasih sudah menggunakan support system kami!", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketRatingCard(): Promise<Buffer> {
  const H = 160;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, "📊  Beri Rating untuk Support Kami", CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE);

  drawText(ctx, "Bagaimana pengalamanmu dengan support kami?", CARD_PADDING, 86, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
  drawText(ctx, "Rating kamu sangat membantu kami meningkatkan layanan.", CARD_PADDING, 106, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1 });

  drawFooter(ctx, "Pilih rating di bawah ini", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderRatingThanksCard(rating: number): Promise<Buffer> {
  const H = 160;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d170d", "#0d1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.success);

  drawGlowText(ctx, "✅  Terima Kasih!", CARD_PADDING, 58, COLORS.successLight, TITLE_FONT_SIZE);

  const stars = "⭐".repeat(rating);
  drawText(ctx, `Rating kamu: ${stars}`, CARD_PADDING, 90, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "SemiBold" });
  drawText(ctx, "Kami akan terus meningkatkan layanan support.", CARD_PADDING, 114, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });

  drawFooter(ctx, "LeonX Hub  •  Feedback", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketStatsCard(data: {
  total: number;
  open: number;
  closed: number;
  avgRating: string;
  byCategory: Array<{ emoji: string; category: string; count: number }>;
}): Promise<Buffer> {
  const catHeight = data.byCategory.length > 0 ? data.byCategory.length * 22 + 30 : 0;
  const H = 230 + catHeight;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, "📊  Statistik Ticket System", CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE);

  // Stats grid
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 80);
  const col = innerW / 4;
  const stats = [
    { label: "📝 Total", value: String(data.total) },
    { label: "🟢 Open", value: String(data.open) },
    { label: "🔒 Closed", value: String(data.closed) },
    { label: "⭐ Avg Rating", value: data.avgRating },
  ];
  stats.forEach((item, i) => {
    const sx = CARD_PADDING + col * i + 16;
    drawText(ctx, item.label, sx, 102, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 126, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  });

  // Categories
  if (data.byCategory.length > 0) {
    let curY = 178;
    drawText(ctx, "📂  Berdasarkan Kategori:", CARD_PADDING, curY, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "SemiBold" });
    curY += 24;
    for (const cat of data.byCategory) {
      drawText(ctx, `${cat.emoji}  ${cat.category}: ${cat.count}`, CARD_PADDING + 8, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
      curY += 22;
    }
  }

  drawFooter(ctx, "LeonX Hub  •  Ticket System", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 4: Admin & Moderation
// ──────────────────────────────────────────────────────

export async function renderAdminStatsCard(data: {
  memberCount: number;
  openTickets: number;
  bugReports: number;
  commandsUsed: number;
}): Promise<Buffer> {
  const H = 200;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#1a0d2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.primary);

  drawGlowText(ctx, "📊  Statistik Admin", CARD_PADDING, 58, COLORS.primaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 80);
  const col = innerW / 4;
  const stats = [
    { label: "👥 Members", value: String(data.memberCount) },
    { label: "🎫 Ticket Aktif", value: String(data.openTickets) },
    { label: "🐛 Bug Reports", value: String(data.bugReports) },
    { label: "⚡ Commands", value: String(data.commandsUsed) },
  ];
  stats.forEach((item, i) => {
    const sx = CARD_PADDING + col * i + 16;
    drawText(ctx, item.label, sx, 102, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 126, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  });

  drawFooter(ctx, "LeonX Hub  •  Admin Panel", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderBlacklistCard(data: {
  items: Array<{ id: number; discordId: string | null; robloxId: string | null; hwid: string | null; reason: string; createdAt: string }>;
}): Promise<Buffer> {
  const perItem = 60;
  const H = 100 + data.items.length * perItem;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a0d0d", "#1a1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  drawGlowText(ctx, "🚫  Daftar Blacklist LeonX", CARD_PADDING, 58, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 78;

  for (const item of data.items) {
    drawInnerCard(ctx, CARD_PADDING, curY, innerW, perItem - 8);
    const fx = CARD_PADDING + 16;
    drawText(ctx, `#${item.id}`, fx, curY + 18, { color: COLORS.dangerLight, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

    let detail = "";
    if (item.discordId) detail += `Discord: ${item.discordId}  `;
    if (item.robloxId) detail += `Roblox: ${item.robloxId}  `;
    if (item.hwid) detail += `HWID: ${item.hwid}`;
    drawText(ctx, detail, fx + 40, curY + 18, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1, maxWidth: innerW - 80 });
    drawText(ctx, `Alasan: ${item.reason}  (${item.createdAt})`, fx, curY + 38, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE, maxWidth: innerW - 40 });
    curY += perItem;
  }

  drawFooter(ctx, "LeonX Hub  •  Blacklist", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderLookupCard(data: {
  searchCriteria: string;
  blacklistStatus: string;
  isBlacklisted: boolean;
  keys: Array<{
    key: string;
    discordId: string;
    robloxId: string | null;
    hwid: string | null;
    lastReset: string;
    createdAt: string;
  }>;
  executions: Array<{ date: string; placeId: string; executor: string; robloxName: string; robloxId: string }>;
}): Promise<Buffer> {
  const keyHeight = data.keys.length * 120;
  const execHeight = data.executions.length * 36;
  const H = 180 + keyHeight + execHeight + (data.executions.length > 0 ? 40 : 0);
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a0d0d", "#1a1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  drawGlowText(ctx, "🔍  Hasil Pencarian / Lookup", CARD_PADDING, 58, COLORS.dangerLight, TITLE_FONT_SIZE);
  drawText(ctx, `Kriteria: ${data.searchCriteria}`, CARD_PADDING, 80, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  // Blacklist status
  const blColor = data.isBlacklisted ? COLORS.danger : COLORS.success;
  drawStatusBadge(ctx, data.isBlacklisted ? "BLACKLISTED" : "Clean", CARD_PADDING, 92, blColor);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 124;

  // Keys
  if (data.keys.length === 0) {
    drawInnerCard(ctx, CARD_PADDING, curY, innerW, 36);
    drawText(ctx, "❌  Tidak ditemukan data key/lisensi.", CARD_PADDING + 16, curY + 22, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    curY += 48;
  } else {
    for (let i = 0; i < data.keys.length; i++) {
      const k = data.keys[i]!;
      drawText(ctx, `🔑  Key #${i + 1}`, CARD_PADDING, curY + 6, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "SemiBold" });
      curY += 22;
      drawInnerCard(ctx, CARD_PADDING, curY, innerW, 90);
      const fx = CARD_PADDING + 16;
      let fy = curY + 16;
      fy = drawFieldRowInline(ctx, "Key:", k.key, fx, fy);
      fy = drawFieldRowInline(ctx, "Discord:", k.discordId, fx, fy);
      fy = drawFieldRowInline(ctx, "Roblox:", k.robloxId || "Belum tertaut", fx, fy);
      fy = drawFieldRowInline(ctx, "HWID:", k.hwid || "Belum tertaut", fx, fy);
      curY += 100;
    }
  }

  // Executions
  if (data.executions.length > 0) {
    drawText(ctx, "📊  Riwayat Eksekusi", CARD_PADDING, curY + 6, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "SemiBold" });
    curY += 26;
    for (const ex of data.executions) {
      drawText(ctx, `•  ${ex.date}  —  Game: ${ex.placeId}  |  Exec: ${ex.executor}  |  ${ex.robloxName}`, CARD_PADDING + 8, curY, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1, maxWidth: innerW - 16 });
      curY += 20;
    }
  }

  drawFooter(ctx, "LeonX Hub  •  Admin Tools", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderBugReportCard(data: {
  id: number;
  title: string;
  description: string;
  steps: string;
  reporter: string;
}): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const descLines = wrapText(tempCtx, data.description, CARD_WIDTH - CARD_PADDING * 2 - 40, BODY_FONT_SIZE);
  const stepsLines = wrapText(tempCtx, data.steps, CARD_WIDTH - CARD_PADDING * 2 - 40, BODY_FONT_SIZE);
  const descH = descLines.length * 20 + 28;
  const stepsH = stepsLines.length * 20 + 28;
  const H = 140 + descH + stepsH;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a1a0d", "#1a1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.warning);

  drawGlowText(ctx, `🐛  #${data.id} ${data.title}`, CARD_PADDING, 58, COLORS.warningLight, TITLE_FONT_SIZE - 2);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 78;

  // Description
  drawInnerCard(ctx, CARD_PADDING, curY, innerW, descH);
  drawText(ctx, "Deskripsi:", CARD_PADDING + 16, curY + 18, { color: COLORS.textAccent, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  let ly = curY + 36;
  for (const line of descLines) {
    drawText(ctx, line, CARD_PADDING + 16, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ly += 20;
  }
  curY += descH + 8;

  // Steps
  drawInnerCard(ctx, CARD_PADDING, curY, innerW, stepsH);
  drawText(ctx, "Cara Mengulang:", CARD_PADDING + 16, curY + 18, { color: COLORS.textAccent, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  ly = curY + 36;
  for (const line of stepsLines) {
    drawText(ctx, line, CARD_PADDING + 16, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ly += 20;
  }

  drawFooter(ctx, `Dilaporkan oleh ${data.reporter}`, H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderChangelogCard(data: {
  version: string;
  title: string;
  typeLabel: string;
  typeEmoji: string;
  typeColor: string;
  gameName: string;
  summary: string;
  formattedContent: string;
  statusFooter: string;
}): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const contentLines = data.formattedContent.split("\n").filter(Boolean);
  const contentH = contentLines.length * 22 + 20;
  const H = 240 + contentH;
  const { canvas, ctx } = createBaseCanvas(H);

  const color = data.typeColor;
  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#161b22");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, color);

  drawGlowText(ctx, "LeonX Script Update Logs", CARD_PADDING, 54, COLORS.textPrimary, TITLE_FONT_SIZE);
  drawStatusBadge(ctx, `${data.typeEmoji} ${data.typeLabel}`, CARD_PADDING, 64, color);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 96, innerW, 60);
  drawFieldRowInline(ctx, "Place:", data.gameName, CARD_PADDING + 16, 116);
  drawFieldRowInline(ctx, "Version:", data.version, CARD_PADDING + 16, 138);

  // Summary
  drawText(ctx, "Developer Notes:", CARD_PADDING, 178, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  const summaryLines = wrapText(ctx, data.summary, innerW - 10, BODY_FONT_SIZE);
  let sy = 196;
  for (const line of summaryLines.slice(0, 2)) {
    drawText(ctx, line, CARD_PADDING + 4, sy, { color: COLORS.textMuted, fontSize: BODY_FONT_SIZE });
    sy += 20;
  }

  // Content
  drawDivider(ctx, sy + 4, CARD_WIDTH);
  sy += 18;

  for (const line of contentLines) {
    // Strip markdown formatting for canvas
    const cleanLine = line.replace(/\*\*/g, "").replace(/`/g, "").replace(/> /g, "");
    const isSection = cleanLine.startsWith("✨") || cleanLine.startsWith("🔧") || cleanLine.startsWith("⚡") || cleanLine.startsWith("🗑️");
    if (isSection) {
      drawText(ctx, cleanLine, CARD_PADDING, sy, { color: COLORS.textAccent, fontSize: BODY_FONT_SIZE + 1, fontWeight: "SemiBold" });
    } else {
      drawText(ctx, cleanLine, CARD_PADDING + 8, sy, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, maxWidth: innerW - 16 });
    }
    sy += 22;
  }

  drawDivider(ctx, H - 40, CARD_WIDTH);
  drawFooter(ctx, `LeonX Hub ${data.version}  •  ${data.statusFooter}`, H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 5: Logs
// ──────────────────────────────────────────────────────

export async function renderAutoModCard(data: {
  title: string;
  description: string;
  userTag: string;
  userId: string;
  detail: string;
  extraField?: string;
}): Promise<Buffer> {
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a0d0d", "#1a1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  drawGlowText(ctx, `🛡️  ${data.title}`, CARD_PADDING, 58, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 80);
  const fx = CARD_PADDING + 16;
  let fy = 98;
  fy = drawFieldRowInline(ctx, "Pengguna:", `${data.userTag} (${data.userId})`, fx, fy);
  fy = drawFieldRowInline(ctx, "Detail:", data.detail, fx, fy);
  if (data.extraField) {
    fy = drawFieldRowInline(ctx, "Info:", data.extraField, fx, fy);
  }

  const descLines = wrapText(ctx, data.description, innerW - 10, SMALL_FONT_SIZE + 1);
  let dy = H - 48;
  for (const line of descLines.slice(0, 2)) {
    drawText(ctx, line, CARD_PADDING, dy, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    dy += 16;
  }

  drawFooter(ctx, "LeonX Hub  •  Auto Mod", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderExecutionLogCard(data: {
  discordId: string;
  robloxUsername: string;
  robloxId: string;
  placeId: string;
  executor: string;
  hwid: string;
}): Promise<Buffer> {
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d170d", "#0d1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.success);

  drawGlowText(ctx, "📊  In-Game Script Executed!", CARD_PADDING, 58, COLORS.successLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 100);
  const fx = CARD_PADDING + 16;
  let fy = 96;
  fy = drawFieldRowInline(ctx, "Discord:", data.discordId || "Unknown", fx, fy);
  fy = drawFieldRowInline(ctx, "Roblox:", `${data.robloxUsername} (${data.robloxId || "N/A"})`, fx, fy);
  fy = drawFieldRowInline(ctx, "Game:", `Place ID: ${data.placeId}`, fx, fy);
  fy = drawFieldRowInline(ctx, "Executor:", data.executor, fx, fy);
  drawFieldRowInline(ctx, "HWID:", data.hwid || "N/A", fx, fy);

  drawFooter(ctx, "LeonX Hub  •  Execution Log", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderRatingLogCard(data: {
  ticketId: number;
  category: string;
  rating: number;
  userId: string;
  claimedBy: string;
}): Promise<Buffer> {
  const H = 200;
  const { canvas, ctx } = createBaseCanvas(H);
  const ratingColor = data.rating >= 4 ? COLORS.success : data.rating >= 3 ? COLORS.warning : COLORS.danger;

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#161b22");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, ratingColor);

  drawGlowText(ctx, "📊  New Ticket Rating", CARD_PADDING, 58, ratingColor, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 80);
  const half = innerW / 2;
  const fx = CARD_PADDING + 16;

  drawText(ctx, "Ticket ID", fx, 98, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
  drawText(ctx, `#${data.ticketId}`, fx, 116, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

  drawText(ctx, "Category", fx + half / 2, 98, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
  drawText(ctx, data.category, fx + half / 2, 116, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

  drawText(ctx, "Rating", fx + half, 98, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
  drawText(ctx, `${"⭐".repeat(data.rating)} (${data.rating}/5)`, fx + half, 116, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

  drawFooter(ctx, "LeonX Hub  •  Support Feedback", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderAutoBanCard(data: {
  userTag: string;
  userId: string;
  accountAgeDays: number;
  createdAt: string;
  avatarUrl: string | null;
}): Promise<Buffer> {
  const H = 250;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1a0d0d", "#2e0d0d");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  drawGlowText(ctx, "⛔  Auto-Ban: Akun Terlalu Baru", CARD_PADDING, 58, COLORS.dangerLight, TITLE_FONT_SIZE);

  if (data.avatarUrl) {
    await drawCircularAvatar(ctx, data.avatarUrl, CARD_WIDTH - CARD_PADDING - 64, 34, 64);
  }

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, 90);
  const fx = CARD_PADDING + 16;
  let fy = 96;
  fy = drawFieldRowInline(ctx, "User:", `${data.userTag} (${data.userId})`, fx, fy);
  fy = drawFieldRowInline(ctx, "Umur Akun:", `${data.accountAgeDays} hari`, fx, fy);
  fy = drawFieldRowInline(ctx, "Akun Dibuat:", data.createdAt, fx, fy);

  drawText(ctx, "Akun ini otomatis di-ban karena berumur kurang dari 30 hari.", CARD_PADDING, H - 52, { color: COLORS.warningLight, fontSize: BODY_FONT_SIZE });

  drawDivider(ctx, H - 40, CARD_WIDTH);
  drawFooter(ctx, "LeonX Hub  •  Anti-Raid Protection", H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 6: Events
// ──────────────────────────────────────────────────────

export async function renderWelcomeCard(data: {
  username: string;
  avatarUrl: string;
  guildName: string;
  memberCount: number;
  verifyChannelId: string;
}): Promise<Buffer> {
  const H = 260;
  const { canvas, ctx } = createBaseCanvas(H);

  // Special gradient for welcome
  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, H);
  grad.addColorStop(0, "#0d0d2e");
  grad.addColorStop(0.5, "#1a0d33");
  grad.addColorStop(1, "#0d1b2e");
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, 0, 0, CARD_WIDTH, H, CARD_RADIUS);
  ctx.fill();
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  // Avatar
  await drawCircularAvatar(ctx, data.avatarUrl, CARD_WIDTH / 2 - 42, 36, 84);

  // Title
  drawGlowText(ctx, "Selamat Datang!", CARD_WIDTH / 2, 148, COLORS.secondaryLight, TITLE_FONT_SIZE + 4, "Bold");
  ctx.textAlign = "center";
  drawText(ctx, data.username, CARD_WIDTH / 2, 148, { color: COLORS.secondaryLight, fontSize: TITLE_FONT_SIZE + 4, fontWeight: "Bold", align: "center" });

  drawText(ctx, `di ${data.guildName}`, CARD_WIDTH / 2, 174, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE + 1, align: "center" });

  const innerW = CARD_WIDTH - CARD_PADDING * 4;
  drawInnerCard(ctx, CARD_PADDING * 2, 192, innerW, 32);
  drawText(ctx, "1. Baca peraturan  •  2. Verifikasi di channel verifikasi", CARD_WIDTH / 2, 212, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1, align: "center" });

  ctx.textAlign = "left";
  drawFooter(ctx, `Member #${data.memberCount}`, H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderGoodbyeCard(data: {
  userTag: string;
  avatarUrl: string;
  guildName: string;
  memberCount: number;
}): Promise<Buffer> {
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);

  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, H);
  grad.addColorStop(0, "#1a0d0d");
  grad.addColorStop(1, "#1a1117");
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, 0, 0, CARD_WIDTH, H, CARD_RADIUS);
  ctx.fill();
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.danger);

  // Avatar
  await drawCircularAvatar(ctx, data.avatarUrl, CARD_WIDTH / 2 - 36, 30, 72);

  drawText(ctx, "Sampai Jumpa!", CARD_WIDTH / 2, 126, { color: COLORS.dangerLight, fontSize: TITLE_FONT_SIZE + 2, fontWeight: "Bold", align: "center" });
  drawText(ctx, `${data.userTag} telah meninggalkan ${data.guildName}`, CARD_WIDTH / 2, 150, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, align: "center" });
  drawText(ctx, "Terima kasih sudah bergabung. Sampai jumpa lagi! ✨", CARD_WIDTH / 2, 172, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1, align: "center" });

  drawFooter(ctx, `Member #${data.memberCount}`, H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderRulesCard(): Promise<Buffer> {
  const H = 700;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d0d1a", "#1a0d33");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.primary);

  drawGlowText(ctx, "✨  Welcome to LeonX Hub Server  ✨", CARD_PADDING, 54, COLORS.primaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  const descLines = wrapText(ctx, "Selamat datang di server resmi LeonX Hub. Harap luangkan waktu untuk membaca dan mematuhi peraturan demi kenyamanan bersama.", innerW - 32, BODY_FONT_SIZE);
  let curY = 72;
  for (const line of descLines) {
    drawText(ctx, line, CARD_PADDING, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    curY += 20;
  }

  curY += 8;
  drawGlowText(ctx, "📜  SERVER RULES & GUIDELINES", CARD_PADDING, curY, COLORS.primaryLight, TITLE_FONT_SIZE - 2);
  curY += 20;

  const rules = [
    { num: "1", icon: "🚫", title: "Larangan Crack, Leak, & Bypass", desc: "Dilarang keras cracking/dekripsi loader, leak script, atau bypass ilegal. Sanksi: Blacklist permanen." },
    { num: "2", icon: "🤝", title: "Saling Menghormati & Jaga Etika", desc: "Bahasa sopan. Dilarang bullying, harassment, drama, toxic, SARA, NSFW." },
    { num: "3", icon: "🛡️", title: "Saluran Chat Sesuai Fungsi", desc: "Gunakan channel sesuai tujuan. Jangan spam chat, spam tag staf, atau iklan server lain." },
    { num: "4", icon: "🎫", title: "Sistem Ticket & Bug Report", desc: "Buka ticket hanya untuk masalah mendesak. Jangan abuse sistem tiket/bug report." },
    { num: "5", icon: "🔒", title: "Keamanan Akun & Transaksi", desc: "Staf TIDAK PERNAH meminta password. Transaksi resmi hanya via bot atau langsung Admin." },
  ];

  for (const rule of rules) {
    drawInnerCard(ctx, CARD_PADDING, curY, innerW, 60);
    drawText(ctx, `${rule.icon}  ${rule.num}. ${rule.title}`, CARD_PADDING + 16, curY + 20, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 1, fontWeight: "Bold" });
    const ruleLines = wrapText(ctx, rule.desc, innerW - 48, SMALL_FONT_SIZE + 1);
    ruleLines.forEach((line, i) => {
      drawText(ctx, line, CARD_PADDING + 16, curY + 38 + i * 16, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    });
    curY += 68;
  }

  curY += 8;
  drawGlowText(ctx, "⚖️  SISTEM SANKSI", CARD_PADDING, curY, COLORS.warningLight, TITLE_FONT_SIZE - 2);
  curY += 22;
  const sanctions = [
    "Ringan: Peringatan tertulis (Warning)",
    "Sedang: Timeout 10 menit — 7 hari",
    "Berat: Kick/Ban + Blacklist HWID & Roblox ID",
  ];
  for (const s of sanctions) {
    drawText(ctx, `•  ${s}`, CARD_PADDING + 8, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    curY += 22;
  }

  drawDivider(ctx, H - 40, CARD_WIDTH);
  drawFooter(ctx, "LeonX Hub  •  Official Guidelines", H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderAiResponseCard(data: {
  categoryLabel: string;
  response: string;
}): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const respLines = wrapText(tempCtx, data.response.replace(/\*\*/g, "").replace(/`/g, ""), CARD_WIDTH - CARD_PADDING * 2 - 32, BODY_FONT_SIZE);
  const H = 130 + respLines.length * 20;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d1117", "#0d1b2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.secondary);

  drawGlowText(ctx, "🤖  AI Support Assistant", CARD_PADDING, 58, COLORS.secondaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  const contentH = respLines.length * 20 + 16;
  drawInnerCard(ctx, CARD_PADDING, 76, innerW, contentH);
  let ly = 94;
  for (const line of respLines) {
    drawText(ctx, line, CARD_PADDING + 16, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, maxWidth: innerW - 32 });
    ly += 20;
  }

  drawFooter(ctx, "Tim support manusia akan segera membantu jika masalah belum teratasi.", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Claim & Small utility
// ──────────────────────────────────────────────────────

export async function renderClaimCard(claimedBy: string): Promise<Buffer> {
  const H = 100;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#0d170d", "#0d1117");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 18, CARD_WIDTH, COLORS.success);

  drawGlowText(ctx, "✋  Ticket Diklaim", CARD_PADDING, 52, COLORS.successLight, TITLE_FONT_SIZE);
  drawText(ctx, `${claimedBy} telah claim ticket ini dan akan membantu menyelesaikan masalahmu.`, CARD_PADDING, 76, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, maxWidth: CARD_WIDTH - CARD_PADDING * 2 });

  return finalizeCard(canvas);
}
