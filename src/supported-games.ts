import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

export type GameStatus = "WORK" | "NEED_UPDATE" | "DOWN" | "DISCONTINUED";

export interface SupportedGame {
  id?: string;
  name: string;
  status: GameStatus;
  category?: string;
  note?: string;
}

export const STATUS: Record<GameStatus, { emoji: string; label: string }> = {
  WORK: { emoji: "🟢", label: "WORK" },
  NEED_UPDATE: { emoji: "🟠", label: "NEED UPDATE" },
  DOWN: { emoji: "🔴", label: "DOWN" },
  DISCONTINUED: { emoji: "🔴", label: "DISCONTINUED" },
};

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

function gameLine(game: SupportedGame): string {
  const s = STATUS[game.status] || { emoji: "⚪", label: game.status };
  const note = game.note ? `\n> ↳ -# *${game.note}*` : "";
  return `${s.emoji} **${game.name}** — \`${s.label}\`${note}`;
}

function buildGameSection(title: string, list: SupportedGame[]): TextDisplayBuilder | null {
  if (!list.length) return null;
  const lines = list.map(gameLine).join("\n");
  return new TextDisplayBuilder().setContent(`### ${title}\n${lines}`);
}

/**
 * Membangun Discord Components V2 Container untuk Script Support Game LeonX Hub.
 * Tanpa garis warna di sisi kiri (tanpa accent color).
 */
export function buildSupportedGamesV2(
  games: SupportedGame[] = DEFAULT_SUPPORTED_GAMES,
  iconUrl?: string
) {
  const container = new ContainerBuilder();
  // Catatan: Tidak menggunakan .setAccentColor(...) agar tidak ada garis warna di sisi kiri

  const supported = games.filter((g) => g.status === "WORK");
  const needUpdate = games.filter((g) => g.status === "NEED_UPDATE");
  const discontinued = games.filter((g) => g.status === "DISCONTINUED" || g.status === "DOWN");

  // Header section with thumbnail accessory (the logo)
  const headerContent = new TextDisplayBuilder().setContent(
    "## 🎮 Script Support Game\nDaftar status dukungan script game Roblox pada **LeonX Hub**."
  );

  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(headerContent)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl))
    );
  } else {
    container.addTextDisplayComponents(headerContent);
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  // Supported Games
  const supportedSection = buildGameSection("Supported Games", supported);
  if (supportedSection) {
    container.addTextDisplayComponents(supportedSection);
  }

  // Need Update (only shows if non-empty)
  const needUpdateSection = buildGameSection("Need Update", needUpdate);
  if (needUpdateSection) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(needUpdateSection);
  }

  // Discontinued
  const discontinuedSection = buildGameSection("Discontinued", discontinued);
  if (discontinuedSection) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(discontinuedSection);
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  // Status Legend
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "### 📊 Status Legend\n" +
      "🟢 `WORK` — Script berjalan normal & stabil\n" +
      "🟠 `NEED UPDATE` — Sedang maintenance / beta test\n" +
      "🔴 `DISCONTINUED` — Dukungan script telah dihentikan"
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  // Footer-style line + refresh button, side by side via a Section
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("-# LeonX Hub • Script Support System")
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId("refresh_script_status")
          .setLabel("Refresh")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Secondary)
      )
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
  };
}
