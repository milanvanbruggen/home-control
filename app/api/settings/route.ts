import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  language: z.enum(["en", "nl"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  favorites: z.record(z.string(), z.array(z.string())).optional(),
  waterAlert: z.boolean().optional(),
});

export async function GET(): Promise<Response> {
  return Response.json(getSettings());
}

async function write(req: Request): Promise<Response> {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json(updateSettings(parsed.data));
}

export const PUT = write;
export const POST = write;
