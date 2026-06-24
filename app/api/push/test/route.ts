import { sendPushToAll } from "@/lib/push-store";
import { getSettings } from "@/lib/settings-store";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Send a test notification to every subscription — lets the user confirm setup.
export async function POST(): Promise<Response> {
  const { language } = getSettings();
  const sent = await sendPushToAll({
    title: t(language, "settings.waterPushTitle"),
    body: t(language, "settings.testPushBody"),
    tag: "push-test",
    url: "/settings",
  });
  return Response.json({ sent });
}
