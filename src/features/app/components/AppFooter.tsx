import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../../../shared/lib/tauriRuntime";

interface AppFooterProps {
  t: (key: string) => string;
  mainTab: "clipboard" | "phrases";
  mqttEnabled: boolean;
  totalCount: number;
  filteredCount: number;
  isFiltered: boolean;
  onOpenSyncSettings: () => void;
  onOpenShortcutsSettings: () => void;
}

const AppFooter = ({
  t,
  mainTab,
  mqttEnabled,
  totalCount,
  filteredCount,
  isFiltered,
  onOpenSyncSettings,
  onOpenShortcutsSettings
}: AppFooterProps) => {
  const [mqttStatus, setMqttStatus] = useState<"connected" | "connecting" | "disconnected">("disconnected");
  const [lastMessageMs, setLastMessageMs] = useState<number>(0);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!mqttEnabled) {
      setMqttStatus("disconnected");
      return;
    }

    let disposed = false;
    Promise.all([
      invoke<boolean>("get_mqtt_status"),
      invoke<boolean>("get_mqtt_running"),
      invoke<{ last_message_ms: number }>("get_mqtt_telemetry").catch(() => ({ last_message_ms: 0 })),
    ])
      .then(([connected, running, tel]) => {
        if (disposed) return;
        if (connected) setMqttStatus("connected");
        else if (running) setMqttStatus("connecting");
        else setMqttStatus("disconnected");
        if (tel?.last_message_ms) setLastMessageMs(tel.last_message_ms);
      })
      .catch(() => {});

    const unlisten = listen<string>("mqtt-status", (event) => {
      if (disposed) return;
      const val = event.payload;
      if (val === "connected" || val === "connecting" || val === "disconnected") {
        setMqttStatus(val);
      }
    });
    const unlistenMsg = listen<number>("mqtt-message-received", (event) => {
      if (!disposed && typeof event.payload === "number") {
        setLastMessageMs(event.payload);
      }
    });

    return () => {
      disposed = true;
      unlisten.then((off) => off()).catch(() => {});
      unlistenMsg.then((off) => off()).catch(() => {});
    };
  }, [mqttEnabled]);

  const smsLabel = !mqttEnabled
    ? t("footer_sms_disabled")
    : mqttStatus === "connected"
      ? t("footer_sms_connected")
      : mqttStatus === "connecting"
        ? t("footer_sms_connecting")
        : t("footer_sms_offline");

  const smsStateClass = !mqttEnabled ? "is-disabled" : `is-${mqttStatus}`;

  const countText = isFiltered
    ? t("footer_filtered_count")
        .replace("{m}", String(filteredCount))
        .replace("{n}", String(totalCount))
    : t("footer_items_count").replace("{n}", String(totalCount));

  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer-left">
        <button
          type="button"
          className={`app-footer-pill app-footer-sync-btn ${smsStateClass}`}
          onClick={onOpenSyncSettings}
          title={
            lastMessageMs > 0
              ? `${t("sync_settings")} · ${t("mqtt_last_received_label")}: ${new Date(lastMessageMs).toLocaleTimeString()}`
              : t("sync_settings")
          }
        >
          <span className={`app-footer-dot ${smsStateClass}`} aria-hidden="true" />
          <span>{smsLabel}</span>
        </button>
        <span className="app-footer-sep" aria-hidden="true">·</span>
        <span className="app-footer-count">{countText}</span>
      </div>

      <button
        type="button"
        className="app-footer-shortcuts"
        onClick={onOpenShortcutsSettings}
        title={t("shortcuts_settings")}
      >
        <span className="app-footer-hint">
          <kbd className="app-footer-kbd">↵</kbd>
          <span>{t("footer_hint_paste")}</span>
        </span>
        {mainTab === "clipboard" ? (
          <>
            <span className="app-footer-hint">
              <kbd className="app-footer-kbd">{t("footer_hint_right_click")}</kbd>
              <span>{t("footer_hint_plain")}</span>
            </span>
            <span className="app-footer-hint app-footer-hint-wide">
              <kbd className="app-footer-kbd">^K</kbd>
              <span>{t("footer_hint_transform")}</span>
            </span>
          </>
        ) : (
          <>
            <span className="app-footer-hint">
              <kbd className="app-footer-kbd">⇧↵</kbd>
              <span>{t("footer_hint_copy")}</span>
            </span>
            <span className="app-footer-hint app-footer-hint-wide">
              <kbd className="app-footer-kbd">^N</kbd>
              <span>{t("phrase_new_short")}</span>
            </span>
          </>
        )}
        <span className="app-footer-hint">
          <kbd className="app-footer-kbd">Esc</kbd>
          <span>{t("hide")}</span>
        </span>
      </button>
    </footer>
  );
};

export default AppFooter;
