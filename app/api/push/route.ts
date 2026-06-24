import { getVapidPublicKey } from "@/lib/push-store";

export const dynamic = "force-dynamic";

// The client needs the VAPID public key to create a push subscription.
export async function GET(): Promise<Response> {
  return Response.json({ publicKey: getVapidPublicKey() });
}
