import { RotateCcw } from "lucide-react";
import appLogo from "../../../../src-tauri/icons/128x128@2x.png";

interface SettingsAboutProps {
    t: (key: string) => string;
    appVersion: string;
    onResetSettings: () => void;
}

const SettingsAbout = ({ t, appVersion, onResetSettings }: SettingsAboutProps) => (
    <section className="settings-about" aria-label={t("settings_about")}>
        <header className="settings-about-header">
            <div className="settings-about-identity">
                <img className="settings-about-icon" src={appLogo} alt="AuraClip Logo" />
                <div>
                    <h2>AuraClip</h2>
                    <p className="settings-about-slogan">{t("slogan")}</p>
                </div>
            </div>
            <p className="settings-about-description">{t("about_description")}</p>
        </header>

        <div className="settings-about-version">
            <div className="settings-about-version-info">
                <span className="settings-about-caption">{t("about_version")}</span>
                <div className="settings-about-version-number">
                    <strong>{appVersion ? `v${appVersion}` : "v1.0.0"}</strong>
                </div>
            </div>
        </div>

        <div className="settings-about-reset">
            <div>
                <h3>{t("reset_defaults")}</h3>
                <p>{t("about_reset_desc")}</p>
            </div>
            <button type="button" className="settings-action-button" onClick={onResetSettings}>
                <RotateCcw size={14} aria-hidden="true" />
                <span>{t("reset_defaults")}</span>
            </button>
        </div>
    </section>
);

export default SettingsAbout;
