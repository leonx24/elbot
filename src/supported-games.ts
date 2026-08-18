import { buildV2Container } from "./components-v2.js";

export type GameStatus = "WORK" | "NEED_UPDATE" | "DOWN" | "DISCONTINUED";

export interface SupportedGame {
  id: string;
  name: string;
  status: GameStatus;
  category?: string;
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
  const gameLines = games.map((game) => {
    let icon = "🟢";

    if (game.status === "NEED_UPDATE") {
      icon = "🟠";
    } else if (game.status === "DOWN" || game.status === "DISCONTINUED") {
      icon = "🔴";
    }

    return `${game.name} : ${icon}`;
  });

  return buildV2Container({
    title: "Script Support Game",
    thumbnailUrl: iconUrl,
    sections: [
      {
        title: "List Game Roblox",
        content: gameLines.join("\n"),
      },
      {
        title: "Status",
        content:
          `🟢 WORK\n` +
          `🟠 NEED UPDATE/BETA TEST\n` +
          `🔴 DOWN / DISCONTINUED`,
      },
    ],
    accentColor: 0xff7700, // Orange accent matching LeonX Script Hub
    footer: "LeonX Hub • Script Support System",
  });
}
