import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { withNativeDialog } from "../../../../shared/lib/focus";
import { getHotkeyDisplayTokens } from "../../../../shared/lib/hotkeyDisplay";
import type { HotkeyActionId, HotkeySettings } from "../../../../shared/lib/hotkeyActions";
import { hotkeyAction } from "../../../../shared/lib/hotkeyActions";
import type { QuickPasteModifier } from "../../../app/types";
import { HotkeyField, HotkeyKeys, HotkeyRecordingHint } from "../HotkeyField";
import { SettingSwitch } from "../SettingControls";

interface LabelWithHintProps {
    label: string;
    hint?: string | ReactNode;
    hintKey: string;
}

interface ShortcutsSettingsGroupProps {
    t: (key: string) => string;
    collapsed: boolean;
    onToggle: () => void;
    LabelWithHint: ComponentType<LabelWithHintProps>;
    hotkeySettings: HotkeySettings;
    quickPasteModifier: QuickPasteModifier;
    setQuickPasteModifier: (val: QuickPasteModifier) => void;
    registryWinVEnabled: boolean;
    setRegistryWinVEnabled: (val: boolean) => void;
    sequentialMode: boolean;
    setSequentialModeState: (val: boolean) => void;
    arrowKeySelection: boolean;
    setArrowKeySelection: (val: boolean) => void;
    saveAppSetting: (key: string, val: string) => void;
    appSettings: Record<string, string>;
    theme: string;
    colorMode: string;
}

const ShortcutsSettingsGroup = (props: ShortcutsSettingsGroupProps) => {
    const isWinVManaged = props.registryWinVEnabled;
    const {
        hotkeys,
        recordingHotkey,
        recordingPreview,
        setRecordingHotkey,
        updateHotkey,
        checkHotkeyConflict
    } = props.hotkeySettings;

    const [mainHotkeyHintOpen, setMainHotkeyHintOpen] = useState(false);

    useEffect(() => () => setRecordingHotkey(null), [setRecordingHotkey]);

    const sequentialHotkeyLabel =
        getHotkeyDisplayTokens(hotkeys.sequential)
            .map((token) => token.label)
            .join(" + ") || props.t("not_set");

    const quickPasteOptions: Array<{ value: QuickPasteModifier; label: string }> = [
        { value: "disabled", label: props.t("quick_paste_modifier_disabled") },
        { value: "ctrl", label: props.t("quick_paste_modifier_ctrl") },
        { value: "alt", label: props.t("quick_paste_modifier_alt") },
        { value: "shift", label: props.t("quick_paste_modifier_shift") },
        { value: "win", label: props.t("quick_paste_modifier_win") }
    ];
    const visibleQuickPasteOptions = quickPasteOptions.filter(
        (option) => option.value !== "shift" || props.quickPasteModifier === "shift"
    );

    const keysFor = (action: HotkeyActionId) => {
        const desc = hotkeyAction(action);
        return {
            t: props.t,
            label: props.t(desc.labelKey),
            value: hotkeys[action],
            defaultValue: desc.defaultValue,
            scope: desc.scope,
            recording: recordingHotkey === action,
            recordingPreview: recordingHotkey === action ? recordingPreview : "",
            onRecordingChange: (recording: boolean) =>
                setRecordingHotkey(recording ? action : recordingHotkey === action ? null : recordingHotkey),
            onChange: (hotkey: string) => updateHotkey(action, hotkey)
        };
    };

    const builtinRows: Array<{ keys: string[]; label: string }> = [
        { keys: ["↑", "↓"], label: props.t("shortcut_builtin_nav") },
        { keys: ["Enter"], label: props.t("shortcut_builtin_paste") },
        { keys: [props.t("footer_hint_right_click")], label: props.t("shortcut_builtin_plain") },
        { keys: ["Shift", "Enter"], label: props.t("shortcut_builtin_copy") },
        { keys: ["Tab"], label: props.t("shortcut_builtin_tab") },
        { keys: ["Delete"], label: props.t("shortcut_builtin_delete") },
        { keys: ["Esc"], label: props.t("shortcut_builtin_esc") }
    ];

    return (
        <div className={`settings-group ${props.collapsed ? "collapsed" : ""}`}>
            <button type="button" className="group-header" aria-expanded={!props.collapsed} onClick={props.onToggle}>
                <h3>{props.t("shortcuts_settings")}</h3>
                {props.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
            {!props.collapsed && (
                <div className="group-content">
                    <h4 className="settings-section-title">{props.t("shortcuts_section_global")}</h4>

                    <div className="setting-item">
                        <div className="item-label-group">
                            <div className="item-label-row">
                                <span className="item-label">{props.t("global_hotkey")}</span>
                                <span className="hotkey-scope-badge is-global">
                                    {props.t("hotkey_scope_global")}
                                </span>
                                {!isWinVManaged && (
                                    <button
                                        type="button"
                                        className="hint-icon-btn"
                                        title={`${props.t("main_hotkey_hint")} ${props.t("hotkey_click_hint")}`}
                                        aria-label={props.t("main_hotkey_hint")}
                                        aria-expanded={mainHotkeyHintOpen}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setMainHotkeyHintOpen((open) => !open);
                                        }}
                                    >
                                        <HelpCircle size={13} />
                                    </button>
                                )}
                            </div>
                            {isWinVManaged ? (
                                <span className="hint hotkey-hint">{props.t("main_hotkey_managed_by_win_v")}</span>
                            ) : recordingHotkey === "clipboard" ? (
                                <span className="hint hotkey-hint"><HotkeyRecordingHint t={props.t} /></span>
                            ) : (
                                <span className="hint hotkey-hint">{props.t("hotkey_click_hint")}</span>
                            )}
                        </div>
                        {!isWinVManaged && recordingHotkey !== "clipboard" && mainHotkeyHintOpen && (
                            <div className="setting-hint-panel">
                                <span className="hint">{props.t("main_hotkey_hint")} {props.t("hotkey_click_hint")}</span>
                            </div>
                        )}
                        <HotkeyKeys {...keysFor("clipboard")} disabled={isWinVManaged} />
                    </div>

                    <HotkeyField {...keysFor("phrases")} hint={props.t("phrases_hotkey_hint")} />

                    <div className="setting-item">
                        <props.LabelWithHint
                            label={props.t("use_win_v_shortcut")}
                            hint={props.t("use_win_v_shortcut_hint")}
                            hintKey="use_win_v_shortcut"
                        />
                        <SettingSwitch
                            checked={props.registryWinVEnabled}
                            onChange={async (e) => {
                                const enabled = e.target.checked;
                                const previousEnabled = props.registryWinVEnabled;
                                const previousHotkey = hotkeys.clipboard;
                                props.setRegistryWinVEnabled(enabled);
                                if (enabled) {
                                    setRecordingHotkey(null);
                                }
                                try {
                                    const changed = await invoke<boolean>("trigger_registry_win_v_optimization", { enable: enabled });
                                    await invoke("save_setting", { key: "app.use_win_v_shortcut", value: String(enabled) });
                                    let targetHotkey = "Alt+C";
                                    if (enabled) {
                                        if (hotkeys.clipboard && hotkeys.clipboard !== "Win+V") {
                                            props.saveAppSetting("pre_win_v_hotkey", hotkeys.clipboard);
                                        }
                                        targetHotkey = "Win+V";
                                    } else {
                                        const savedPreHotkey = props.appSettings["app.pre_win_v_hotkey"];
                                        if (savedPreHotkey && savedPreHotkey !== "Win+V") {
                                            targetHotkey = savedPreHotkey;
                                        }
                                    }

                                    if (!enabled) {
                                        await updateHotkey("clipboard", targetHotkey);
                                    } else if (!changed) {
                                        updateHotkey("clipboard", targetHotkey);
                                    }

                                    if (changed) {
                                        const confirmed = await withNativeDialog(() => ask(
                                            props.t("restart_explorer_confirm"),
                                            { title: props.t("restart_explorer_title"), kind: "warning" }
                                        ), "settings:restart-explorer");
                                        if (confirmed) {
                                            await invoke("restart_explorer");
                                            if (enabled) {
                                                setTimeout(() => {
                                                    updateHotkey("clipboard", targetHotkey);
                                                }, 1500);
                                            }

                                            setTimeout(() => {
                                                invoke("set_theme", {
                                                    theme: props.theme,
                                                    colorMode: props.colorMode,
                                                    showAppBorder: props.appSettings["app.show_app_border"] !== "false"
                                                }).catch(console.error);
                                            }, 2500);
                                        } else {
                                            updateHotkey("clipboard", targetHotkey);
                                        }
                                    }
                                } catch (err) {
                                    console.error("Failed to configure Win+V shortcut:", err);
                                    props.setRegistryWinVEnabled(previousEnabled);
                                    await invoke("trigger_registry_win_v_optimization", {
                                        enable: previousEnabled
                                    }).catch(console.error);
                                    await invoke("save_setting", {
                                        key: "app.use_win_v_shortcut",
                                        value: String(previousEnabled)
                                    }).catch(console.error);
                                    if (previousHotkey) {
                                        await updateHotkey("clipboard", previousHotkey);
                                    }
                                }
                            }}
                        />
                    </div>

                    <HotkeyField {...keysFor("plain")} hint={props.t("plain_paste_hotkey_hint")} />

                    <div className="setting-item">
                        <props.LabelWithHint
                            label={props.t("quick_paste_modifier")}
                            hint={props.t("quick_paste_modifier_hint")}
                            hintKey="quick_paste_modifier"
                        />
                        <select
                            className="search-input settings-field settings-field--sm quick-paste-select"
                            value={props.quickPasteModifier}
                            onChange={(e) => {
                                const value = e.target.value as QuickPasteModifier;
                                props.setQuickPasteModifier(value);
                                invoke("set_quick_paste_modifier", { modifier: value }).catch(console.error);
                            }}
                        >
                            {visibleQuickPasteOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="setting-item">
                        <props.LabelWithHint
                            label={props.t("sequential_paste_mode")}
                            hint={props.t("sequential_paste_hint").replace("{hotkey}", sequentialHotkeyLabel)}
                            hintKey="sequential_paste_mode"
                        />
                        <SettingSwitch
                            checked={props.sequentialMode}
                            onChange={(e) => {
                                const val = e.target.checked;
                                props.setSequentialModeState(val);
                                invoke("set_sequential_mode", { enabled: val }).catch(console.error);
                                if (val) {
                                    if (checkHotkeyConflict(hotkeys.sequential, "sequential")) {
                                        updateHotkey("sequential", "");
                                    }
                                }
                            }}
                        />
                    </div>

                    <HotkeyField
                        {...keysFor("sequential")}
                        className="is-child"
                        hint={props.sequentialMode ? undefined : props.t("sequential_paste_hotkey_inactive_hint")}
                    />

                    <h4 className="settings-section-title">{props.t("shortcuts_section_window")}</h4>

                    <HotkeyField {...keysFor("search")} />

                    <div className="setting-item">
                        <props.LabelWithHint
                            label={props.t("arrow_key_selection")}
                            hint={props.t("arrow_key_selection_hint")}
                            hintKey="arrow_key_selection"
                        />
                        <SettingSwitch
                            checked={props.arrowKeySelection}
                            onChange={(e) => {
                                const enabled = e.target.checked;
                                props.setArrowKeySelection(enabled);
                                props.saveAppSetting("arrow_key_selection", String(enabled));
                            }}
                        />
                    </div>

                    <h4 className="settings-section-title">{props.t("shortcuts_section_builtin")}</h4>
                    <div className="shortcuts-cheatsheet-grid">
                        {builtinRows.map((row) => (
                            <div className="shortcuts-cheatsheet-row" key={row.label}>
                                <span className="shortcuts-cheatsheet-label">{row.label}</span>
                                <div className="shortcuts-cheatsheet-keys">
                                    {row.keys.map((key, idx) => (
                                        <span className="key-cap key-cap-readonly" key={`${key}-${idx}`}>
                                            {key}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShortcutsSettingsGroup;
