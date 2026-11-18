use crate::database::DbState;
use crate::global_state::{LAST_APP_SET_HASH, LAST_APP_SET_TIMESTAMP};
use crate::infrastructure::repository::settings_repo::SettingsRepository;
use crate::{error, info};
use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, NetworkOptions, QoS, Transport};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;

#[derive(Clone, Debug)]
struct MqttConfig {
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
    topic: String,
    client_id: String,
    protocol: String,
    ssl: bool,
    ws_path: String,
    #[allow(dead_code)]
    tls_insecure: bool,
}

// Global MQTT client state
static MQTT_RUNNING: AtomicBool = AtomicBool::new(false);
static MQTT_CONNECTED: AtomicBool = AtomicBool::new(false);
static MQTT_RECONNECT_ATTEMPTS: AtomicU32 = AtomicU32::new(0);
/// A connection that lasted this long resets the reconnect backoff.
const STABLE_CONNECTION: Duration = Duration::from_secs(60);
/// rumqttc's default is 10 KB, which dropped long texts and tore down the
/// connection on every oversized (possibly retained) message.
const MAX_MQTT_PACKET: usize = 1024 * 1024;
static MQTT_TASK_ACTIVE: AtomicBool = AtomicBool::new(false);
static MQTT_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Unix ms of the last packet received from the broker (PingResp included).
static MQTT_LAST_INBOUND_MS: AtomicU64 = AtomicU64::new(0);
/// Unix ms of the last application message received on our subscribed topic.
static MQTT_LAST_MESSAGE_MS: AtomicU64 = AtomicU64::new(0);
static ACTIVE_MQTT_CLIENT: OnceLock<Mutex<Option<(AsyncClient, String)>>> = OnceLock::new();

fn active_client_slot() -> &'static Mutex<Option<(AsyncClient, String)>> {
    ACTIVE_MQTT_CLIENT.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct MqttTelemetry {
    pub connected: bool,
    pub running: bool,
    pub last_inbound_ms: u64,
    pub last_message_ms: u64,
}
const KEEP_ALIVE: Duration = Duration::from_secs(30);
/// rumqttc's 5 s default was too short for the TLS handshake to the broker
/// ("Network timeout" / "tls handshake eof" in the logs).
const CONNECT_TIMEOUT_SECS: u64 = 15;
/// A redelivered (dup) QoS 1 message whose text was applied this recently is
/// the same message again, not a new one.
const DUP_WINDOW_MS: u64 = 10 * 60 * 1000;

fn restart_signal() -> &'static tokio::sync::Notify {
    static SIGNAL: OnceLock<tokio::sync::Notify> = OnceLock::new();
    SIGNAL.get_or_init(tokio::sync::Notify::new)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// A connection that still hears from the broker (a PingResp arrives at least
/// every keep-alive) survived the network change; restarting it only opens a
/// window where messages are missed.
fn connection_is_healthy(connected: bool, last_inbound_ms: u64, now_ms: u64) -> bool {
    let window = KEEP_ALIVE.as_millis() as u64 * 3 / 2;
    connected && last_inbound_ms > 0 && now_ms.saturating_sub(last_inbound_ms) <= window
}

/// Session options shared by every connection. `clean_session(false)` keeps
/// the broker session across reconnects, so QoS 1 messages published while
/// this computer is briefly offline are queued and delivered afterwards.
fn apply_session_options(options: &mut MqttOptions) {
    options.set_keep_alive(KEEP_ALIVE);
    options.set_clean_session(false);
    options.set_max_packet_size(MAX_MQTT_PACKET, MAX_MQTT_PACKET);
}

fn network_options() -> NetworkOptions {
    let mut options = NetworkOptions::new();
    options.set_connection_timeout(CONNECT_TIMEOUT_SECS);
    options
}

/// Only messages under the configured topic are clipboard text. A persistent
/// session can still hold a subscription from a topic used before.
fn is_own_topic(topic: &str, root: &str) -> bool {
    let root = root.trim().trim_end_matches('/');
    topic == root || topic.strip_prefix(root).is_some_and(|rest| rest.starts_with('/'))
}

/// Texts applied recently, to drop broker redeliveries of the same message.
#[derive(Default)]
struct RecentPayloads {
    seen: std::collections::VecDeque<(u64, u64)>,
}

impl RecentPayloads {
    /// Returns false for a dup redelivery of a payload applied within the
    /// window. Fresh (non-dup) messages always pass, even with the same text.
    fn accept(&mut self, payload: &[u8], dup: bool, now_ms: u64) -> bool {
        let mut hasher = DefaultHasher::new();
        payload.hash(&mut hasher);
        let hash = hasher.finish();
        self.seen
            .retain(|(_, at)| now_ms.saturating_sub(*at) <= DUP_WINDOW_MS);
        if dup && self.seen.iter().any(|(seen, _)| *seen == hash) {
            return false;
        }
        self.seen.push_back((hash, now_ms));
        while self.seen.len() > 64 {
            self.seen.pop_front();
        }
        true
    }
}

fn default_client_id(device_id: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = format!("{:x}", Sha256::digest(device_id.as_bytes()));
    format!("tiez_{}", &digest[..16])
}

fn reconnect_delay(attempt: u32) -> Duration {
    // Clamp before exponentiation so a long offline period cannot overflow.
    Duration::from_secs((5u64 << attempt.saturating_sub(1).min(4)).min(60))
}

async fn wait_or_restart(delay: Duration, generation: u64) {
    if MQTT_GENERATION.load(Ordering::Relaxed) != generation {
        return;
    }
    tokio::select! {
        _ = restart_signal().notified() => {},
        _ = sleep(delay) => {},
    }
}

pub fn recover_mqtt_connection(app: AppHandle) {
    if get_mqtt_config(&app).is_none() {
        return;
    }
    if connection_is_healthy(
        MQTT_CONNECTED.load(Ordering::Relaxed),
        MQTT_LAST_INBOUND_MS.load(Ordering::Relaxed),
        now_ms(),
    ) {
        info!(">>> [MQTT] Connection healthy after network change; not restarting");
        return;
    }
    restart_mqtt_client(app);
}

struct MqttTaskGuard;

impl Drop for MqttTaskGuard {
    fn drop(&mut self) {
        MQTT_CONNECTED.store(false, Ordering::Relaxed);
        MQTT_TASK_ACTIVE.store(false, Ordering::Relaxed);
        if let Ok(mut slot) = active_client_slot().lock() {
            *slot = None;
        }
    }
}

pub fn get_mqtt_status() -> bool {
    MQTT_CONNECTED.load(Ordering::Relaxed)
}

pub fn get_mqtt_running() -> bool {
    MQTT_RUNNING.load(Ordering::Relaxed)
}

pub fn get_mqtt_telemetry(app: &AppHandle) -> MqttTelemetry {
    let mut last_msg = MQTT_LAST_MESSAGE_MS.load(Ordering::Relaxed);
    if last_msg == 0 {
        if let Some(db) = app.try_state::<DbState>() {
            if let Some(saved) = db
                .settings_repo
                .get("mqtt_last_message_ms")
                .ok()
                .flatten()
                .and_then(|s| s.parse::<u64>().ok())
            {
                MQTT_LAST_MESSAGE_MS.store(saved, Ordering::Relaxed);
                last_msg = saved;
            }
        }
    }
    MqttTelemetry {
        connected: MQTT_CONNECTED.load(Ordering::Relaxed),
        running: MQTT_RUNNING.load(Ordering::Relaxed),
        last_inbound_ms: MQTT_LAST_INBOUND_MS.load(Ordering::Relaxed),
        last_message_ms: last_msg,
    }
}

pub async fn send_mqtt_self_test(_app: AppHandle) -> crate::error::AppResult<()> {
    let client_and_topic = active_client_slot()
        .lock()
        .map_err(|_| crate::error::AppError::Internal("MQTT 锁异常".into()))?
        .clone();
    let Some((client, topic)) = client_and_topic else {
        return Err(crate::error::AppError::Validation(
            "MQTT 当前未连接，请先开启并确认连接成功".into(),
        ));
    };
    if !MQTT_CONNECTED.load(Ordering::Relaxed) {
        return Err(crate::error::AppError::Validation(
            "MQTT 当前处于未连接状态".into(),
        ));
    }
    let test_topic = format!("{}/selftest", topic.trim_end_matches('/'));
    let code = 100_000 + (now_ms() % 900_000);
    let payload = serde_json::json!({
        "msg": format!("【AuraClip 回路自检】验证码 {}，链路收发正常（测试消息）。", code)
    })
    .to_string();
    client
        .publish(test_topic, QoS::AtLeastOnce, false, payload.into_bytes())
        .await
        .map_err(|e| crate::error::AppError::Network(format!("自检消息发送失败: {e}")))?;
    Ok(())
}

/// Periodically sweeps expired unpinned/untagged `source_app = 'mqtt'` entries
/// when `app.mqtt_sms_ttl_minutes` > 0.
pub fn start_sms_ttl_sweeper(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        let Some(db) = app.try_state::<DbState>() else {
            continue;
        };
        let ttl_minutes = db
            .settings_repo
            .get("app.mqtt_sms_ttl_minutes")
            .ok()
            .flatten()
            .and_then(|v| v.trim().parse::<i64>().ok())
            .unwrap_or(0);
        if ttl_minutes <= 0 {
            continue;
        }
        let cutoff_ms = (now_ms() as i64).saturating_sub(ttl_minutes.saturating_mul(60_000));

        // 1. Sweep session items
        if let Some(session) = app.try_state::<crate::app_state::SessionHistory>() {
            let mut removed_session_ids = Vec::new();
            {
                let mut items = session.0.lock().unwrap();
                items.retain(|item| {
                    let expired = item.source_app == "mqtt"
                        && !item.is_pinned
                        && item.tags.is_empty()
                        && item.sort_at > 0
                        && item.sort_at < cutoff_ms;
                    if expired {
                        removed_session_ids.push(item.id);
                    }
                    !expired
                });
            }
            for rid in removed_session_ids {
                let _ = app.emit("clipboard-removed", rid);
            }
        }

        // 2. Sweep SQLite items
        let expired_ids: Vec<i64> = {
            let Ok(conn) = db.conn.lock() else {
                continue;
            };
            let Ok(mut stmt) = conn.prepare(
                "SELECT ch.id
                 FROM clipboard_history ch
                 WHERE ch.source_app = 'mqtt'
                   AND ch.is_pinned = 0
                   AND ch.sort_at < ?1
                   AND NOT EXISTS (
                       SELECT 1 FROM entry_tags et WHERE et.entry_id = ch.id
                   )
                 LIMIT 100",
            ) else {
                continue;
            };
            let rows = stmt
                .query_map([cutoff_ms], |r| r.get::<_, i64>(0))
                .ok()
                .map(|it| it.flatten().collect::<Vec<_>>())
                .unwrap_or_default();
            rows
        };

        if !expired_ids.is_empty() {
            let data_dir = app
                .try_state::<crate::app_state::AppDataDir>()
                .map(|d| d.0.lock().unwrap().clone());
            for id in expired_ids {
                if db.repo.delete_after_paste(id, data_dir.as_deref()).is_ok() {
                    let _ = app.emit("clipboard-removed", id);
                }
            }
        }
    });
}

// Force restart MQTT client by setting running flag to false
pub fn restart_mqtt_client(app: AppHandle) {
    info!(">>> [MQTT] Restart requested.");
    MQTT_RUNNING.store(false, Ordering::Relaxed);
    MQTT_CONNECTED.store(false, Ordering::Relaxed);
    MQTT_RECONNECT_ATTEMPTS.store(0, Ordering::Relaxed);
    MQTT_GENERATION.fetch_add(1, Ordering::Relaxed);
    restart_signal().notify_one();

    // 如果之前达到最大重连次数导致任务退出，重新启动任务
    if !MQTT_TASK_ACTIVE.load(Ordering::Relaxed) {
        start_mqtt_client(app);
    }
}

// Function to read config from DB
fn get_mqtt_config(app: &AppHandle) -> Option<MqttConfig> {
    let db_state = match app.try_state::<DbState>() {
        Some(s) => s,
        None => return None,
    };

    let enabled_str = db_state
        .settings_repo
        .get("mqtt_enabled")
        .ok()
        .flatten()
        .unwrap_or("false".to_string());
    if enabled_str != "true" {
        return None;
    }

    let host = db_state
        .settings_repo
        .get("mqtt_server")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    if host.is_none() || host.as_ref().unwrap().is_empty() {
        return None;
    }
    let host = host.unwrap();

    let port_str = db_state.settings_repo.get("mqtt_port").ok().flatten();
    let port = port_str.and_then(|p| p.parse::<u16>().ok()).unwrap_or(443);

    let password = db_state
        .settings_repo
        .get("mqtt_password")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    // Topic logic (using shortened ID)
    let stored_anon_id = db_state.settings_repo.get("app.anon_id").ok().flatten();
    let anon_id = stored_anon_id
        .as_deref()
        .and_then(crate::app::system::normalize_anon_id)
        .unwrap_or_else(
            || crate::app::system::build_anon_id(&crate::app::system::get_machine_id()),
        );
    if stored_anon_id
        .as_deref()
        .map(|value| value.trim() != anon_id)
        .unwrap_or(true)
    {
        let _ = db_state.settings_repo.set("app.anon_id", &anon_id);
    }
    let db_topic = db_state
        .settings_repo
        .get("mqtt_topic")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    // The topic is the only thing keeping strangers on a shared broker out, so
    // a new install gets an unguessable one (128 random bits) instead of the
    // first 8 hex digits of the anonymous id. Saved topics are kept: the phone
    // was paired with them.
    let topic = db_topic.unwrap_or_else(|| {
        let default_topic = format!("tiez/tiez_{}", uuid::Uuid::new_v4().simple());
        let _ = db_state.settings_repo.set("mqtt_topic", &default_topic);
        default_topic
    });

    let custom_client_id = db_state
        .settings_repo
        .get("mqtt_client_id")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    // Shared topics must not give different computers the same broker session ID.
    let client_id = custom_client_id.unwrap_or_else(|| default_client_id(&anon_id));

    let username = db_state
        .settings_repo
        .get("mqtt_username")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    let protocol = db_state
        .settings_repo
        .get("mqtt_protocol")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if port == 8883 || port == 443 {
                "mqtts://".to_string()
            } else {
                "mqtt://".to_string()
            }
        });

    // Prefer the explicit protocol selection. `mqtt_ssl` is a legacy flag and
    // should not force TLS when the user selected mqtt:// or ws://.
    let legacy_ssl = db_state
        .settings_repo
        .get("mqtt_ssl")
        .ok()
        .flatten()
        .map(|s| s == "true");
    let ssl = if protocol.starts_with("mqtt://") || protocol.starts_with("ws://") {
        false
    } else if protocol.starts_with("mqtts://") || protocol.starts_with("wss://") {
        true
    } else {
        legacy_ssl.unwrap_or(port == 8883 || port == 443)
    };

    let ws_path = db_state
        .settings_repo
        .get("mqtt_ws_path")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/mqtt".to_string());

    let tls_insecure = db_state
        .settings_repo
        .get("mqtt_tls_insecure")
        .ok()
        .flatten()
        .map(|s| s == "true")
        .unwrap_or(false);

    Some(MqttConfig {
        host,
        port,
        username,
        password,
        topic,
        client_id,
        protocol,
        ssl,
        ws_path,
        tls_insecure,
    })
}

pub fn start_mqtt_client(app: AppHandle) {
    if MQTT_TASK_ACTIVE.swap(true, Ordering::Relaxed) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        let _guard = MqttTaskGuard;
        let mut recent_payloads = RecentPayloads::default();
        // Loop forever if enabled, using exponential backoff inside.

        loop {
            MQTT_CONNECTED.store(false, Ordering::Relaxed);
            let generation = MQTT_GENERATION.load(Ordering::Relaxed);
            let config = get_mqtt_config(&app);

            if let Some(cfg) = config {
                if !MQTT_RUNNING.load(Ordering::Relaxed) {
                    info!(">>> [MQTT] Enabling MQTT client");
                    MQTT_RUNNING.store(true, Ordering::Relaxed);
                    let _ = app.emit("mqtt-status", "connecting");
                }

                // Extract host from config (strip scheme, path, and optional port)
                let host_clean = cfg
                    .host
                    .trim_start_matches("wss://")
                    .trim_start_matches("ws://")
                    .trim_start_matches("mqtt://")
                    .trim_start_matches("mqtts://")
                    .split('/')
                    .next()
                    .unwrap_or(&cfg.host)
                    .to_string();
                let host_clean = if host_clean.starts_with('[') {
                    if let Some(idx) = host_clean.rfind("]:") {
                        let (h, p) = host_clean.split_at(idx + 1);
                        if p.trim_start_matches(':')
                            .chars()
                            .all(|c| c.is_ascii_digit())
                        {
                            h.to_string()
                        } else {
                            host_clean
                        }
                    } else {
                        host_clean
                    }
                } else if let Some((h, p)) = host_clean.rsplit_once(':') {
                    if p.chars().all(|c| c.is_ascii_digit()) {
                        h.to_string()
                    } else {
                        host_clean
                    }
                } else {
                    host_clean
                };

                let use_wss = cfg.protocol.starts_with("wss://");
                let use_tls = cfg.protocol.starts_with("mqtts://") || (cfg.ssl && !use_wss);
                let use_ws = cfg.protocol.starts_with("ws://");
                let ws_path = if cfg.ws_path.starts_with('/') {
                    cfg.ws_path.clone()
                } else {
                    format!("/{}", cfg.ws_path)
                };

                info!(
                    ">>> [MQTT] Connecting to '{}:{}' (Protocol: {}, ID: {})",
                    host_clean, cfg.port, cfg.protocol, cfg.client_id
                );

                // Build mqtt options. For websockets we must store a full URL in broker_addr.
                let mut mqttoptions = if use_wss {
                    let url = format!("wss://{}:{}{}", host_clean, cfg.port, ws_path);
                    MqttOptions::new(cfg.client_id.clone(), url, cfg.port)
                } else if use_ws {
                    let url = format!("ws://{}:{}{}", host_clean, cfg.port, ws_path);
                    MqttOptions::new(cfg.client_id.clone(), url, cfg.port)
                } else {
                    MqttOptions::new(cfg.client_id.clone(), host_clean.clone(), cfg.port)
                };

                // Build rustls config manually so MQTT TLS/WSS does not depend on
                // potentially problematic system certificate stores.
                if use_wss || use_tls {
                    let mut root_store = rustls::RootCertStore::empty();
                    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

                    let mut config = rustls::ClientConfig::builder()
                        .with_root_certificates(root_store)
                        .with_no_client_auth();

                    if cfg.tls_insecure {
                        #[derive(Debug)]
                        struct NoVerifier;

                        impl rustls::client::danger::ServerCertVerifier for NoVerifier {
                            fn verify_server_cert(
                                &self,
                                _end_entity: &rustls::pki_types::CertificateDer<'_>,
                                _intermediates: &[rustls::pki_types::CertificateDer<'_>],
                                _server_name: &rustls::pki_types::ServerName<'_>,
                                _ocsp_response: &[u8],
                                _now: rustls::pki_types::UnixTime,
                            ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error>
                            {
                                Ok(rustls::client::danger::ServerCertVerified::assertion())
                            }

                            fn verify_tls12_signature(
                                &self,
                                _message: &[u8],
                                _cert: &rustls::pki_types::CertificateDer<'_>,
                                _dss: &rustls::DigitallySignedStruct,
                            ) -> Result<
                                rustls::client::danger::HandshakeSignatureValid,
                                rustls::Error,
                            > {
                                Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
                            }

                            fn verify_tls13_signature(
                                &self,
                                _message: &[u8],
                                _cert: &rustls::pki_types::CertificateDer<'_>,
                                _dss: &rustls::DigitallySignedStruct,
                            ) -> Result<
                                rustls::client::danger::HandshakeSignatureValid,
                                rustls::Error,
                            > {
                                Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
                            }

                            fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
                                vec![
                                    rustls::SignatureScheme::RSA_PKCS1_SHA1,
                                    rustls::SignatureScheme::ECDSA_SHA1_Legacy,
                                    rustls::SignatureScheme::RSA_PKCS1_SHA256,
                                    rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
                                    rustls::SignatureScheme::RSA_PKCS1_SHA384,
                                    rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
                                    rustls::SignatureScheme::RSA_PKCS1_SHA512,
                                    rustls::SignatureScheme::ECDSA_NISTP521_SHA512,
                                    rustls::SignatureScheme::RSA_PSS_SHA256,
                                    rustls::SignatureScheme::RSA_PSS_SHA384,
                                    rustls::SignatureScheme::RSA_PSS_SHA512,
                                    rustls::SignatureScheme::ED25519,
                                    rustls::SignatureScheme::ED448,
                                ]
                            }
                        }

                        config
                            .dangerous()
                            .set_certificate_verifier(std::sync::Arc::new(NoVerifier));
                    }

                    if use_wss {
                        mqttoptions.set_transport(Transport::wss_with_config(config.into()));
                    } else {
                        mqttoptions.set_transport(Transport::tls_with_config(config.into()));
                    }
                } else if use_ws {
                    mqttoptions.set_transport(Transport::ws());
                }

                apply_session_options(&mut mqttoptions);

                if let Some(u) = cfg.username.clone() {
                    let p = cfg.password.clone().unwrap_or_default();
                    mqttoptions.set_credentials(u, p);
                }

                let (client, mut eventloop) = AsyncClient::new(mqttoptions, 10);
                eventloop.set_network_options(network_options());

                let mut connected = false;
                let connecting = tokio::time::timeout(Duration::from_secs(30), async {
                    loop {
                        match eventloop.poll().await {
                            Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                                MQTT_LAST_INBOUND_MS.store(now_ms(), Ordering::Relaxed);
                                info!(">>> [MQTT] Connection Established.");
                                MQTT_CONNECTED.store(true, Ordering::Relaxed);
                                // Attempts are reset only once a connection has
                                // proved stable (see the event-loop error below).
                                let _ = app.emit("mqtt-status", "connected");
                                return Ok::<(), rumqttc::ConnectionError>(());
                            }
                            Ok(_) => continue,
                            Err(e) => return Err(e),
                        }
                    }
                });
                let connect_result = tokio::select! {
                    biased;
                    _ = restart_signal().notified() => continue,
                    result = connecting => result,
                };
                if MQTT_GENERATION.load(Ordering::Relaxed) != generation {
                    continue;
                }

                match connect_result {
                    Ok(Ok(())) => connected = true,
                    Ok(Err(e)) => {
                        error!(">>> [MQTT] Connection error: {}", e);
                    }
                    Err(_) => {
                        error!(">>> [MQTT] Connection timeout.");
                    }
                }

                if !connected {
                    let current_attempts =
                        MQTT_RECONNECT_ATTEMPTS.fetch_add(1, Ordering::Relaxed) + 1;
                    MQTT_RUNNING.store(false, Ordering::Relaxed);
                    MQTT_CONNECTED.store(false, Ordering::Relaxed);
                    let _ = app.emit("mqtt-status", "disconnected");

                    // Cap backoff at 60 seconds
                    let delay = reconnect_delay(current_attempts);
                    info!(">>> [MQTT] Retrying in {}s (Attempt {})...", delay.as_secs(), current_attempts);
                    wait_or_restart(delay, generation).await;
                    continue;
                }

                let sub_topic = format!("{}/#", cfg.topic);
                if let Err(e) = client.subscribe(sub_topic.clone(), QoS::AtLeastOnce).await {
                    error!(">>> [MQTT] Subscribe failed: {:?}", e);
                    wait_or_restart(Duration::from_secs(2), generation).await;
                    continue;
                }
                info!(">>> [MQTT] Subscribed to {}", sub_topic);
                if let Ok(mut slot) = active_client_slot().lock() {
                    *slot = Some((client.clone(), cfg.topic.clone()));
                }

                let connected_at = Instant::now();

                loop {
                    // Restart/stop requested: drop this connection and let outer loop reconnect.
                    if !MQTT_RUNNING.load(Ordering::Relaxed)
                        || MQTT_GENERATION.load(Ordering::Relaxed) != generation {
                        info!(">>> [MQTT] Stop/restart requested. Leaving event loop.");
                        MQTT_CONNECTED.store(false, Ordering::Relaxed);
                        let _ = app.emit("mqtt-status", "disconnected");
                        let _ = client.try_disconnect();
                        break;
                    }

                    let poll_result = tokio::select! {
                        biased;
                        _ = restart_signal().notified() => break,
                        result = tokio::time::timeout(Duration::from_secs(5), eventloop.poll()) => result,
                    };
                    match poll_result {
                        Ok(event_result) => match event_result {
                            Ok(Event::Incoming(notification)) => {
                                MQTT_LAST_INBOUND_MS.store(now_ms(), Ordering::Relaxed);
                                match notification {
                                Incoming::Publish(publish) => {
                                    if !is_own_topic(&publish.topic, &cfg.topic) {
                                        continue;
                                    }
                                    if !recent_payloads.accept(&publish.payload, publish.dup, now_ms()) {
                                        info!(">>> [MQTT] Dropped a redelivered duplicate message");
                                        continue;
                                    }
                                    // The broker redelivers a retained message on every
                                    // (re)connect; apply each one once.
                                    if publish.retain && !first_delivery_of_retained(&app, &publish.payload) {
                                        continue;
                                    }
                                    if let Ok(payload_str) = std::str::from_utf8(&publish.payload) {
                                        let payload_trimmed = payload_str.trim();
                                        let final_content = if let Ok(json_val) =
                                            serde_json::from_str::<serde_json::Value>(
                                                payload_trimmed,
                                            ) {
                                            let content_fields =
                                                ["msg", "content", "body", "text", "message"];
                                            let mut found_content = None;
                                            for field in content_fields {
                                                if let Some(val) = json_val.get(field) {
                                                    if let Some(s) = val.as_str() {
                                                        found_content = Some(s.to_string());
                                                        break;
                                                    } else if val.is_number() || val.is_boolean() {
                                                        found_content = Some(val.to_string());
                                                        break;
                                                    }
                                                }
                                            }
                                            found_content
                                                .unwrap_or_else(|| payload_trimmed.to_string())
                                        } else {
                                            payload_trimmed.to_string()
                                        };

                                        let msg_ts = now_ms();
                                        MQTT_LAST_MESSAGE_MS.store(msg_ts, Ordering::Relaxed);
                                        if let Some(db) = app.try_state::<DbState>() {
                                            let _ = db
                                                .settings_repo
                                                .set("mqtt_last_message_ms", &msg_ts.to_string());
                                        }
                                        let _ = app.emit("mqtt-message-received", msg_ts);
                                        apply_incoming_text(&app, final_content.clone());
                                        notify_incoming_message(&app, &final_content);
                                    }
                                }
                                Incoming::SubAck(ack) => {
                                    if ack.return_codes.iter().any(|code| matches!(code, rumqttc::SubscribeReasonCode::Failure)) {
                                        error!(">>> [MQTT] Subscription refused by the broker; check the account ACL");
                                    }
                                }
                                Incoming::ConnAck(_) => {
                                    let _ = app.emit("mqtt-status", "connected");
                                }
                                _ => {}
                                }
                            }
                            Ok(Event::Outgoing(_)) => {}
                            Err(e) => {
                                error!(">>> [MQTT] Event loop error: {:?}", e);
                                MQTT_RUNNING.store(false, Ordering::Relaxed);
                                MQTT_CONNECTED.store(false, Ordering::Relaxed);
                                let _ = app.emit("mqtt-status", "disconnected");
                                // Back off before reconnecting. A connection that
                                // keeps dropping right after connecting (another
                                // client with this id, a broker kick, a packet it
                                // rejects) must not turn into a tight loop.
                                let attempts = if connected_at.elapsed() >= STABLE_CONNECTION {
                                    MQTT_RECONNECT_ATTEMPTS.store(1, Ordering::Relaxed);
                                    1
                                } else {
                                    MQTT_RECONNECT_ATTEMPTS.fetch_add(1, Ordering::Relaxed) + 1
                                };
                                let delay = reconnect_delay(attempts);
                                info!(">>> [MQTT] Reconnecting in {}s (Attempt {})...", delay.as_secs(), attempts);
                                wait_or_restart(delay, generation).await;
                                break;
                            }
                        },
                        Err(_) => {
                            // Timeout: check stop/restart flag and whether still enabled
                            if !MQTT_RUNNING.load(Ordering::Relaxed) {
                                info!(">>> [MQTT] Stop/restart requested during idle poll.");
                                MQTT_CONNECTED.store(false, Ordering::Relaxed);
                                let _ = app.emit("mqtt-status", "disconnected");
                                let _ = client.try_disconnect();
                                break;
                            }
                            if get_mqtt_config(&app).is_none() {
                                info!(">>> [MQTT] Disabled. Stopping task.");
                                MQTT_RUNNING.store(false, Ordering::Relaxed);
                                MQTT_CONNECTED.store(false, Ordering::Relaxed);
                                let _ = app.emit("mqtt-status", "disconnected");
                                return;
                            }
                        }
                    }
                }
            } else if MQTT_RUNNING.load(Ordering::Relaxed) {
                info!(">>> [MQTT] Configuration invalid or disabled.");
                MQTT_RUNNING.store(false, Ordering::Relaxed);
                let _ = app.emit("mqtt-status", "disconnected");
            }

            // Reconnect promptly after an explicit stop/restart signal.
            if !MQTT_RUNNING.load(Ordering::Relaxed) && get_mqtt_config(&app).is_some() {
                continue;
            }

            wait_or_restart(Duration::from_secs(5), generation).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn shared_topics_do_not_share_default_broker_session_ids() {
        assert_ne!(default_client_id("device-a"), default_client_id("device-b"));
        assert_eq!(default_client_id("device-a"), default_client_id("device-a"));
        assert!(default_client_id("device-a").len() <= 23);
    }

    #[test]
    fn reconnect_backoff_is_bounded_even_after_a_long_outage() {
        assert_eq!(reconnect_delay(1), Duration::from_secs(5));
        assert_eq!(reconnect_delay(2), Duration::from_secs(10));
        assert_eq!(reconnect_delay(4), Duration::from_secs(40));
        assert_eq!(reconnect_delay(5), Duration::from_secs(60));
        assert_eq!(reconnect_delay(u32::MAX), Duration::from_secs(60));
    }

    #[tokio::test]
    async fn restart_interrupts_the_backoff_and_stale_connections_do_not_wait() {
        let generation = MQTT_GENERATION.load(Ordering::Relaxed);
        let restart = async {
            tokio::task::yield_now().await;
            restart_signal().notify_one();
        };
        tokio::time::timeout(Duration::from_secs(1), async {
            tokio::join!(
                wait_or_restart(Duration::from_secs(60), generation),
                restart
            );
        })
        .await
        .unwrap();
        tokio::time::timeout(
            Duration::from_secs(1),
            wait_or_restart(Duration::from_secs(60), generation.wrapping_sub(1)),
        )
        .await
        .unwrap();
    }

    async fn read_packet(stream: &mut tokio::net::TcpStream) -> (u8, Vec<u8>) {
        let header = stream.read_u8().await.unwrap();
        let mut length = 0usize;
        let mut multiplier = 1;
        loop {
            let byte = stream.read_u8().await.unwrap();
            length += (byte as usize & 127) * multiplier;
            if byte & 128 == 0 {
                break;
            }
            multiplier *= 128;
            assert!(multiplier <= 128usize.pow(3));
        }
        assert!(length < 4096);
        let mut body = vec![0; length];
        stream.read_exact(&mut body).await.unwrap();
        (header, body)
    }

    #[tokio::test]
    async fn connect_keeps_the_broker_session_and_the_30s_keep_alive() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let broker = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let (header, body) = read_packet(&mut stream).await;
            assert_eq!(header >> 4, 1); // CONNECT
            stream.write_all(&[0x20, 2, 0, 0]).await.unwrap(); // CONNACK
            body
        });

        let mut options = MqttOptions::new(default_client_id("device-a"), "127.0.0.1", port);
        apply_session_options(&mut options);
        let (_client, mut eventloop) = AsyncClient::new(options, 10);
        eventloop.set_network_options(network_options());
        let event = tokio::time::timeout(Duration::from_secs(5), eventloop.poll())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(event, Event::Incoming(Incoming::ConnAck(_))));

        let body = broker.await.unwrap();
        // Variable header: protocol name "MQTT" (2 + 4 bytes), level, flags, keep-alive.
        assert_eq!(&body[..7], &[0, 4, b'M', b'Q', b'T', b'T', 4]);
        assert_eq!(body[7] & 0x02, 0, "clean session must be off");
        assert_eq!(u16::from_be_bytes([body[8], body[9]]), 30);
    }

    #[test]
    fn connect_timeout_allows_a_slow_tls_handshake() {
        assert_eq!(network_options().connection_timeout(), 15);
    }

    #[test]
    fn a_connection_that_still_hears_the_broker_is_not_restarted() {
        let now = 1_000_000;
        assert!(connection_is_healthy(true, now - 10_000, now));
        assert!(connection_is_healthy(true, now - 45_000, now));
        // Silent past 1.5x keep-alive (e.g. after sleep): restart.
        assert!(!connection_is_healthy(true, now - 46_000, now));
        assert!(!connection_is_healthy(false, now - 1_000, now));
        assert!(!connection_is_healthy(true, 0, now));
    }

    #[test]
    fn only_the_configured_topic_tree_is_clipboard_text() {
        let root = "tiez/tiez_abc";
        assert!(is_own_topic("tiez/tiez_abc", root));
        assert!(is_own_topic("tiez/tiez_abc/sms", root));
        assert!(is_own_topic("tiez/tiez_abc/sms", "tiez/tiez_abc/"));
        assert!(!is_own_topic("tiez/tiez_abcdef", root));
        assert!(!is_own_topic("tiez/tiez_old/sms", root));
    }

    #[test]
    fn redelivered_duplicates_are_dropped_but_repeated_texts_pass() {
        let mut recent = RecentPayloads::default();
        let now = 5_000_000;
        assert!(recent.accept(b"code 123456", false, now));
        // The phone sending the same text again is a new message.
        assert!(recent.accept(b"code 123456", false, now + 1_000));
        // The broker resending it after a reconnect (dup flag) is not.
        assert!(!recent.accept(b"code 123456", true, now + 2_000));
        // A dup of something never applied still gets through once.
        assert!(recent.accept(b"code 654321", true, now + 3_000));
        // Outside the window a dup is treated as new.
        assert!(recent.accept(b"code 123456", true, now + 2_000 + DUP_WINDOW_MS + 1));
    }

}

/// System notification for an incoming message. Sent from here rather than by
/// the WebView so it still arrives while light mode has destroyed the UI.
fn notify_incoming_message(app: &AppHandle, content: &str) {
    let Some(db) = app.try_state::<DbState>() else {
        return;
    };
    let enabled = db
        .settings_repo
        .get("mqtt_notification_enabled")
        .ok()
        .flatten()
        .map(|value| value != "false")
        .unwrap_or(true);
    if !enabled {
        return;
    }

    let message = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if message.is_empty() {
        return;
    }

    // The same text often arrives twice in a row (retained + live, resends).
    static LAST_NOTIFIED: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
    {
        let mut last = LAST_NOTIFIED
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some((previous, at)) = last.as_ref() {
            if *previous == message && at.elapsed() < Duration::from_secs(10) {
                return;
            }
        }
        *last = Some((message.clone(), Instant::now()));
    }

    // Same wording as mqtt_notification_title in src/locales.ts.
    let title = match db.settings_repo.get("app.language").ok().flatten().as_deref() {
        Some("en") => "New MQTT Message",
        Some("tw") => "收到新訊息",
        _ => "收到新消息",
    };
    let body = if message.chars().count() <= 64 {
        message
    } else {
        format!("{}...", message.chars().take(61).collect::<String>())
    };
    if let Err(err) = app.notification().builder().title(title).body(body).show() {
        error!(">>> [MQTT] Notification failed: {}", err);
    }
}

/// Incoming texts go through one worker so they reach the clipboard in the
/// order they arrived (a blocking task each could finish out of order).
fn apply_incoming_text(app: &AppHandle, text: String) {
    static WORKER: OnceLock<Mutex<std::sync::mpsc::Sender<(AppHandle, String)>>> = OnceLock::new();
    let sender = WORKER.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel::<(AppHandle, String)>();
        std::thread::spawn(move || {
            for (app, text) in rx {
                write_incoming_text(&app, text);
            }
        });
        Mutex::new(tx)
    });
    let _ = sender
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .send((app.clone(), text));
}

fn write_incoming_text(app: &AppHandle, text: String) {
    let normalized = text.trim().replace("\r\n", "\n");
    let mut hasher = DefaultHasher::new();
    normalized.hash(&mut hasher);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    LAST_APP_SET_HASH.store(hasher.finish(), Ordering::SeqCst);
    LAST_APP_SET_TIMESTAMP.store(now, Ordering::SeqCst);
    if let Ok(mut clipboard) = arboard::Clipboard::new() {
        for _ in 0..3 {
            if clipboard.set_text(text.clone()).is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    crate::services::clipboard::process_new_entry(
        app,
        crate::services::clipboard::ClipboardData::Text(text),
        Some("mqtt".to_string()),
    );
}

/// Remembers the last retained payload applied (across restarts), so a stale
/// retained message can't overwrite the clipboard again after every wake or
/// settings change, while a new one sent during downtime still gets through.
fn first_delivery_of_retained(app: &AppHandle, payload: &[u8]) -> bool {
    use sha2::{Digest, Sha256};
    let Some(db) = app.try_state::<DbState>() else {
        return false;
    };
    let digest = format!("{:x}", Sha256::digest(payload));
    let key = "mqtt_last_retained_sha256";
    if db.settings_repo.get(key).ok().flatten().as_deref() == Some(digest.as_str()) {
        return false;
    }
    let _ = db.settings_repo.set(key, &digest);
    true
}
