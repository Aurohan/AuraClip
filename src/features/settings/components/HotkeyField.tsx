import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { RotateCcw, X } from "lucide-react";
import { getHotkeyDisplayTokens } from "../../../shared/lib/hotkeyDisplay";
import { hotkeyKeyFromEvent } from "../../../shared/lib/hotkeyKey";
import { isTauriRuntime } from "../../../shared/lib/tauriRuntime";

interface HotkeyKeysProps {
    t: (key: string) => string;
    label: string;
    value: string;
    defaultValue?: string;
    recording: boolean;
    recordingPreview?: string;
    disabled?: boolean;
    onRecordingChange: (recording: boolean) => void;
    onChange: (hotkey: string) => void;
}

/** The clickable key caps: click to record, Esc cancels, Backspace/Delete clears. */
export const HotkeyKeys = ({
    t,
    label,
    value,
    defaultValue,
    recording,
    recordingPreview,
    disabled,
    onRecordingChange,
    onChange
}: HotkeyKeysProps) => {
    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!recording || disabled) return;
        event.preventDefault();
        event.stopPropagation();
        if (isTauriRuntime()) {
            // Native low-level hook handles desktop recording deterministically.
            return;
        }
        if (event.key === "Escape") {
            onRecordingChange(false);
            return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
            onChange("");
            onRecordingChange(false);
            return;
        }
        const modifiers: string[] = [];
        if (event.ctrlKey) modifiers.push("Ctrl");
        if (event.shiftKey) modifiers.push("Shift");
        if (event.altKey) modifiers.push("Alt");
        if (event.metaKey) modifiers.push("Win");
        const key = hotkeyKeyFromEvent(event);
        if (key) onChange([...modifiers, key].join("+"));
    };

    const tokens = getHotkeyDisplayTokens(value);
    const previewTokens = recording && recordingPreview ? getHotkeyDisplayTokens(recordingPreview) : [];
    const canClear = !recording && !disabled && value.trim().length > 0;
    const canReset = !recording && !disabled && defaultValue !== undefined && value !== defaultValue;

    return (
        <div className="hotkey-control-cluster">
            <div
                className={`key-group ${recording ? "recording" : ""} ${disabled ? "is-disabled" : ""}`}
                role="button"
                aria-label={label}
                aria-disabled={disabled}
                tabIndex={disabled ? -1 : 0}
                onClick={(event) => {
                    if (disabled) return;
                    onRecordingChange(!recording);
                    event.currentTarget.focus();
                }}
                onKeyDown={onKeyDown}
                onBlur={() => {
                    if (recording) onRecordingChange(false);
                }}
            >
                {recording ? (
                    previewTokens.length > 0 ? (
                        <>
                            {previewTokens.map((token, index) => (
                                <div className="key-cap key-cap-live" key={`${token.raw}-${index}`}>
                                    {token.label}
                                </div>
                            ))}
                            <div className="key-cap key-cap-recording-slot">+ …</div>
                        </>
                    ) : (
                        <div className="key-cap key-cap-recording">{t("waiting_for_input")}</div>
                    )
                ) : tokens.length === 0 ? (
                    <div className="key-cap key-cap-empty">{t("not_set")}</div>
                ) : (
                    tokens.map((token, index) => (
                        <div className="key-cap" key={`${token.raw}-${index}`}>{token.label}</div>
                    ))
                )}
            </div>
            {(canReset || canClear) && (
                <div className="hotkey-inline-actions">
                    {canReset && (
                        <button
                            type="button"
                            className="hotkey-micro-btn"
                            title={`${t("hotkey_reset_default")} (${defaultValue})`}
                            aria-label={t("hotkey_reset_default")}
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange(defaultValue!);
                            }}
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                    {canClear && (
                        <button
                            type="button"
                            className="hotkey-micro-btn"
                            title={t("hotkey_clear")}
                            aria-label={t("hotkey_clear")}
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange("");
                            }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export const HotkeyRecordingHint = ({ t }: { t: (key: string) => string }) => (
    <>
        <span className="hotkey-warning">{t("win_key_not_recommended")}</span>
        <span>{t("hotkey_recording_esc")}</span>
    </>
);

interface HotkeyFieldProps extends HotkeyKeysProps {
    hint?: ReactNode;
    scope?: "global" | "window";
    className?: string;
}

/** A settings row: label + scope badge, hint (or the recording hint), key caps + quick actions. */
export const HotkeyField = ({ hint, scope, className, ...keys }: HotkeyFieldProps) => (
    <div className={`setting-item ${className ?? ""}`}>
        <div className="item-label-group">
            <div className="item-label-row">
                <span className="item-label">{keys.label}</span>
                {scope && (
                    <span className={`hotkey-scope-badge is-${scope}`}>
                        {keys.t(scope === "global" ? "hotkey_scope_global" : "hotkey_scope_window")}
                    </span>
                )}
            </div>
            <span className="hint hotkey-hint">
                {keys.recording ? <HotkeyRecordingHint t={keys.t} /> : hint || keys.t("hotkey_click_hint")}
            </span>
        </div>
        <HotkeyKeys {...keys} />
    </div>
);
