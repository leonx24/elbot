import { buildV2Container } from "./components-v2.js";

export type GameStatus = "WORK" | "NEED_UPDATE" | "DOWN" | "DISCONTINUED";

export interface SupportedGame {
  id: string;
  name: string;
  status: GameStatus;
  category?: string;
  note?: string;
}

/**
 * Daftar default supported game untuk LeonX Hub.
 */
export const DEFAULT_SUPPORTED_GAMES: SupportedGame[] = [
  {
    id: "universal",
    name: "Universal",
    status: "WORK",
    category: "Roblox",
  },
  {
    id: "violence-district",
    name: "Violence District",
    status: "WORK",
    category: "Roblox",
  },
  {
    id: "fish-and-monster",
    name: "Fish and Monster",
    status: "DISCONTINUED",
    category: "Roblox",
  },
  {
    id: "grow-a-garden-2",
    name: "Grow a Garden 2",
    status: "DISCONTINUED",
    category: "Roblox",
  },
];

/**
 * Membangun embed Discord Components V2 untuk Script Support Game LeonX Hub.
 */
export function buildSupportedGamesV2(games: SupportedGame[] = DEFAULT_SUPPORTED_GAMES, iconUrl?: string) {
  const activeGames = games.filter((g) => g.status === "WORK" || g.status === "NEED_UPDATE");
  const discontinuedGames = games.filter((g) => g.status === "DISCONTINUED" || g.status === "DOWN");

  const formatGame = (game: SupportedGame) => {
    let icon = "🟢";
    let badge = "WORK";

    if (game.status === "NEED_UPDATE") {
      icon = "🟠";
      badge = "NEED UPDATE";
    } else if (game.status === "DOWN") {
      icon = "🔴";
      badge = "DOWN";
    } else if (game.status === "DISCONTINUED") {
      icon = "🔴";
      badge = "DISCONTINUED";
    }

    const note = game.note ? `\n> ↳ -# *${game.note}*` : "";
    return `> ${icon} **${game.name}**  •  \`${badge}\`${note}`;
  };

  const sections: { title?: string; content: string }[] = [];

  // Section 1: Active / Supported Games
  if (activeGames.length > 0) {
    sections.push({
      title: "🎮 Supported Games",
      content: activeGames.map(formatGame).join("\n"),
    });
  }

  // Section 2: Discontinued Games
  if (discontinuedGames.length > 0) {
    sections.push({
      title: "🛑 Discontinued",
      content: discontinuedGames.map(formatGame).join("\n"),
    });
  }

  // Section 3: Status Legend
  sections.push({
    title: "📊 Status Legend",
    content:
      `🟢 \`WORK\` — Script berjalan normal & stabil\n` +
      `🟠 \`NEED UPDATE\` — Sedang maintenance / beta test\n` +
      `🔴 \`DISCONTINUED\` — Dukungan script telah dihentikan`,
  });

  return buildV2Container({
    title: "Script Support Game",
    description: "Daftar status dukungan script game Roblox pada **LeonX Hub**.",
    thumbnailUrl: iconUrl,
    sections,
    // accentColor tidak diisi agar garis warna di sisi kiri dihapus
    footer: "LeonX Hub • Script Support System",
  });
}
