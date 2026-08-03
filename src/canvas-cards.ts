import { createCanvas, Canvas, GlobalFonts, type SKRSContext2D, loadImage } from "@napi-rs/canvas";
import { join } from "node:path";

// ──────────────────────────────────────────────────────
//  Font Registration
// ──────────────────────────────────────────────────────
const fontsDir = join(process.cwd(), "assets", "fonts");
try {
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-Regular.ttf"), "Inter");
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-Bold.ttf"), "Inter");
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-SemiBold.ttf"), "Inter");
  GlobalFonts.registerFromPath(join(fontsDir, "Inter-Medium.ttf"), "Inter");
} catch (e) {
  console.warn("[Canvas] Font registration failed – falling back to system fonts", e);
}

// ──────────────────────────────────────────────────────
//  Design System Tokens (Crisp, Elegant & Ultra-Clear)
// ──────────────────────────────────────────────────────
const COLORS = {
  primary: "#a855f7",
  primaryLight: "#d8b4fe",
  secondary: "#38bdf8",
  secondaryLight: "#7dd3fc",
  success: "#22c55e",
  successLight: "#4ade80",
  warning: "#facc15",
  warningLight: "#fef08a",
  danger: "#ef4444",
  dangerLight: "#fca5a5",
  info: "#06b6d4",

  bgDark: "#090714",
  bgMid: "#161128",
  bgCard: "rgba(30, 25, 55, 0.72)",
  bgCardBorder: "rgba(255, 255, 255, 0.16)",

  textPrimary: "#ffffff",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textAccent: "#c084fc",

  white: "#ffffff",
  black: "#000000",
} as const;

const CARD_WIDTH = 960;
const CARD_PADDING = 40;
const TITLE_FONT_SIZE = 28;
const SUBTITLE_FONT_SIZE = 22;
const BODY_FONT_SIZE = 18;
const SMALL_FONT_SIZE = 15;
const FIELD_LABEL_SIZE = 16;
const FIELD_VALUE_SIZE = 18;
const LINE_HEIGHT = 1.5;
const CARD_RADIUS = 18;
const INNER_CARD_RADIUS = 14;

// ──────────────────────────────────────────────────────
//  Helper: Drawing Primitives & Typography
// ──────────────────────────────────────────────────────

function getFontString(fontSize: number, fontWeight = ""): string {
  const fw = fontWeight.toLowerCase();
  let weight = "";
  if (fw === "bold") weight = "bold ";
  else if (fw === "semibold") weight = "600 ";
  else if (fw === "medium") weight = "500 ";

  return `${weight}${fontSize}px Inter, sans-serif`;
}

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

function drawOuterBorder(ctx: SKRSContext2D, w: number, h: number, color: string = COLORS.bgCardBorder) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, w - 2, h - 2, CARD_RADIUS);
  ctx.stroke();
}

function drawAccentBar(
  ctx: SKRSContext2D,
  y: number, w: number,
  color: string, barHeight = 5
) {
  const grad = ctx.createLinearGradient(CARD_PADDING, y, w - CARD_PADDING, y);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + "44");
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, CARD_PADDING, y, w - CARD_PADDING * 2, barHeight, 3);
  ctx.fill();
}

function drawInnerCard(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number,
  borderColor: string = COLORS.bgCardBorder
) {
  ctx.fillStyle = COLORS.bgCard;
  drawRoundedRect(ctx, x, y, w, h, INNER_CARD_RADIUS);
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, w, h, INNER_CARD_RADIUS);
  ctx.stroke();
}

function drawDivider(ctx: SKRSContext2D, y: number, w: number) {
  const grad = ctx.createLinearGradient(CARD_PADDING, y, w - CARD_PADDING, y);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.2, COLORS.bgCardBorder);
  grad.addColorStop(0.8, COLORS.bgCardBorder);
  grad.addColorStop(1, "transparent");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CARD_PADDING, y);
  ctx.lineTo(w - CARD_PADDING, y);
  ctx.stroke();
}

function drawTitleText(
  ctx: SKRSContext2D,
  text: string,
  x: number, y: number,
  color: string,
  fontSize: number = TITLE_FONT_SIZE,
  fontWeight = "Bold"
) {
  ctx.font = getFontString(fontSize, fontWeight);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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

  ctx.font = getFontString(fontSize, fontWeight);
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
  drawText(ctx, value, x, y + 22, { color: valueColor, fontSize: FIELD_VALUE_SIZE, fontWeight: "Bold" });
  return y + 50;
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
  drawText(ctx, value, x + labelWidth + 12, y, { color: valueColor, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "SemiBold" });
  return y + 26;
}

function drawStatusBadge(
  ctx: SKRSContext2D,
  text: string, x: number, y: number,
  color: string
) {
  ctx.font = getFontString(SMALL_FONT_SIZE, "Bold");
  const textWidth = ctx.measureText(text).width;
  const badgeW = textWidth + 28;
  const badgeH = 26;

  ctx.fillStyle = color + "25";
  drawRoundedRect(ctx, x, y, badgeW, badgeH, 8);
  ctx.fill();

  ctx.strokeStyle = color + "88";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, badgeW, badgeH, 8);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 12, y + badgeH / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(text, x + 22, y + badgeH / 2 + 5);

  return badgeW;
}

function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight = ""
): string[] {
  ctx.font = getFontString(fontSize, fontWeight);
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

    ctx.strokeStyle = COLORS.primaryLight;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch {
    ctx.fillStyle = COLORS.bgCard;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.bgCardBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawText(ctx, "👤", x + size / 2 - 10, y + size / 2 + 8, { fontSize: 24 });
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
  const H = 240;
  const { canvas, ctx } = createBaseCanvas(H);
  fillGradientBackground(ctx, CARD_WIDTH, H, "#07120a", "#0f2316");
  drawOuterBorder(ctx, CARD_WIDTH, H, "rgba(34, 197, 94, 0.4)");
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.success);

  drawTitleText(ctx, "✅  Verifikasi Member", CARD_PADDING, 68, COLORS.successLight, TITLE_FONT_SIZE);

  const desc = "Klik tombol Verify di bawah untuk menyetujui peraturan dan mendapatkan akses penuh ke seluruh channel server.";
  const lines = wrapText(ctx, desc, CARD_WIDTH - CARD_PADDING * 2, BODY_FONT_SIZE);
  let ty = 104;
  for (const line of lines) {
    drawText(ctx, line, CARD_PADDING, ty, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ty += Math.round(BODY_FONT_SIZE * LINE_HEIGHT);
  }

  drawDivider(ctx, H - 54, CARD_WIDTH);
  drawFooter(ctx, "LeonX Hub  •  Verification System", H - 24, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderStatusCard(data: {
  status: string;
  note: string;
}): Promise<Buffer> {
  const H = 260;
  const { canvas, ctx } = createBaseCanvas(H);

  const isOp = data.status === "operational";
  const isTest = data.status === "testing";
  const accentColor = isOp ? COLORS.success : isTest ? COLORS.warning : COLORS.danger;
  const statusText = isOp ? "Operational" : isTest ? "Testing / Updating" : "Maintenance / Patched";
  const statusIcon = isOp ? "🟢" : isTest ? "🟡" : "🔴";

  fillGradientBackground(ctx, CARD_WIDTH, H, "#090714", "#161128");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, accentColor);

  drawTitleText(ctx, "📊  Status Script & Bot", CARD_PADDING, 68, COLORS.textPrimary, TITLE_FONT_SIZE);

  const innerX = CARD_PADDING;
  const innerY = 90;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, innerX, innerY, innerW, 88);

  drawText(ctx, "LeonX Hub Script", innerX + 20, innerY + 30, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawStatusBadge(ctx, `${statusIcon} ${statusText}`, innerX + 20, innerY + 44, accentColor);

  drawText(ctx, "Bot Discord", innerX + innerW / 2 + 20, innerY + 30, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawStatusBadge(ctx, "🟢 Online", innerX + innerW / 2 + 20, innerY + 44, COLORS.success);

  drawText(ctx, "Catatan:", CARD_PADDING, H - 64, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, data.note, CARD_PADDING, H - 42, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, maxWidth: CARD_WIDTH - CARD_PADDING * 2 });

  drawFooter(ctx, "LeonX Hub  •  Status Monitor", H - 16, CARD_WIDTH);

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
  const historyHeight = data.history.length * 32 + 24;
  const H = 370 + (data.history.length > 0 ? historyHeight : 0);
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#090714", "#180e2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.primary);

  drawTitleText(ctx, "🔑  Informasi Key & Lisensi Anda", CARD_PADDING, 68, COLORS.primaryLight, TITLE_FONT_SIZE);

  const innerX = CARD_PADDING;
  let curY = 92;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;

  drawInnerCard(ctx, innerX, curY, innerW, 190);
  const fx = innerX + 20;
  curY += 12;
  curY = drawFieldRow(ctx, "🔑  KEY LISENSI", data.key, fx, curY + 16);
  curY = drawFieldRow(ctx, "👤  AKUN ROBLOX", data.robloxId || "Belum tertaut", fx, curY);
  curY = drawFieldRow(ctx, "💻  PERANGKAT (HWID)", data.hwid || "Belum tertaut", fx, curY);

  curY += 8;
  const statsY = curY;
  drawInnerCard(ctx, innerX, statsY, innerW, 54);
  const third = innerW / 3;
  drawText(ctx, "🔄 Reset HWID", fx, statsY + 20, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE });
  drawText(ctx, data.cooldownText, fx, statsY + 40, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "Bold" });

  drawText(ctx, "📊 Total Eksekusi", fx + third, statsY + 20, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE });
  drawText(ctx, `${data.totalExec} kali`, fx + third, statsY + 40, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "Bold" });

  drawText(ctx, "📅 Tanggal Dibuat", fx + third * 2, statsY + 20, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE });
  drawText(ctx, data.createdAt, fx + third * 2, statsY + 40, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "Bold" });

  curY = statsY + 74;

  if (data.history.length > 0) {
    drawText(ctx, "📜  Riwayat Eksekusi Terakhir", CARD_PADDING, curY + 10, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "Bold" });
    curY += 34;
    drawInnerCard(ctx, innerX, curY, innerW, historyHeight);
    curY += 16;

    for (const entry of data.history) {
      drawText(ctx, `•  ${entry.date}`, fx, curY, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
      drawText(ctx, `Game: ${entry.placeId}  |  Executor: ${entry.executor}  |  User: ${entry.robloxName}`, fx + 22, curY + 20, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE });
      curY += 32;
    }
  }

  drawFooter(ctx, "LeonX Hub  •  License System", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderFaqCard(topic: string, answer: string): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const lines = wrapText(tempCtx, answer, CARD_WIDTH - CARD_PADDING * 2 - 32, BODY_FONT_SIZE);
  const H = 140 + lines.length * Math.round(BODY_FONT_SIZE * LINE_HEIGHT);
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#07141a", "#0e242e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.info);

  drawTitleText(ctx, `💡  FAQ: ${topic}`, CARD_PADDING, 68, COLORS.info, TITLE_FONT_SIZE);

  let ty = 98;
  for (const line of lines) {
    drawText(ctx, line, CARD_PADDING + 8, ty, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ty += Math.round(BODY_FONT_SIZE * LINE_HEIGHT);
  }

  drawFooter(ctx, "LeonX Hub  •  FAQ", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderWebsiteCard(): Promise<Buffer> {
  const H = 200;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, "🌐  LeonThings Official Website", CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);

  drawInnerCard(ctx, CARD_PADDING, 88, CARD_WIDTH - CARD_PADDING * 2, 70);
  drawText(ctx, "🌐  Website Utama", CARD_PADDING + 20, 114, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, "https://leonthings.my.id", CARD_PADDING + 20, 138, { color: COLORS.secondaryLight, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

  drawText(ctx, "🤖  Bot Console", CARD_PADDING + CARD_WIDTH / 2 - 10, 114, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, "https://leonthings.my.id/bot", CARD_PADDING + CARD_WIDTH / 2 - 10, 138, { color: COLORS.secondaryLight, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

  drawFooter(ctx, "LeonX Hub  •  Official Links", H - 16, CARD_WIDTH);

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
  const H = 480;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  if (data.avatarUrl) {
    await drawCircularAvatar(ctx, data.avatarUrl, CARD_PADDING, 44, 80);
  }

  const nameX = data.avatarUrl ? CARD_PADDING + 100 : CARD_PADDING;
  drawTitleText(ctx, `${data.displayName}${data.hasVerifiedBadge ? " ☑️" : ""}`, nameX, 76, COLORS.textPrimary, TITLE_FONT_SIZE);
  drawText(ctx, `@${data.username}  •  ID: ${data.userId}`, nameX, 100, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE });

  const badgeColor = data.isBanned ? COLORS.danger : COLORS.success;
  const badgeText = data.isBanned ? "Banned" : "Aktif";
  drawStatusBadge(ctx, badgeText, nameX, 110, badgeColor);

  let curY = 146;
  if (data.description) {
    drawInnerCard(ctx, CARD_PADDING, curY, CARD_WIDTH - CARD_PADDING * 2, 70);
    const descLines = wrapText(ctx, data.description.slice(0, 250), CARD_WIDTH - CARD_PADDING * 2 - 36, SMALL_FONT_SIZE + 1);
    let dy = curY + 22;
    for (const line of descLines.slice(0, 3)) {
      drawText(ctx, line, CARD_PADDING + 18, dy, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1 });
      dy += 18;
    }
    curY += 84;
  }

  const statsW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, curY, statsW, 90);
  const col = statsW / 4;
  const statItems = [
    { label: "Teman", value: data.friends },
    { label: "Pengikut", value: data.followers },
    { label: "Mengikuti", value: data.following },
    { label: "RAP", value: data.rap },
  ];
  statItems.forEach((item, i) => {
    const sx = CARD_PADDING + col * i + 20;
    drawText(ctx, item.label, sx, curY + 30, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, curY + 56, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });
  });
  curY += 106;

  drawText(ctx, "🏷️  Riwayat Nama", CARD_PADDING, curY + 6, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, data.usernameHistory, CARD_PADDING, curY + 28, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE + 1, maxWidth: CARD_WIDTH - CARD_PADDING * 2 });
  curY += 50;

  drawText(ctx, "📅  Tanggal Dibuat:", CARD_PADDING, curY + 6, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "SemiBold" });
  drawText(ctx, data.createdAt, CARD_PADDING + 160, curY + 6, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "Bold" });

  drawDivider(ctx, H - 44, CARD_WIDTH);
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
  const H = 350;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#07120a", "#0f2316");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.success);

  drawTitleText(ctx, `🎮  ${data.gameName}`, CARD_PADDING, 68, COLORS.successLight, TITLE_FONT_SIZE);
  drawText(ctx, `by ${data.creator}  •  Place ID: ${data.placeId}  •  Universe ID: ${data.universeId}`, CARD_PADDING, 94, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;

  drawInnerCard(ctx, innerX, 112, innerW, 90);
  const col3 = innerW / 3;
  const row1 = [
    { label: "🟢 Playing", value: data.playing },
    { label: "📈 Total Visits", value: data.visits },
    { label: "⭐ Favorites", value: data.favorites },
  ];
  row1.forEach((item, i) => {
    const sx = innerX + col3 * i + 20;
    drawText(ctx, item.label, sx, 138, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 166, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  });

  drawInnerCard(ctx, innerX, 214, innerW, 90);
  const row2 = [
    { label: "👍 Likes", value: data.likes },
    { label: "👎 Dislikes", value: data.dislikes },
    { label: "📊 Like Ratio", value: data.likeRatio },
  ];
  row2.forEach((item, i) => {
    const sx = innerX + col3 * i + 20;
    drawText(ctx, item.label, sx, 240, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 268, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  });

  drawFooter(ctx, "LeonX Hub  •  Game Monitor", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderGameServersCard(data: {
  placeId: string;
  servers: Array<{ num: number; playing: number; max: number; fps: string; ping: string; joinUrl: string }>;
}): Promise<Buffer> {
  const perServer = 64;
  const H = 150 + data.servers.length * perServer;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, `📈  Server Aktif — Place ID ${data.placeId}`, CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);
  drawText(ctx, "Salin link di bawah, lalu paste di Windows Run (Win + R) atau browser.", CARD_PADDING, 94, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 112;

  for (const srv of data.servers) {
    drawInnerCard(ctx, innerX, curY, innerW, perServer - 8);
    const sx = innerX + 20;
    drawText(ctx, `🖥️  Server #${srv.num}`, sx, curY + 22, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });
    drawText(ctx, `${srv.playing}/${srv.max} Players`, sx + 180, curY + 22, { color: COLORS.textAccent, fontSize: BODY_FONT_SIZE, fontWeight: "SemiBold" });
    drawText(ctx, `FPS: ${srv.fps}  |  Ping: ${srv.ping}`, sx + 340, curY + 22, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    drawText(ctx, srv.joinUrl, sx, curY + 42, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE, maxWidth: innerW - 40 });
    curY += perServer;
  }

  drawFooter(ctx, "LeonX Hub  •  Server Tracker", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderGameUpdateAlertCard(data: {
  gameName: string;
  placeId: string;
  universeId: number;
  updatedAt: string;
}): Promise<Buffer> {
  const H = 280;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1c0909", "#301010");
  drawOuterBorder(ctx, CARD_WIDTH, H, "rgba(239, 68, 68, 0.5)");
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.danger);

  drawTitleText(ctx, `🚨  GAME UPDATE DETECTED`, CARD_PADDING, 68, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, innerX, 90, innerW, 114);
  const fx = innerX + 20;
  let fy = 114;
  fy = drawFieldRowInline(ctx, "Nama Game:", data.gameName, fx, fy);
  fy = drawFieldRowInline(ctx, "Place ID:", data.placeId, fx, fy);
  fy = drawFieldRowInline(ctx, "Universe ID:", String(data.universeId), fx, fy);
  fy = drawFieldRowInline(ctx, "Waktu Pembaruan:", data.updatedAt, fx, fy);

  drawText(ctx, "⚠️  Status bot otomatis dialihkan ke Testing/Updating.", CARD_PADDING, H - 56, { color: COLORS.warningLight, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });
  drawText(ctx, "Pengembang diharapkan segera mengecek kecocokan script loader.", CARD_PADDING, H - 34, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  drawFooter(ctx, "LeonX Hub  •  Auto-Update Detector", H - 14, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderMonitorListCard(data: {
  items: Array<{ name: string; placeId: string; lastUpdated: string }>;
}): Promise<Buffer> {
  const perItem = 48;
  const H = 130 + data.items.length * perItem;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, "🔍  Game Update Monitoring List", CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);

  let curY = 96;
  const innerX = CARD_PADDING;
  const innerW = CARD_WIDTH - CARD_PADDING * 2;

  for (const item of data.items) {
    drawInnerCard(ctx, innerX, curY, innerW, perItem - 8);
    drawText(ctx, `•  ${item.name}`, innerX + 20, curY + 22, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });
    drawText(ctx, `(Place ID: ${item.placeId})`, innerX + 20 + ctx.measureText(`•  ${item.name} `).width, curY + 22, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    drawText(ctx, `Last Updated: ${item.lastUpdated}`, innerX + 40, curY + 38, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE });
    curY += perItem;
  }

  drawFooter(ctx, "LeonX Hub  •  Monitoring", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 3: Ticket System
// ──────────────────────────────────────────────────────

export async function renderTicketPanelCard(categories: Array<{ emoji: string; label: string; description: string }>): Promise<Buffer> {
  const perCat = 34;
  const H = 260 + categories.length * perCat;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, "🎫  Support Ticket System", CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);
  drawText(ctx, "Butuh bantuan? Pilih kategori yang sesuai pada menu di bawah.", CARD_PADDING, 98, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });

  let curY = 128;
  drawText(ctx, "Kategori yang tersedia:", CARD_PADDING, curY, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "Bold" });
  curY += 30;

  for (const cat of categories) {
    drawText(ctx, `${cat.emoji}  ${cat.label}`, CARD_PADDING + 10, curY, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });
    drawText(ctx, ` — ${cat.description}`, CARD_PADDING + 10 + ctx.measureText(`${cat.emoji}  ${cat.label}`).width, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    curY += perCat;
  }

  curY += 10;
  drawInnerCard(ctx, CARD_PADDING, curY, CARD_WIDTH - CARD_PADDING * 2, 58);
  drawText(ctx, "📌  Catatan:", CARD_PADDING + 20, curY + 22, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "Bold" });
  drawText(ctx, "Satu user hanya bisa memiliki 1 ticket aktif  •  Tim support merespons dalam 1-24 jam", CARD_PADDING + 20, curY + 44, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE });

  drawFooter(ctx, "LeonX Hub  •  Support System", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketWelcomeCard(data: {
  categoryEmoji: string;
  categoryLabel: string;
  userId: string;
  ticketId: string;
}): Promise<Buffer> {
  const H = 310;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, `${data.categoryEmoji}  ${data.categoryLabel}`, CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 80);
  drawText(ctx, "Kategori:", CARD_PADDING + 20, 116, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE });
  drawText(ctx, data.categoryLabel, CARD_PADDING + 100, 116, { color: COLORS.textPrimary, fontSize: FIELD_LABEL_SIZE + 1, fontWeight: "Bold" });
  drawText(ctx, "Status:", CARD_PADDING + 20, 144, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE });
  drawStatusBadge(ctx, "🟢 Open", CARD_PADDING + 90, 130, COLORS.success);

  const tips = [
    "Sertakan screenshot/video jika ada masalah teknis",
    "Jelaskan langkah-langkah yang sudah Anda coba",
    "Sebutkan versi script atau executor yang digunakan",
  ];
  drawText(ctx, "💡  Tips Bantuan:", CARD_PADDING, 196, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "Bold" });
  tips.forEach((tip, i) => {
    drawText(ctx, `•  ${tip}`, CARD_PADDING + 10, 224 + i * 24, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
  });

  drawFooter(ctx, `Ticket ID: #${data.ticketId}`, H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketCloseCard(data: {
  closedBy: string;
  reason: string;
}): Promise<Buffer> {
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1c0909", "#2b0f16");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.danger);

  drawTitleText(ctx, "🔒  Ticket Ditutup", CARD_PADDING, 68, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 74);
  drawFieldRowInline(ctx, "Ditutup oleh:", data.closedBy, CARD_PADDING + 20, 116);
  drawFieldRowInline(ctx, "Alasan:", data.reason, CARD_PADDING + 20, 142);

  drawText(ctx, "Transcript telah disimpan. Pembuat ticket dapat memberikan rating.", CARD_PADDING, H - 48, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  drawFooter(ctx, "Terima kasih sudah menggunakan support system kami!", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderTicketRatingCard(): Promise<Buffer> {
  const H = 180;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, "📊  Beri Rating untuk Support Kami", CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);

  drawText(ctx, "Bagaimana pengalaman Anda dengan layanan support kami?", CARD_PADDING, 102, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });
  drawText(ctx, "Rating kamu sangat membantu kami untuk terus meningkatkan layanan.", CARD_PADDING, 128, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });

  drawFooter(ctx, "Pilih bintang rating di bawah ini", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderRatingThanksCard(rating: number): Promise<Buffer> {
  const H = 180;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071a0e", "#0f2e1a");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.success);

  drawTitleText(ctx, "✅  Terima Kasih!", CARD_PADDING, 68, COLORS.successLight, TITLE_FONT_SIZE);

  const stars = "⭐".repeat(rating);
  drawText(ctx, `Rating kamu: ${stars}`, CARD_PADDING, 106, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  drawText(ctx, "Kami akan terus meningkatkan kualitas pelayanan support.", CARD_PADDING, 134, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });

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
  const catHeight = data.byCategory.length > 0 ? data.byCategory.length * 26 + 36 : 0;
  const H = 260 + catHeight;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, "📊  Statistik Ticket System", CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 90);
  const col = innerW / 4;
  const stats = [
    { label: "📝 Total", value: String(data.total) },
    { label: "🟢 Open", value: String(data.open) },
    { label: "🔒 Closed", value: String(data.closed) },
    { label: "⭐ Avg Rating", value: data.avgRating },
  ];
  stats.forEach((item, i) => {
    const sx = CARD_PADDING + col * i + 20;
    drawText(ctx, item.label, sx, 118, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 146, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  });

  if (data.byCategory.length > 0) {
    let curY = 206;
    drawText(ctx, "📂  Berdasarkan Kategori:", CARD_PADDING, curY, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "Bold" });
    curY += 28;
    for (const cat of data.byCategory) {
      drawText(ctx, `${cat.emoji}  ${cat.category}: ${cat.count}`, CARD_PADDING + 10, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
      curY += 26;
    }
  }

  drawFooter(ctx, "LeonX Hub  •  Ticket System", H - 16, CARD_WIDTH);

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
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#090714", "#180e2e");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.primary);

  drawTitleText(ctx, "📊  Statistik Admin Server", CARD_PADDING, 68, COLORS.primaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 90);
  const col = innerW / 4;
  const stats = [
    { label: "👥 Total Member", value: String(data.memberCount) },
    { label: "🎫 Ticket Aktif", value: String(data.openTickets) },
    { label: "🐛 Bug Report", value: String(data.bugReports) },
    { label: "⚡ Command Dipakai", value: String(data.commandsUsed) },
  ];
  stats.forEach((item, i) => {
    const sx = CARD_PADDING + col * i + 20;
    drawText(ctx, item.label, sx, 118, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
    drawText(ctx, item.value, sx, 146, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 4, fontWeight: "Bold" });
  });

  drawFooter(ctx, "LeonX Hub  •  Admin Dashboard", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderBlacklistCard(data: {
  items: Array<{ id: number; discordId: string | null; robloxId: string | null; hwid: string | null; reason: string; createdAt: string }>;
}): Promise<Buffer> {
  const perItem = 68;
  const H = 120 + data.items.length * perItem;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1c0909", "#2b0f16");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.danger);

  drawTitleText(ctx, "🚫  Daftar Blacklist LeonX", CARD_PADDING, 68, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 94;

  for (const item of data.items) {
    drawInnerCard(ctx, CARD_PADDING, curY, innerW, perItem - 10);
    const fx = CARD_PADDING + 20;
    drawText(ctx, `#${item.id}`, fx, curY + 22, { color: COLORS.dangerLight, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

    let detail = "";
    if (item.discordId) detail += `Discord ID: ${item.discordId}  `;
    if (item.robloxId) detail += `Roblox ID: ${item.robloxId}  `;
    if (item.hwid) detail += `HWID: ${item.hwid}`;
    drawText(ctx, detail, fx + 50, curY + 22, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1, maxWidth: innerW - 90 });
    drawText(ctx, `Alasan: ${item.reason} (${item.createdAt})`, fx, curY + 44, { color: COLORS.textMuted, fontSize: SMALL_FONT_SIZE, maxWidth: innerW - 40 });
    curY += perItem;
  }

  drawFooter(ctx, "LeonX Hub  •  Blacklist System", H - 16, CARD_WIDTH);

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
  const keyHeight = data.keys.length * 130;
  const execHeight = data.executions.length * 40;
  const H = 200 + keyHeight + execHeight + (data.executions.length > 0 ? 50 : 0);
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1c0909", "#2b0f16");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.danger);

  drawTitleText(ctx, "🔍  Hasil Lookup Data Lisensi", CARD_PADDING, 68, COLORS.dangerLight, TITLE_FONT_SIZE);
  drawText(ctx, `Kriteria: ${data.searchCriteria}`, CARD_PADDING, 94, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });

  const blColor = data.isBlacklisted ? COLORS.danger : COLORS.success;
  drawStatusBadge(ctx, data.isBlacklisted ? "BLACKLISTED" : "Clean", CARD_PADDING, 106, blColor);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 144;

  if (data.keys.length === 0) {
    drawInnerCard(ctx, CARD_PADDING, curY, innerW, 44);
    drawText(ctx, "❌  Tidak ditemukan data key/lisensi.", CARD_PADDING + 20, curY + 28, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    curY += 60;
  } else {
    for (let i = 0; i < data.keys.length; i++) {
      const k = data.keys[i]!;
      drawText(ctx, `🔑  Key #${i + 1}`, CARD_PADDING, curY + 6, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "Bold" });
      curY += 28;
      drawInnerCard(ctx, CARD_PADDING, curY, innerW, 100);
      const fx = CARD_PADDING + 20;
      let fy = curY + 20;
      fy = drawFieldRowInline(ctx, "Key:", k.key, fx, fy);
      fy = drawFieldRowInline(ctx, "Discord:", k.discordId, fx, fy);
      fy = drawFieldRowInline(ctx, "Roblox:", k.robloxId || "Belum tertaut", fx, fy);
      fy = drawFieldRowInline(ctx, "HWID:", k.hwid || "Belum tertaut", fx, fy);
      curY += 114;
    }
  }

  if (data.executions.length > 0) {
    drawText(ctx, "📊  Riwayat Eksekusi", CARD_PADDING, curY + 6, { color: COLORS.textAccent, fontSize: SUBTITLE_FONT_SIZE, fontWeight: "Bold" });
    curY += 30;
    for (const ex of data.executions) {
      drawText(ctx, `•  ${ex.date}  —  Game: ${ex.placeId}  |  Exec: ${ex.executor}  |  ${ex.robloxName}`, CARD_PADDING + 10, curY, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1, maxWidth: innerW - 20 });
      curY += 24;
    }
  }

  drawFooter(ctx, "LeonX Hub  •  Admin Lookup", H - 16, CARD_WIDTH);

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
  const descH = descLines.length * 24 + 36;
  const stepsH = stepsLines.length * 24 + 36;
  const H = 160 + descH + stepsH;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1f1807", "#332709");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.warning);

  drawTitleText(ctx, `🐛  Laporan Bug #${data.id}: ${data.title}`, CARD_PADDING, 68, COLORS.warningLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  let curY = 94;

  drawInnerCard(ctx, CARD_PADDING, curY, innerW, descH);
  drawText(ctx, "Deskripsi Bug:", CARD_PADDING + 20, curY + 24, { color: COLORS.textAccent, fontSize: FIELD_LABEL_SIZE, fontWeight: "Bold" });
  let ly = curY + 48;
  for (const line of descLines) {
    drawText(ctx, line, CARD_PADDING + 20, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ly += 24;
  }
  curY += descH + 12;

  drawInnerCard(ctx, CARD_PADDING, curY, innerW, stepsH);
  drawText(ctx, "Langkah Mengulang Bug:", CARD_PADDING + 20, curY + 24, { color: COLORS.textAccent, fontSize: FIELD_LABEL_SIZE, fontWeight: "Bold" });
  ly = curY + 48;
  for (const line of stepsLines) {
    drawText(ctx, line, CARD_PADDING + 20, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ly += 24;
  }

  drawFooter(ctx, `Dilaporkan oleh ${data.reporter}`, H - 16, CARD_WIDTH);

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
  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  const contentLines = data.formattedContent.split("\n").filter(Boolean);
  const contentH = contentLines.length * 26 + 30;
  const H = 270 + contentH;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#090714", "#161128");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, data.typeColor);

  drawTitleText(ctx, "🚀  LeonX Script Update Logs", CARD_PADDING, 68, COLORS.textPrimary, TITLE_FONT_SIZE);
  drawStatusBadge(ctx, `${data.typeEmoji} ${data.typeLabel}`, CARD_PADDING + 420, 48, data.typeColor);

  drawInnerCard(ctx, CARD_PADDING, 94, innerW, 68);
  drawFieldRowInline(ctx, "Place:", data.gameName, CARD_PADDING + 20, 118);
  drawFieldRowInline(ctx, "Version:", data.version, CARD_PADDING + 20, 142);

  drawText(ctx, "Developer Notes:", CARD_PADDING, 186, { color: COLORS.textSecondary, fontSize: FIELD_LABEL_SIZE, fontWeight: "Bold" });
  const summaryLines = wrapText(tempCtx, data.summary, innerW, BODY_FONT_SIZE);
  let sy = 210;
  for (const line of summaryLines.slice(0, 2)) {
    drawText(ctx, line, CARD_PADDING, sy, { color: COLORS.textMuted, fontSize: BODY_FONT_SIZE });
    sy += 24;
  }

  drawDivider(ctx, sy + 8, CARD_WIDTH);
  sy += 26;

  for (const line of contentLines) {
    const cleanLine = line.replace(/\*\*/g, "").replace(/`/g, "").replace(/> /g, "");
    const isSection = cleanLine.startsWith("✨") || cleanLine.startsWith("🔧") || cleanLine.startsWith("⚡") || cleanLine.startsWith("🗑️") || cleanLine.startsWith("🛠️") || cleanLine.startsWith("🚀");
    if (isSection) {
      drawText(ctx, cleanLine, CARD_PADDING, sy, { color: COLORS.textAccent, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });
    } else {
      drawText(ctx, cleanLine, CARD_PADDING + 12, sy, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, maxWidth: innerW - 24 });
    }
    sy += 26;
  }

  drawFooter(ctx, `LeonX Hub ${data.version}  •  ${data.statusFooter}`, H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 5: Logs & AutoMod
// ──────────────────────────────────────────────────────

export async function renderAutoModCard(data: {
  title: string;
  description: string;
  userTag: string;
  userId: string;
  detail: string;
  extraField?: string;
}): Promise<Buffer> {
  const H = 240;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1c0909", "#2b0f16");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.danger);

  drawTitleText(ctx, `🛡️  ${data.title}`, CARD_PADDING, 68, COLORS.dangerLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 90);
  const fx = CARD_PADDING + 20;
  let fy = 114;
  fy = drawFieldRowInline(ctx, "Pengguna:", `${data.userTag} (${data.userId})`, fx, fy);
  fy = drawFieldRowInline(ctx, "Detail:", data.detail, fx, fy);
  if (data.extraField) {
    fy = drawFieldRowInline(ctx, "Info Tambahan:", data.extraField, fx, fy);
  }

  const descLines = wrapText(ctx, data.description, innerW, SMALL_FONT_SIZE + 1);
  let dy = H - 52;
  for (const line of descLines.slice(0, 2)) {
    drawText(ctx, line, CARD_PADDING, dy, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE + 1 });
    dy += 18;
  }

  drawFooter(ctx, "LeonX Hub  •  Auto Mod", H - 16, CARD_WIDTH);

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
  const H = 240;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#07170e", "#0f2e1a");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.success);

  drawTitleText(ctx, "📊  In-Game Script Executed!", CARD_PADDING, 68, COLORS.successLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 110);
  const fx = CARD_PADDING + 20;
  let fy = 114;
  fy = drawFieldRowInline(ctx, "Discord User:", data.discordId || "Unknown", fx, fy);
  fy = drawFieldRowInline(ctx, "Roblox User:", `${data.robloxUsername} (${data.robloxId || "N/A"})`, fx, fy);
  fy = drawFieldRowInline(ctx, "Game / Place ID:", data.placeId, fx, fy);
  fy = drawFieldRowInline(ctx, "Executor:", data.executor, fx, fy);
  drawFieldRowInline(ctx, "Perangkat (HWID):", data.hwid || "N/A", fx, fy);

  drawFooter(ctx, "LeonX Hub  •  Execution Log", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderRatingLogCard(data: {
  ticketId: number;
  category: string;
  rating: number;
  userId: string;
  claimedBy: string;
}): Promise<Buffer> {
  const H = 220;
  const { canvas, ctx } = createBaseCanvas(H);
  const ratingColor = data.rating >= 4 ? COLORS.success : data.rating >= 3 ? COLORS.warning : COLORS.danger;

  fillGradientBackground(ctx, CARD_WIDTH, H, "#090714", "#161128");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, ratingColor);

  drawTitleText(ctx, "📊  Rating Ticket Terbaru", CARD_PADDING, 68, ratingColor, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 90);
  const half = innerW / 2;
  const fx = CARD_PADDING + 20;

  drawText(ctx, "Ticket ID", fx, 114, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
  drawText(ctx, `#${data.ticketId}`, fx, 138, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });

  drawText(ctx, "Kategori", fx + half / 2, 114, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
  drawText(ctx, data.category, fx + half / 2, 138, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });

  drawText(ctx, "Rating", fx + half, 114, { color: COLORS.textSecondary, fontSize: SMALL_FONT_SIZE, fontWeight: "Medium" });
  drawText(ctx, `${"⭐".repeat(data.rating)} (${data.rating}/5)`, fx + half, 138, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });

  drawFooter(ctx, "LeonX Hub  •  Support Feedback", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderAutoBanCard(data: {
  userTag: string;
  userId: string;
  accountAgeDays: number;
  createdAt: string;
  avatarUrl: string | null;
}): Promise<Buffer> {
  const H = 280;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#1c0909", "#301010");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.danger);

  drawTitleText(ctx, "⛔  Auto-Ban: Akun Terlalu Baru", CARD_PADDING, 68, COLORS.dangerLight, TITLE_FONT_SIZE);

  if (data.avatarUrl) {
    await drawCircularAvatar(ctx, data.avatarUrl, CARD_WIDTH - CARD_PADDING - 72, 40, 72);
  }

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  drawInnerCard(ctx, CARD_PADDING, 90, innerW, 100);
  const fx = CARD_PADDING + 20;
  let fy = 114;
  fy = drawFieldRowInline(ctx, "User:", `${data.userTag} (${data.userId})`, fx, fy);
  fy = drawFieldRowInline(ctx, "Umur Akun:", `${data.accountAgeDays} hari`, fx, fy);
  fy = drawFieldRowInline(ctx, "Akun Dibuat:", data.createdAt, fx, fy);

  drawText(ctx, "Akun ini otomatis di-ban demi keamanan server karena berumur kurang dari 30 hari.", CARD_PADDING, H - 56, { color: COLORS.warningLight, fontSize: BODY_FONT_SIZE });

  drawFooter(ctx, "LeonX Hub  •  Anti-Raid Protection", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

// ──────────────────────────────────────────────────────
//  CARD RENDERERS — Group 6: Events & Rules
// ──────────────────────────────────────────────────────

export async function renderWelcomeCard(data: {
  username: string;
  avatarUrl: string;
  guildName: string;
  memberCount: number;
  verifyChannelId: string;
}): Promise<Buffer> {
  // Load background image
  const bgPath = join(process.cwd(), "assets", "welcome.png");
  const bgImg = await loadImage(bgPath);
  const W = bgImg.width;
  const H = bgImg.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Draw background image
  ctx.drawImage(bgImg, 0, 0, W, H);

  // Draw circular user avatar centered in the background circle
  const centerX = Math.round(W / 2);
  const centerY = 540;
  const avatarRadius = 170;

  try {
    const avatarImg = await loadImage(data.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, centerX - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();
  } catch {
    // Fallback if avatar can't be loaded
  }

  // Draw user display name below background text
  ctx.font = getFontString(42, "Bold");
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 16;
  ctx.fillText(data.username, centerX, 910);
  ctx.shadowBlur = 0;

  // Draw member count
  ctx.font = getFontString(20, "Medium");
  ctx.fillStyle = "rgba(180, 180, 200, 0.5)";
  ctx.fillText(`Member #${data.memberCount}`, centerX, 938);
  ctx.textAlign = "left";

  return Buffer.from(await canvas.encode("png"));
}

export async function renderGoodbyeCard(data: {
  userTag: string;
  avatarUrl: string;
  guildName: string;
  memberCount: number;
}): Promise<Buffer> {
  // Load background image
  const bgPath = join(process.cwd(), "assets", "goodbye.png");
  const bgImg = await loadImage(bgPath);
  const W = bgImg.width;
  const H = bgImg.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Draw background image
  ctx.drawImage(bgImg, 0, 0, W, H);

  // Draw circular user avatar centered in the background circle
  const centerX = Math.round(W / 2);
  const centerY = 555;
  const avatarRadius = 170;

  try {
    const avatarImg = await loadImage(data.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, centerX - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();
  } catch {
    // Fallback if avatar can't be loaded
  }

  // Draw user tag below background text
  ctx.font = getFontString(42, "Bold");
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 16;
  ctx.fillText(data.userTag, centerX, 910);
  ctx.shadowBlur = 0;

  // Draw member count
  ctx.font = getFontString(20, "Medium");
  ctx.fillStyle = "rgba(180, 180, 200, 0.5)";
  ctx.fillText(`Member #${data.memberCount}`, centerX, 938);
  ctx.textAlign = "left";

  return Buffer.from(await canvas.encode("png"));
}

/**
 * Full, Dynamic, Ultra-Clear Server Rules Card
 * Renders exact requested wording without truncation or symbols.
 */
export async function renderRulesCard(): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const pad = CARD_PADDING;
  const innerW = CARD_WIDTH - pad * 2;

  const introText =
    "Selamat datang di server resmi LeonX Hub. Server ini adalah wadah diskusi, pembaruan script, laporan bug, serta layanan bantuan bagi seluruh pengguna LeonX Hub.\n\n" +
    "Harap luangkan waktu sejenak untuk membaca dan mematuhi peraturan kami demi menjaga kenyamanan bersama di dalam server ini.";

  const rulesData = [
    {
      icon: "🚫",
      title: "Larangan Keras Crack, Leak, & Bypass",
      desc: "Dilarang keras mencoba melakukan cracking/dekripsi loader, membagikan/leaking script LeonX ke luar server, atau menggunakan bypass ilegal. Pelanggaran berat ini akan berakibat pada Blacklist HWID + Roblox ID + Discord ID secara permanen dari seluruh layanan kami."
    },
    {
      icon: "🤝",
      title: "Saling Menghormati & Jaga Etika",
      desc: "Gunakan bahasa yang sopan. Dilarang melakukan cyberbullying, harassment, memicu drama/debat kusir, toxic berlebih, SARA, atau mengirim konten NSFW/pornografi."
    },
    {
      icon: "🛡️",
      title: "Saluran Chat Sesuai Fungsi",
      desc: "Gunakan channel sesuai dengan tujuannya. Jangan melakukan spam chat, spam tag staf/developer tanpa alasan mendesak, atau membagikan iklan/link promosi server lain (Anti-Link aktif)."
    },
    {
      icon: "🎫",
      title: "Penggunaan Sistem Ticket & Bug Report",
      desc: "Buka ticket support hanya untuk masalah teknis/transaksi yang mendesak. Kirim laporan bug nyata via /bug-report. Menyalahgunakan sistem tiket/laporan bug untuk spam atau bercanda akan dikenakan sanksi."
    },
    {
      icon: "🔒",
      title: "Keamanan Akun & Transaksi Resmi",
      desc: "Staf LeonX Hub TIDAK PERNAH meminta password akun Roblox atau token Discord Anda. Segala bentuk transaksi resmi hanya dilakukan melalui bot resmi atau langsung dengan Admin."
    }
  ];

  const sanctionsData = [
    "• Pelanggaran Ringan: Peringatan tertulis (Warning) via database bot.",
    "• Pelanggaran Sedang: Timeout (Mute otomatis) mulai dari 10 menit hingga 7 hari.",
    "• Pelanggaran Berat: Kick, Banned permanen dari Discord, serta Blacklist HWID & Roblox ID di server database game."
  ];

  const footerNote = "Jika Anda belum terverifikasi, silakan selesaikan proses verifikasi dengan menekan tombol Verify di channel verifikasi.";

  // Pre-calculate heights
  const introLines = wrapText(tempCtx, introText, innerW - 40, BODY_FONT_SIZE);
  const introBlockH = introLines.length * 28 + 36;

  const ruleHeights: number[] = [];
  for (const r of rulesData) {
    const lines = wrapText(tempCtx, r.desc, innerW - 48, BODY_FONT_SIZE);
    const boxH = 46 + lines.length * 28 + 18;
    ruleHeights.push(boxH);
  }
  const rulesTotalH = ruleHeights.reduce((acc, h) => acc + h + 16, 0);

  const sanctionLinesList: string[][] = [];
  for (const s of sanctionsData) {
    sanctionLinesList.push(wrapText(tempCtx, s, innerW - 48, BODY_FONT_SIZE));
  }
  const sanctionsBoxH = 60 + sanctionLinesList.reduce((acc, l) => acc + l.length * 28 + 6, 0);

  const footerLines = wrapText(tempCtx, footerNote, innerW - 40, SMALL_FONT_SIZE + 1);
  const footerBlockH = footerLines.length * 24 + 40;

  const H = 220 + introBlockH + rulesTotalH + sanctionsBoxH + footerBlockH;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#090714", "#180e2e");
  drawOuterBorder(ctx, CARD_WIDTH, H, "rgba(168, 85, 247, 0.4)");
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.primary);

  // Title
  drawTitleText(ctx, "✨  Welcome to LeonX Hub Server  ✨", pad, 72, COLORS.primaryLight, TITLE_FONT_SIZE + 2);

  let curY = 96;

  // Intro box
  drawInnerCard(ctx, pad, curY, innerW, introBlockH);
  let ly = curY + 28;
  for (const line of introLines) {
    drawText(ctx, line, pad + 20, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
    ly += 28;
  }
  curY += introBlockH + 24;

  // Rules Section Title
  drawTitleText(ctx, "📜  SERVER RULES & GUIDELINES", pad, curY + 8, COLORS.primaryLight, SUBTITLE_FONT_SIZE + 2);
  curY += 34;
  drawText(ctx, "Dengan bergabung di server ini, Anda dianggap telah membaca dan menyetujui seluruh ketentuan di bawah ini:", pad, curY, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
  curY += 36;

  // Rules Boxes
  for (let i = 0; i < rulesData.length; i++) {
    const r = rulesData[i]!;
    const boxH = ruleHeights[i]!;

    drawInnerCard(ctx, pad, curY, innerW, boxH);

    drawText(ctx, `${r.icon}  ${r.title}`, pad + 20, curY + 28, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE + 2, fontWeight: "Bold" });

    const lines = wrapText(ctx, r.desc, innerW - 40, BODY_FONT_SIZE);
    let rly = curY + 54;
    for (const line of lines) {
      drawText(ctx, line, pad + 20, rly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE });
      rly += 28;
    }
    curY += boxH + 16;
  }

  curY += 12;

  // Sanctions Section Title
  drawTitleText(ctx, "⚖️  SISTEM SANKSI & KONSEKUENSI", pad, curY + 8, COLORS.warningLight, SUBTITLE_FONT_SIZE + 2);
  curY += 36;

  drawInnerCard(ctx, pad, curY, innerW, sanctionsBoxH, "rgba(250, 204, 21, 0.3)");
  drawText(ctx, "Moderator berhak mengambil keputusan mutlak berdasarkan pelanggaran yang Anda lakukan:", pad + 20, curY + 28, { color: COLORS.warningLight, fontSize: BODY_FONT_SIZE, fontWeight: "Bold" });

  let sly = curY + 56;
  for (const sLines of sanctionLinesList) {
    for (const line of sLines) {
      drawText(ctx, line, pad + 20, sly, { color: COLORS.textPrimary, fontSize: BODY_FONT_SIZE });
      sly += 28;
    }
    sly += 4;
  }
  curY += sanctionsBoxH + 20;

  // Footer Note box
  drawInnerCard(ctx, pad, curY, innerW, footerBlockH, "rgba(56, 189, 248, 0.3)");
  let fly = curY + 26;
  for (const line of footerLines) {
    drawText(ctx, line, pad + 20, fly, { color: COLORS.secondaryLight, fontSize: SMALL_FONT_SIZE + 1, fontWeight: "Bold" });
    fly += 24;
  }

  drawFooter(ctx, "LeonX Hub  •  Official Guidelines", H - 18, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderAiResponseCard(data: {
  categoryLabel: string;
  response: string;
}): Promise<Buffer> {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  const respLines = wrapText(tempCtx, data.response.replace(/\*\*/g, "").replace(/`/g, ""), CARD_WIDTH - CARD_PADDING * 2 - 40, BODY_FONT_SIZE);
  const H = 150 + respLines.length * 26;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071224", "#0e1e38");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.secondary);

  drawTitleText(ctx, "🤖  AI Support Assistant (Solusi Awal)", CARD_PADDING, 68, COLORS.secondaryLight, TITLE_FONT_SIZE);

  const innerW = CARD_WIDTH - CARD_PADDING * 2;
  const contentH = respLines.length * 26 + 24;
  drawInnerCard(ctx, CARD_PADDING, 94, innerW, contentH);
  let ly = 120;
  for (const line of respLines) {
    drawText(ctx, line, CARD_PADDING + 20, ly, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, maxWidth: innerW - 40 });
    ly += 26;
  }

  drawFooter(ctx, "Tim support manusia akan segera membantu jika masalah belum teratasi.", H - 16, CARD_WIDTH);

  return finalizeCard(canvas);
}

export async function renderClaimCard(claimedBy: string): Promise<Buffer> {
  const H = 120;
  const { canvas, ctx } = createBaseCanvas(H);

  fillGradientBackground(ctx, CARD_WIDTH, H, "#071a0e", "#0f2e1a");
  drawOuterBorder(ctx, CARD_WIDTH, H);
  drawAccentBar(ctx, 20, CARD_WIDTH, COLORS.success);

  drawTitleText(ctx, "✋  Ticket Diklaim", CARD_PADDING, 62, COLORS.successLight, TITLE_FONT_SIZE);
  drawText(ctx, `${claimedBy} telah claim ticket ini dan akan membantu menyelesaikan masalahmu.`, CARD_PADDING, 90, { color: COLORS.textSecondary, fontSize: BODY_FONT_SIZE, maxWidth: CARD_WIDTH - CARD_PADDING * 2 });

  return finalizeCard(canvas);
}
