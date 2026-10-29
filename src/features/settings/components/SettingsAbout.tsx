import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import appLogo from "../../../../src-tauri/icons/128x128@2x.png";
import type { ReleaseChannel } from "../../../shared/lib/releaseBuild";

interface SettingsAboutProps {
    t: (key: string) => string;
    appVersion: string;
    releaseChannel: ReleaseChannel;
    portable: boolean;
    updateButton?: ReactNode;
    emailCopied?: boolean;
    onCopyEmail?: () => void;
    onResetSettings: () => void;
}

const SettingsAbout = ({ t, appVersion, releaseChannel, portable, onResetSettings }: SettingsAboutProps) => (
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
                    {releaseChannel === "beta" && <span className="settings-version-badge beta">Beta</span>}
                    {portable && <span className="settings-version-badge portable">Portable</span>}
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
