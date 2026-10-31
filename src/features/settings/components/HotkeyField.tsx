import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { getHotkeyDisplayTokens } from "../../../shared/lib/hotkeyDisplay";
import { hotkeyKeyFromEvent } from "../../../shared/lib/hotkeyKey";

interface HotkeyKeysProps {
    t: (key: string) => string;
    label: string;
    value: string;
    recording: boolean;
    disabled?: boolean;
    onRecordingChange: (recording: boolean) => void;
    onChange: (hotkey: string) => void;
}

/** The clickable key caps: click to record, Esc cancels, Backspace/Delete clears. */
export const HotkeyKeys = ({ t, label, value, recording, disabled, onRecordingChange, onChange }: HotkeyKeysProps) => {
    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!recording || disabled) return;
        event.preventDefault();
        event.stopPropagation();
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
    return (
        <div
            className={`key-group ${recording ? "recording" : ""} ${disabled ? "is-disabled" : ""}`}
            role="button"
            aria-label={label}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onClick={(event) => {
                if (disabled) return;
                onRecordingChange(true);
                event.currentTarget.focus();
            }}
            onKeyDown={onKeyDown}
            onBlur={() => onRecordingChange(false)}
        >
            {recording ? (
                <div className="key-cap key-cap-recording">{t("waiting_for_input")}</div>
            ) : tokens.length === 0 ? (
                <div className="key-cap key-cap-empty">{t("not_set")}</div>
            ) : (
                tokens.map((token, index) => (
                    <div className="key-cap" key={`${token.raw}-${index}`}>{token.label}</div>
                ))
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
    className?: string;
}

/** A settings row: label, hint (or the recording hint), key caps. */
export const HotkeyField = ({ hint, className, ...keys }: HotkeyFieldProps) => (
    <div className={`setting-item ${className ?? ""}`}>
        <div className="item-label-group">
            <span className="item-label">{keys.label}</span>
            <span className="hint hotkey-hint">
                {keys.recording ? <HotkeyRecordingHint t={keys.t} /> : hint || keys.t("hotkey_click_hint")}
            </span>
        </div>
        <HotkeyKeys {...keys} />
    </div>
);
