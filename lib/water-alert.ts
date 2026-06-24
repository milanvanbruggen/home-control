import { WATER_ALERT } from "@/config/devices";
import { t } from "@/lib/i18n";
import type { Language } from "@/lib/types";

type NotifyPayload = { message: string; data: Record<string, unknown> };

/** The LaMetric notify payload for a room whose water reservoir needs emptying. */
export function waterAlertNotify(roomName: string, lang: Language): NotifyPayload {
  return {
    message: t(lang, "water.alert", { room: roomName }),
    data: {
      priority: "critical",
      icon_type: "alert",
      cycles: 0,
      sound: WATER_ALERT.sound,
      icon: WATER_ALERT.icon,
    },
  };
}

/** A gentler test payload fired from the settings "Send test" button. */
export function waterTestNotify(lang: Language): NotifyPayload {
  return {
    message: t(lang, "water.test"),
    data: {
      priority: "warning",
      icon_type: "info",
      cycles: 2,
      sound: WATER_ALERT.sound,
      icon: WATER_ALERT.icon,
    },
  };
}
