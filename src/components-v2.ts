import { MessageFlags } from "discord.js";

export interface V2Section {
  title?: string;
  content: string;
  thumbnailUrl?: string; // opsional, kalau section itu sendiri butuh accessory thumbnail
}

export interface V2ContainerParams {
  title?: string;
  description?: string;
  accentColor?: number | null;
  thumbnailUrl?: string; // thumbnail global, nempel di title
  sections?: V2Section[];
  footer?: string;
  actionRows?: any[];
}

/**
 * Membuat payload Discord Components V2 Container.
 * accentColor: null (default) -> tidak ada garis warna aksen di kiri sama sekali.
 */
export function buildV2Container(params: V2ContainerParams) {
  const containerComponents: any[] = [];

  // Title (+ thumbnail opsional nempel di kanan judul via Section+Thumbnail)
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

  // Description
  if (params.description) {
    if (params.title) {
      containerComponents.push({ type: 14, divider: true, spacing: 1 }); // Separator
    }
    containerComponents.push({ type: 10, content: params.description });
  }

  // Sections
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
          type: 9,
          components: textParts,
          accessory: {
            type: 11,
            media: { url: sec.thumbnailUrl },
          },
        });
      } else {
        containerComponents.push(...textParts);
      }
    }
  }

  // Footer
  if (params.footer) {
    containerComponents.push({ type: 14, divider: true, spacing: 1 });
    containerComponents.push({
      type: 10,
      content: `-# ${params.footer}`, // -# = subtext style Discord markdown
    });
  }

  // Action rows (button/select menu dari discord.js builder)
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
    flags: MessageFlags.IsComponentsV2 as const,
  };
}