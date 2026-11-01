# AuraClip · notes for coding agents

AuraClip (极光剪贴板) is a **Windows-only** clipboard manager: clipboard history
(text, image, file, path), quick phrases, tags, at-rest encryption, privacy
blur, sequential/plain paste, a copy sound, and **SMS verification-code sync**
over MQTT. Tauri 2 (Rust) backend + React 19/TypeScript frontend. Fork of
TieZ Clipboard, GPL-3.0. The owner uses it daily: keep it working.

## Layout

```
src-tauri/src/
  main.rs                 Tauri builder, plugins, generate_handler! (every command is listed here)
  app/
    setup.rs              startup: data dir, DB, StartupSettings load, state, services, global-shortcut dispatch
    commands/             Tauri command layer (thin; one file per area)
      history_cmd.rs      history list/search/delete/import
      clipboard_cmd.rs    edit/pin/tag/note entries
      phrase_cmd.rs       quick phrases
      settings_cmd.rs     save_setting + typed setters
      hotkey_cmd.rs       global hotkey table, registration, conflict checks
      system_cmd.rs       autostart, data path, Win+V takeover, admin, apps
      secure_transfer.rs  password-protected text export/import
    window_manager.rs     show/hide/focus/position of the main window
    light_mode.rs         drops the WebView when idle; rebuilds it on demand
    hooks/                low-level keyboard/mouse hooks
  services/
    clipboard/            capture pipeline (mod.rs process_new_entry → pipeline.rs dedupe/store/emit)
    clipboard_listener.rs Windows clipboard change listener
    clipboard_ops.rs      copy / paste into the previous app
    paste_queue.rs        sequential paste
    mqtt_sub.rs           SMS sync: MQTT client → clipboard + history + notification
    network_recovery.rs   reconnect MQTT after wake / network change
    encryption_queue.rs   background encrypt/decrypt of sensitive entries
    importers/            Ditto import
    ui_sound.rs           copy sound (pastes are silent)
  infrastructure/
    repository/           SQLite repos (clipboard, phrase, tag, settings) + migrations.rs
    windows_api/          Win32: clipboard formats, drag/drop, single instance, elevated autostart
    encryption.rs         AES-GCM; master key in master.key.dpapi (DPAPI, bound to this Windows user)
  database.rs             DbState, init_db, INSERT OR IGNORE setting defaults
  app_state.rs            SettingsState (in-memory copies of settings used by hot paths)

src/
  App.tsx                 shell: tabs (clipboard / phrases), overlays, event listeners
  features/
    clipboard/            history list, item, detail pane, compact preview
    quick-phrases/        phrases view, tag manager, modal
    settings/             SettingsPanel + groups/*SettingsGroup.tsx
    tag/                  tag manager
    app/                  header, main content, app-level hooks
  shared/hooks/           settings init/sync, hotkeys, keyboard navigation, history fetch
  locales.ts              zh / en / zh-TW strings (tests check keys stay aligned)
  styles/                 tokens, themes, components (rules: docs/DESIGN-SYSTEM.md)
                          themes/refined.css: the acrylic/mica look (loaded last, glass themes only);
                          clipboard entry tile + hover action pill, phrase cards and tag bar
```

## Key flows

- **Capture**: clipboard_listener → services/clipboard `process_new_entry` →
  pipeline (dedupe, privacy tagging, store, `clipboard-updated` event) → React list.
- **Paste**: frontend click → `copy_to_clipboard` / `paste_*` (clipboard_ops) →
  hide window, restore previous app focus, synthetic paste.
- **Quick phrases**: `phrase_cmd.rs` ↔ `phrase_repo.rs` (`quick_phrases` table,
  independent of history; clearing history never touches phrases).
- **SMS sync** (most important feature): SmsForwarder on the phone publishes
  `{"msg":"..."}` to Mosquitto `mqtt.arvor.me:8883` (TLS, per-device account,
  topic ACL) → `mqtt_sub.rs` → clipboard + history (`source_app = "mqtt"`) +
  system notification. Server notes:
  `D:\!DATA\技术资料\项目交接与运维\12-腾讯云服务器\04-Mosquitto短信同步服务`.
- **Hotkeys**: `hotkey_cmd.rs` holds one table of actions (clipboard Alt+V,
  phrases Alt+C, sequential Alt+Shift+S, plain Alt+Shift+V, search Alt+F);
  registration, conflict checks and dispatch all read it. Tab hotkeys emit
  `open-main-tab` (handled in `App.tsx`); mind the light-mode window rebuild.

## How to add

- **A setting**: default in `database.rs` (`INSERT OR IGNORE`) → load in
  `setup.rs` `StartupSettings` → field in `app_state.rs` `SettingsState` if a
  hot path needs it → handle the key in `settings_cmd.rs` (`save_setting` or a
  setter) → frontend `useSettingsInit` / `useSettingsPostInit`, the settings
  group component, and labels in `locales.ts` (all three languages).
- **A Tauri command**: `#[tauri::command]` fn in `app/commands/*.rs` (logic in
  a service/repo when it is more than glue) → add it to `generate_handler!` in
  `main.rs` → call with `invoke("name", { camelCaseArgs })`.
- **A global hotkey**: one entry in the hotkey action table in
  `hotkey_cmd.rs` + a locale label. Nothing else should need editing.
- **A DB migration**: append a new `if current_version < N` block at the end of
  `infrastructure/repository/migrations.rs`. Never edit or reorder old ones.

## Commands

```powershell
pnpm install
pnpm tauri:dev                                   # dev app (separate identity "AuraClip Dev")
pnpm build                                       # tsc + vite
pnpm test                                        # vitest
pnpm lint; pnpm lint:styles
cargo test --manifest-path src-tauri/Cargo.toml
pnpm preflight                                   # all of the above
pnpm run deploy                                  # release build → install → hash check → restart → source backup
```

`pnpm run deploy` (not `pnpm deploy`, which is pnpm's own command) runs
`scripts/deploy.ps1`. A manual release build must use
`cargo build --release --features tauri/custom-protocol`; without it the exe
loads `http://localhost:1420`. The version lives in `versions.json`
(`pnpm apply-version` copies it to package.json, tauri.conf.json, Cargo.toml).

## Paths

- Source: `D:\!PROJECT\AuraClip`; install: `D:\!SOFTWARE\AuraClip\auraclip.exe`
  (also `maintenance\latest\`); autostart task `\AuraClip\ElevatedAutostart`.
- User data: `%APPDATA%\com.auraclip.clipboard\` — `clipboard.db` (+wal),
  `attachments\`, `master.key.dpapi`, `auraclip.log` (check `[HOTKEY]`, `[MQTT]`).
- Source backup: `D:\!SOFTWARE\AuraClip\maintenance\backup_source.py`
  → `maintenance\backups\AuraClip-最新源码.zip`.
- Handoff docs: `D:\!DATA\技术资料\项目交接与运维\14-AuraClip极光剪贴板`.

## Rules

- Never commit credentials, MQTT/WebDAV passwords, or user data. `tls-credentials.json`
  in the maintenance dir is private.
- Back up the user data folder before changing migrations or settings in bulk.
- Keep the SMS path (receive → clipboard → history → notification) working;
  test with a non-sensitive code after touching `mqtt_sub.rs`.
- Windows only. macOS code was removed; it is kept at git tag `macos-snapshot`
  and in `D:\!SOFTWARE\AuraClip\maintenance\macos-attic` (README inside).
- Do not use git to overwrite uncommitted work you did not make.

## New PC

1. Install Node 24 + pnpm, Rust stable-msvc, VS 2022 C++ Build Tools, WebView2.
2. Clone, `pnpm install`, `pnpm run deploy` (pass `-InstallDir` to
   `scripts/deploy.ps1` if `D:\!SOFTWARE\AuraClip` does not exist there).
3. Copy `%APPDATA%\com.auraclip.clipboard\` from the old PC with AuraClip closed.
   History and phrases carry over, but `master.key.dpapi` only opens on the
   Windows account that made it: re-enter the MQTT password and other
   encrypted settings. Encrypted (sensitive) history entries stay unreadable;
   export them first with the password export in Settings → Data if needed.
