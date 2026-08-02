import { MessageFlags } from "discord.js";

export interface V2Section {
  title?: string;
  content: string;
  thumbnailUrl?: string; // kalau diisi, section jadi punya accessory thumbnail di kanan
}

export interface V2ContainerParams {
  title?: string;
  description?: string;
  accentColor?: number | null;
  thumbnailUrl?: string; // thumbnail global di pojok kanan atas (dempet ke title)
  sections?: V2Section[];
  footer?: string;
  actionRows?: any[];
}

/**
 * Creates a Discord Components V2 Container payload object.
 * accentColor: null -> gak ada garis warna kiri sama sekali.
 */
export function buildV2Container(params: V2ContainerParams) {
  const containerComponents: any[] = [];

  // Title + optional thumbnail (pakai Section+Thumbnail biar avatar nempel di kanan)
  if (params.title) {
    const titleContent = {
      type: 10, // TextDisplay
      content: params.title.startsWith("#") ? params.title : `# ${params.title}`,
    };

    if (params.thumbnailUrl) {
      containerComponents.push({
        type: 9, // Section
        components: [titleContent],
        accessory: {
          type: 11, // Thumbnail
          media: { url: params.thumbnailUrl },
        },
      });
    } else {
      containerComponents.push(titleContent);
    }
  }

  if (params.description) {
    if (params.title) {
      containerComponents.push({ type: 14, divider: true, spacing: 1 });
    }
    containerComponents.push({ type: 10, content: params.description });
  }

  if (params.sections && params.sections.length > 0) {
    for (const sec of params.sections) {
      containerComponents.push({ type: 14, divider: true, spacing: 1 });

      const textParts: any[] = [];
      if (sec.title) {
        textParts.push({
          type: 10,
          content: sec.title.startsWith("#") ? sec.title : `## ${sec.title}`,
        });
      }
      textParts.push({ type: 10, content: sec.content });

      if (sec.thumbnailUrl) {
        containerComponents.push({
          type: 9, // Section
          components: textParts,
          accessory: {
            type: 11, // Thumbnail
            media: { url: sec.thumbnailUrl },
          },
        });
      } else {
        containerComponents.push(...textParts);
      }
    }
  }

  if (params.footer) {
    containerComponents.push({ type: 14, divider: true, spacing: 1 });
    containerComponents.push({
      type: 10,
      content: `-# ${params.footer}`, // -# = small/subtext style di Discord markdown
    });
  }

  if (params.actionRows) {
    for (const row of params.actionRows) {
      const rowJSON = typeof row.toJSON === "function" ? row.toJSON() : row;
      containerComponents.push(rowJSON);
    }
  }

  const container: any = {
    type: 17, // Container
    accent_color: params.accentColor ?? null,
    components: containerComponents,
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}