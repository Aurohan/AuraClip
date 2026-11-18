import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Activity, ChevronDown, ChevronRight, Send } from "lucide-react";
import { SettingSwitch } from "../SettingControls";
import { isTauriRuntime } from "../../../../shared/lib/tauriRuntime";

interface MqttTelemetry {
    connected: boolean;
    running: boolean;
    last_inbound_ms: number;
    last_message_ms: number;
}

interface LabelWithHintProps {
    label: string;
    hint?: string | ReactNode;
    hintKey: string;
}

interface SyncSettingsGroupProps {
    t: (key: string) => string;
    collapsed: boolean;
    onToggle: () => void;
    LabelWithHint: ComponentType<LabelWithHintProps>;
    mqttEnabled: boolean;
    mqttStatus: "connected" | "disconnected" | "connecting";
    setMqttEnabled: (val: boolean) => void;
    saveMqtt: (key: string, val: string) => void;
    mqttProtocol: string;
    setMqttProtocol: (val: string) => void;
    mqttWsPath: string;
    setMqttWsPath: (val: string) => void;
    mqttServer: string;
    setMqttServer: (val: string) => void;
    mqttPort: string;
    setMqttPort: (val: string) => void;
    mqttUser: string;
    setMqttUser: (val: string) => void;
    mqttPass: string;
    setMqttPass: (val: string) => void;
    mqttTopic: string;
    setMqttTopic: (val: string) => void;
    mqttNotificationEnabled: boolean;
    setMqttNotificationEnabled: (val: boolean) => void;
}

const SyncSettingsGroup = ({
    t,
    collapsed,
    onToggle,
    LabelWithHint,
    mqttEnabled,
    mqttStatus,
    setMqttEnabled,
    saveMqtt,
    mqttProtocol,
    setMqttProtocol,
    mqttWsPath,
    setMqttWsPath,
    mqttServer,
    setMqttServer,
    mqttPort,
    setMqttPort,
    mqttUser,
    setMqttUser,
    mqttPass,
    setMqttPass,
    mqttTopic,
    setMqttTopic,
    mqttNotificationEnabled,
    setMqttNotificationEnabled
}: SyncSettingsGroupProps) => {
    const [smsTtlMinutes, setSmsTtlMinutes] = useState("0");
    const [smsDeleteAfterPaste, setSmsDeleteAfterPaste] = useState(false);
    const [lastMessageMs, setLastMessageMs] = useState(0);
    const [selfTestState, setSelfTestState] = useState<"idle" | "sending" | "ok" | "fail">("idle");

    useEffect(() => {
        if (!isTauriRuntime()) return;
        let disposed = false;
        invoke<Record<string, string>>("get_settings")
            .then((s) => {
                if (disposed || !s) return;
                if (s["app.mqtt_sms_ttl_minutes"]) {
                    setSmsTtlMinutes(s["app.mqtt_sms_ttl_minutes"]);
                }
                setSmsDeleteAfterPaste(s["app.mqtt_sms_delete_after_paste"] === "true");
            })
            .catch(() => {});

        invoke<MqttTelemetry>("get_mqtt_telemetry")
            .then((tel) => {
                if (!disposed && tel?.last_message_ms) {
                    setLastMessageMs(tel.last_message_ms);
                }
            })
            .catch(() => {});

        const unlisten = listen<number>("mqtt-message-received", (ev) => {
            if (!disposed && typeof ev.payload === "number") {
                setLastMessageMs(ev.payload);
            }
        });

        return () => {
            disposed = true;
            unlisten.then((off) => off()).catch(() => {});
        };
    }, [mqttEnabled, mqttStatus]);

    const handleSelfTest = async () => {
        if (selfTestState === "sending") return;
        setSelfTestState("sending");
        try {
            await invoke("send_mqtt_self_test");
            setSelfTestState("ok");
            setTimeout(() => setSelfTestState("idle"), 2600);
        } catch (err) {
            console.error("send_mqtt_self_test error:", err);
            setSelfTestState("fail");
            setTimeout(() => setSelfTestState("idle"), 2600);
        }
    };

    const lastReceivedText = lastMessageMs > 0
        ? new Date(lastMessageMs).toLocaleString()
        : t("mqtt_last_received_never");

    return (
    <div className={`settings-group ${collapsed ? 'collapsed' : ''}`}>
        <button type="button" className="group-header" aria-expanded={!collapsed} onClick={onToggle}>
            <div className="group-header-title">
                <h3>{t('sync_settings')}</h3>
                {mqttEnabled && (
                    <span
                        className={`settings-status-dot is-${mqttStatus}`}
                        title={mqttStatus === 'connected' ? "Connected" : mqttStatus === 'connecting' ? "Connecting..." : "Disconnected"}
                    />
                )}
            </div>
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        {!collapsed && (
            <div className="group-content">
                <div className="setting-item">
                    <div className="item-label-group">
                        <span className="item-label">{t('enable_sync')}</span>
                    </div>
                    <SettingSwitch
                        checked={mqttEnabled}
                        onChange={(e) => {
                            const val = e.target.checked;
                            setMqttEnabled(val);
                            saveMqtt('mqtt_enabled', String(val));
                        }}
                    />
                </div>
                {mqttEnabled && (
                    <>
                        <div className="setting-item is-child">
                            <LabelWithHint
                                label={t('mqtt_notification_enabled')}
                                hint={t('mqtt_notification_enabled_hint')}
                                hintKey="mqtt_notification_enabled"
                            />
                            <SettingSwitch
                                checked={mqttNotificationEnabled}
                                onChange={(e) => {
                                    const val = e.target.checked;
                                    setMqttNotificationEnabled(val);
                                    saveMqtt('mqtt_notification_enabled', String(val));
                                }}
                            />
                        </div>

                        <h4 className="settings-section-title">{t('settings_section_connection')}</h4>
                        <div className="setting-item">
                            <LabelWithHint
                                label={t('mqtt_protocol')}
                                hint={t('mqtt_protocol_hint')}
                                hintKey="mqtt_protocol"
                            />
                            <select
                                className="search-input settings-field"
                                value={mqttProtocol}
                                onChange={e => {
                                    const protocol = e.target.value;
                                    setMqttProtocol(protocol);
                                    saveMqtt('mqtt_protocol', protocol);
                                    invoke('save_setting', {
                                        key: 'mqtt_ssl',
                                        value: String(protocol === 'mqtts://' || protocol === 'wss://')
                                    }).catch(console.error);
                                    // Auto-update port based on protocol
                                    let defaultPort = '1883';
                                    if (protocol === 'mqtts://') defaultPort = '8883';
                                    else if (protocol === 'ws://') defaultPort = '8083';
                                    else if (protocol === 'wss://') defaultPort = '8084';
                                    setMqttPort(defaultPort);
                                    saveMqtt('mqtt_port', defaultPort);
                                }}
                            >
                                <option value="mqtt://">mqtt://</option>
                                <option value="mqtts://">mqtts://</option>
                                <option value="ws://">ws://</option>
                                <option value="wss://">wss://</option>
                            </select>
                        </div>
                        {(mqttProtocol === 'ws://' || mqttProtocol === 'wss://') && (
                            <div className="setting-item">
                                <div className="item-label-group"><span className="item-label">{t('mqtt_ws_path')}</span></div>
                                <input
                                    className="search-input settings-field"
                                    value={mqttWsPath}
                                    onChange={e => { setMqttWsPath(e.target.value); saveMqtt('mqtt_ws_path', e.target.value); }}
                                    placeholder="/mqtt"
                                />
                            </div>
                        )}
                        <div className="setting-item">
                            <div className="item-label-group">
                                <span className="item-label">{t('mqtt_host')}</span>
                                {/* Messages are not end-to-end encrypted; the broker's access rules are the only protection. */}
                                <span className="item-desc">{t('mqtt_host_privacy_hint')}</span>
                            </div>
                            <input
                                className="search-input settings-field"
                                value={mqttServer}
                                onChange={e => { setMqttServer(e.target.value); saveMqtt('mqtt_server', e.target.value); }}
                                placeholder="mqtt.example.com"
                            />
                        </div>
                        <div className="setting-item">
                            <div className="item-label-group"><span className="item-label">{t('mqtt_port')}</span></div>
                            <input
                                className="search-input settings-field"
                                value={mqttPort}
                                onChange={e => { setMqttPort(e.target.value); saveMqtt('mqtt_port', e.target.value); }}
                                placeholder="1883"
                            />
                        </div>
                        <div className="setting-item">
                            <div className="item-label-group"><span className="item-label">{t('mqtt_user')}</span></div>
                            <input
                                className="search-input settings-field"
                                value={mqttUser}
                                onChange={e => { setMqttUser(e.target.value); saveMqtt('mqtt_username', e.target.value); }}
                                placeholder="Optional"
                            />
                        </div>
                        <div className="setting-item">
                            <div className="item-label-group"><span className="item-label">{t('mqtt_password')}</span></div>
                            <input
                                className="search-input settings-field"
                                type="password"
                                value={mqttPass}
                                onChange={e => { setMqttPass(e.target.value); saveMqtt('mqtt_password', e.target.value); }}
                                placeholder="Optional"
                            />
                        </div>
                        <div className="setting-item">
                            <div className="item-label-group"><span className="item-label">{t('mqtt_topic')}</span></div>
                            <input
                                className="search-input settings-field"
                                value={mqttTopic}
                                onChange={e => { setMqttTopic(e.target.value); saveMqtt('mqtt_topic', e.target.value); }}
                                placeholder="tiez/my_device"
                            />
                        </div>

                        <h4 className="settings-section-title">{t('mqtt_sms_lifecycle_section')}</h4>
                        <div className="setting-item">
                            <LabelWithHint
                                label={t('mqtt_sms_ttl_label')}
                                hint={t('mqtt_sms_ttl_hint')}
                                hintKey="mqtt_sms_ttl"
                            />
                            <select
                                className="search-input settings-field"
                                value={smsTtlMinutes}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setSmsTtlMinutes(next);
                                    invoke('save_setting', {
                                        key: 'app.mqtt_sms_ttl_minutes',
                                        value: next
                                    }).catch(console.error);
                                }}
                            >
                                <option value="0">{t('mqtt_sms_ttl_off')}</option>
                                <option value="15">{t('mqtt_sms_ttl_15m')}</option>
                                <option value="30">{t('mqtt_sms_ttl_30m')}</option>
                                <option value="120">{t('mqtt_sms_ttl_2h')}</option>
                                <option value="1440">{t('mqtt_sms_ttl_24h')}</option>
                            </select>
                        </div>

                        <div className="setting-item">
                            <LabelWithHint
                                label={t('mqtt_sms_delete_after_paste')}
                                hint={t('mqtt_sms_delete_after_paste_hint')}
                                hintKey="mqtt_sms_delete_after_paste"
                            />
                            <SettingSwitch
                                checked={smsDeleteAfterPaste}
                                onChange={(e) => {
                                    const next = e.target.checked;
                                    setSmsDeleteAfterPaste(next);
                                    invoke('save_setting', {
                                        key: 'app.mqtt_sms_delete_after_paste',
                                        value: String(next)
                                    }).catch(console.error);
                                }}
                            />
                        </div>

                        <div className="setting-item">
                            <div className="item-label-group">
                                <span className="item-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <Activity size={13} />
                                    {t('mqtt_last_received_label')}
                                </span>
                                <span className="item-desc">{lastReceivedText}</span>
                            </div>
                            <button
                                type="button"
                                className="btn-secondary settings-self-test-btn"
                                disabled={mqttStatus !== 'connected' || selfTestState === 'sending'}
                                onClick={() => void handleSelfTest()}
                            >
                                <Send size={12} />
                                <span>
                                    {selfTestState === 'sending'
                                        ? t('mqtt_self_test_sending')
                                        : selfTestState === 'ok'
                                            ? t('mqtt_self_test_ok')
                                            : selfTestState === 'fail'
                                                ? t('mqtt_self_test_fail')
                                                : t('mqtt_self_test_btn')}
                                </span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        )}
    </div>
    );
};

export default SyncSettingsGroup;
