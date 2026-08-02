import { MessageFlags } from "discord.js";

export interface V2Section {
  title?: string;
  content: string;
}

export interface V2ContainerParams {
  title?: string;
  description?: string;
  accentColor?: number | null;
  sections?: V2Section[];
  actionRows?: any[];
}

/**
 * Creates a Discord Components V2 Container payload object
 */
export function buildV2Container(params: V2ContainerParams) {
  const containerComponents: any[] = [];

  if (params.title) {
    containerComponents.push({
      type: 10, // TextDisplay
      content: params.title.startsWith("#") ? params.title : `# ${params.title}`
    });
  }

  if (params.description) {
    if (params.title) {
      containerComponents.push({
        type: 14, // Separator
        divider: true,
        spacing: 1
      });
    }
    containerComponents.push({
      type: 10, // TextDisplay
      content: params.description
    });
  }

  if (params.sections && params.sections.length > 0) {
    for (const sec of params.sections) {
      containerComponents.push({
        type: 14, // Separator
        divider: true,
        spacing: 1
      });
      if (sec.title) {
        containerComponents.push({
          type: 10, // TextDisplay
          content: sec.title.startsWith("#") ? sec.title : `## ${sec.title}`
        });
      }
      containerComponents.push({
        type: 10, // TextDisplay
        content: sec.content
      });
    }
  }

  // Include ActionRows inside container if present
  if (params.actionRows) {
    for (const row of params.actionRows) {
      const rowJSON = typeof row.toJSON === "function" ? row.toJSON() : row;
      containerComponents.push(rowJSON);
    }
  }

  const container: any = {
    type: 17, // ComponentType.Container
    accent_color: params.accentColor ?? null,
    components: containerComponents
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as any
  };
}
