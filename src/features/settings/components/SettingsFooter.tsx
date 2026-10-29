import { RotateCcw } from "lucide-react";
import SettingsAbout from "./SettingsAbout";
import type { ReleaseChannel } from "../../../shared/lib/releaseBuild";

interface SettingsFooterProps {
    expanded?: boolean;
    t: (key: string) => string;
    appVersion: string;
    releaseChannel: ReleaseChannel;
    portable: boolean;
    updateStatus: string;
    setUpdateStatus: (val: string) => void;
    onResetSettings: () => void;
    emailCopied: boolean;
    setEmailCopied: (val: boolean) => void;
}

const SettingsFooter = ({
    expanded = false,
    t,
    appVersion,
    releaseChannel,
    portable,
    onResetSettings,
}: SettingsFooterProps) => {
    if (expanded) {
        return (
            <SettingsAbout
                t={t}
                appVersion={appVersion}
                releaseChannel={releaseChannel}
                portable={portable}
                onResetSettings={onResetSettings}
            />
        );
    }

    return (
        <>
            {/* Footer Actions */}
            <div style={{
                marginTop: '16px',
                display: 'flex',
                justifyContent: 'center',
                gap: '12px',
                flexWrap: 'wrap'
            }}>
                {/* Reset Card */}
                <div
                    className="settings-group"
                    style={{
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        margin: 0,
                        width: 'auto',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '0'
                    }}
                    onClick={() => onResetSettings()}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RotateCcw size={16} />
                        <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>{t('reset_defaults')}</span>
                    </div>
                </div>
            </div>

            {/* Version Info */}
            <div style={{
                marginTop: '16px',
                marginBottom: '32px',
                textAlign: 'center',
                opacity: 1
            }}>
                <div style={{
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.5px',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}>
                    <span>AuraClip {appVersion ? `v${appVersion}` : "v1.0.0"}</span>
                    {releaseChannel === "beta" && (
                        <span className="settings-version-badge beta">Beta</span>
                    )}
                    {portable && (
                        <span className="settings-version-badge portable">Portable</span>
                    )}
                </div>
                <div style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    marginBottom: '4px'
                }}>
                    {t('slogan')}
                </div>
            </div>
        </>
    );
};

export default SettingsFooter;
