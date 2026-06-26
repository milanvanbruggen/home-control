import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/settings-store";
import type { AppSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  language: z.enum(["en", "nl"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  favorites: z.record(z.string(), z.array(z.string())).optional(),
  waterAlert: z.boolean().optional(),
  hiddenMetrics: z.record(z.string(), z.array(z.string())).optional(),
  cardOrder: z.array(z.string()).optional(),
  hiddenCards: z.array(z.string()).optional(),
  tariff: z
    .object({
      mode: z.enum(["simple", "advanced"]).optional(),
      importPrice: z.number().nonnegative().nullable().optional(),
      exportPrice: z.number().nonnegative().nullable().optional(),
      importLow: z.number().nonnegative().nullable().optional(),
      importHigh: z.number().nonnegative().nullable().optional(),
      feedInPrice: z.number().nonnegative().nullable().optional(),
      fixedFeedInPerDay: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
});

export async function GET(): Promise<Response> {
  return Response.json(getSettings());
}

async function write(req: Request): Promise<Response> {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json(updateSettings(parsed.data as Partial<AppSettings>));
}

export const PUT = write;
export const POST = write;
