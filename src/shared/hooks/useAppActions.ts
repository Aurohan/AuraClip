import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseAppActionsOptions {
  t: (key: string) => string;
  mqttEnabled: boolean;
  openConfirm: (opts: { title: string; message: string; danger?: boolean; onConfirm: () => void }) => void;
  closeConfirm: () => void;
  pushToast: (msg: string, duration?: number) => number;
  fetchHistory: (reset?: boolean) => Promise<void>;
}

const MQTT_RESTART_DEBOUNCE_MS = 1200;

export const useAppActions = ({
  t,
  mqttEnabled,
  openConfirm,
  closeConfirm,
  pushToast,
  fetchHistory
}: UseAppActionsOptions) => {
  // Typing in a connection field saves on every keystroke. Restart once the
  // user pauses instead of reconnecting per character (brokers may ban an IP
  // after a burst of failed logins); this also lets a protocol change and the
  // port change it brings land together.
  const mqttRestartTimer = useRef<number | null>(null);
  const saveMqtt = useCallback(
    async (key: string, value: string) => {
      try {
        await invoke("save_setting", { key, value });
        const mqttKeys = [
          "mqtt_enabled",
          "mqtt_server",
          "mqtt_port",
          "mqtt_username",
          "mqtt_password",
          "mqtt_topic",
          "mqtt_protocol",
          "mqtt_ws_path",
          "mqtt_client_id"
        ];
        const shouldRestart = (key === "mqtt_enabled" && value === "true") || (mqttKeys.includes(key) && mqttEnabled);
        if (!shouldRestart) return;
        if (mqttRestartTimer.current !== null) window.clearTimeout(mqttRestartTimer.current);
        const delay = key === "mqtt_enabled" ? 0 : MQTT_RESTART_DEBOUNCE_MS;
        mqttRestartTimer.current = window.setTimeout(() => {
          mqttRestartTimer.current = null;
          invoke("restart_mqtt_client").catch((err) => console.error("MQTT restart failed", err));
        }, delay);
      } catch (err) {
        console.error("MQTT Set save failed", err);
      }
    },
    [mqttEnabled]
  );

  const clearHistory = useCallback(() => {
    openConfirm({
      title: t("clear_confirm_title"),
      message: t("clear_confirm_message"),
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("clear_clipboard_history");
          fetchHistory(true);
        } catch (err) {
          console.error("清空失败", err);
          pushToast(t("clear_history_failed") + String(err), 4000);
        }
        closeConfirm();
      }
    });
  }, [closeConfirm, fetchHistory, openConfirm, pushToast, t]);

  const handleResetSettings = useCallback(() => {
    openConfirm({
      title: t("reset_defaults"),
      message: t("reset_confirm"),
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("reset_settings");
          window.location.reload();
        } catch (err) {
          const errorMsg = t("reset_failed") + (err?.toString() || "");
          pushToast(errorMsg, 3000);
        }
        closeConfirm();
      }
    });
  }, [closeConfirm, openConfirm, pushToast, t]);

  return { saveMqtt, clearHistory, handleResetSettings };
};
