import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN belum diisi"),
  CLIENT_ID: z.string().regex(/^\d+$/),
  GUILD_ID: z.string().regex(/^\d+$/),
  OWNER_ID: z.string().regex(/^\d+$/, "OWNER_ID harus berupa Discord user ID"),
  VERIFY_CHANNEL_ID: z.string().regex(/^\d+$/, "VERIFY_CHANNEL_ID harus berupa channel ID"),
  VERIFIED_ROLE_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  PREMIUM_ROLE_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  TICKET_CATEGORY_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  SUPPORT_ROLE_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  BUG_REPORT_CHANNEL_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  CHANGELOG_CHANNEL_ID: z.string().regex(/^\d+$/, "CHANGELOG_CHANNEL_ID harus berupa channel ID"),
  LOG_CHANNEL_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  STATUS_VOICE_CHANNEL_ID: z.string().regex(/^\d+$/).optional().or(z.literal("")),
  TICKET_CHANNEL_ID: z.string().regex(/^\d+$/).optional().or(z.literal(""))
});

export const config = schema.parse(process.env);
