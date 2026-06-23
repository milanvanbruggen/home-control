import { z } from "zod";
import { getStates, callService } from "@/lib/ha-client";
import { mapHaStatesToAppState, findClimateRuntime } from "@/lib/state-mapper";
import { findClimateDevice } from "@/config/devices";
import { validateClimateValue, climateActionToService } from "@/lib/climate";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string(),
  action: z.enum(["on_off", "set_mode", "set_fan", "set_temp"]),
  value: z.union([z.boolean(), z.string(), z.number()]),
});

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const { id, action, value } = parsed.data;
  const device = findClimateDevice(id);
  if (!device) return Response.json({ error: "not_allowed" }, { status: 400 });
  if (!device.actions.includes(action)) return Response.json({ error: "action_not_allowed" }, { status: 400 });

  let runtime;
  try {
    runtime = findClimateRuntime(mapHaStatesToAppState(await getStates()), id);
  } catch {
    return Response.json({ error: "ha_unavailable" }, { status: 502 });
  }
  if (!runtime || !runtime.available) return Response.json({ error: "unavailable" }, { status: 502 });

  const validation = validateClimateValue(action, value, runtime);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const call = climateActionToService(id, action, validation.value, runtime);
  try {
    await callService(call.domain, call.service, call.data);
  } catch {
    return Response.json({ error: "ha_call_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
