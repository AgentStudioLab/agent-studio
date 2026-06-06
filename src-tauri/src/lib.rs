use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::Mutex,
};

use rand::distr::{Alphanumeric, SampleString};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tauri_plugin_store::StoreExt;

const DESKTOP_AUTH_CALLBACK_PREFIX: &str = "agent-studio://auth/callback";
const LOOPBACK_AUTH_CALLBACK_PATH: &str = "/auth/callback";
const WINDOW_STATE_STORE_KEY: &str = "main_window_state";
const MIN_WINDOW_WIDTH: u32 = 1100;
const MIN_WINDOW_HEIGHT: u32 = 720;

#[derive(Clone, Serialize)]
pub struct SidecarInfo {
    port: u16,
    token: String,
}

#[derive(Default)]
struct SidecarChild(Mutex<Option<CommandChild>>);

#[derive(Default)]
struct PendingAuthCallback(Mutex<Option<String>>);

#[derive(Clone)]
struct DesktopAuthRedirectUri(String);

#[derive(Clone, Serialize, Deserialize)]
pub struct DesktopAuthTokens {
    access_token: String,
    access_token_expires_at: i64,
    refresh_token: String,
    refresh_token_expires_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
struct MainWindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
}

#[tauri::command]
fn get_sidecar_info(state: State<'_, SidecarInfo>) -> SidecarInfo {
    state.inner().clone()
}

#[tauri::command]
async fn get_pending_auth_callback(
    state: State<'_, PendingAuthCallback>,
) -> Result<Option<String>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.take())
}

#[tauri::command]
async fn get_desktop_auth_redirect_uri(
    state: State<'_, DesktopAuthRedirectUri>,
) -> Result<String, String> {
    Ok(state.0.clone())
}

#[tauri::command]
async fn store_desktop_auth(
    app: tauri::AppHandle,
    tokens: DesktopAuthTokens,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(
        "desktop_auth",
        serde_json::to_value(tokens).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_desktop_auth(app: tauri::AppHandle) -> Result<Option<DesktopAuthTokens>, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let Some(value) = store.get("desktop_auth") else {
        return Ok(None);
    };
    serde_json::from_value(value).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_desktop_auth(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.delete("desktop_auth");
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_api_key(
    app: tauri::AppHandle,
    key: String,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    if key.is_empty() {
        store.delete("anthropic_api_key");
    } else {
        store.set("anthropic_api_key", key);
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Clone, Serialize)]
pub struct DefaultApp {
    /// Display name e.g. "Visual Studio Code" (basename of bundle minus .app).
    name: String,
    /// Absolute bundle / executable path e.g. "/Applications/Visual Studio Code.app".
    path: String,
}

/// Resolve the system default application for a given file path.
///
/// macOS: shells out to `osascript` calling `NSWorkspace.URLForApplicationToOpenURL:`
/// (the modern replacement for `LSCopyDefaultApplicationURLForURL`). osascript +
/// AppKit are preinstalled on every macOS — no extra crates or system tools required.
///
/// Other platforms: returns Ok(None). The frontend falls back to a hand-picked
/// label by file type.
#[tauri::command]
async fn get_default_app(path: String) -> Result<Option<DefaultApp>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        if path.is_empty() {
            return Err("path is empty".into());
        }
        // Escape backslashes + double-quotes for safe embedding in an AppleScript
        // string literal. AppleScript doesn't support backtick or heredoc, so
        // escaping is the only path; passing via -e per-line keeps args bounded.
        let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
        let out = Command::new("osascript")
            .args([
                "-e",
                "use framework \"AppKit\"",
                "-e",
                &format!(
                    "set theURL to (current application's NSURL's fileURLWithPath:\"{escaped}\")"
                ),
                "-e",
                "set ws to current application's NSWorkspace's sharedWorkspace",
                "-e",
                "set appURL to (ws's URLForApplicationToOpenURL:theURL)",
                "-e",
                "if appURL is missing value then return \"\"",
                "-e",
                "return appURL's |path|() as text",
            ])
            .output()
            .map_err(|e| format!("osascript spawn failed: {e}"))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(format!("osascript failed: {stderr}"));
        }
        let app_path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if app_path.is_empty() {
            return Ok(None);
        }
        // Bundle basename → "Visual Studio Code.app" → "Visual Studio Code".
        let name = app_path
            .rsplit('/')
            .next()
            .unwrap_or(&app_path)
            .trim_end_matches(".app")
            .to_string();
        Ok(Some(DefaultApp {
            name,
            path: app_path,
        }))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(None)
    }
}

/// Reveal a file in Finder (macOS) / Explorer (Windows).
///
/// macOS: `open -R <path>` selects the item in Finder. This is distinct from
/// `tauri_plugin_shell`'s `open()` which dispatches to the default opener with
/// no `-R`, so the file is opened in its editor rather than revealed.
/// Windows: `explorer /select,<path>` is the equivalent. Not currently wired
/// because project is mac-first; left as a TODO if Windows support arrives.
#[tauri::command]
async fn reveal_in_folder(path: String) -> Result<(), String> {
    if path.is_empty() {
        return Err("path is empty".into());
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let status = Command::new("open")
            .arg("-R")
            .arg(&path)
            .status()
            .map_err(|e| format!("open spawn failed: {e}"))?;
        if !status.success() {
            return Err(format!("open -R exited with {status}"));
        }
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let status = Command::new("explorer")
            .arg(format!("/select,{path}"))
            .status()
            .map_err(|e| format!("explorer spawn failed: {e}"))?;
        if !status.success() {
            return Err(format!("explorer exited with {status}"));
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("reveal_in_folder unsupported on this platform".into())
    }
}

fn spawn_sidecar(app: &AppHandle) -> Result<SidecarInfo, Box<dyn std::error::Error>> {
    let port = portpicker::pick_unused_port().ok_or("no free port")?;
    let token = Alphanumeric.sample_string(&mut rand::rng(), 32);

    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;
    let db_path = app_data.join("agent-studio.db");

    // API key 优先级：Settings UI (plugin-store) > .env / OS env。
    let api_key_from_store: Option<String> = {
        let store = app.store("settings.json")?;
        store.get("anthropic_api_key").and_then(|v| v.as_str().map(String::from))
    };
    let api_key = api_key_from_store.or_else(|| std::env::var("ANTHROPIC_API_KEY").ok());

    let mut cmd = app
        .shell()
        .sidecar("agent-studio-sidecar")?
        .args([
            format!("--port={port}"),
            format!("--token={token}"),
            format!("--db={}", db_path.display()),
        ]);
    if let Some(k) = api_key {
        cmd = cmd.env("ANTHROPIC_API_KEY", k);
    }
    // Forward third-party Anthropic-protocol endpoints (e.g. DeepSeek's /anthropic).
    // 从 Tauri 启动时所在 shell 的 env 取——所以 `export ANTHROPIC_BASE_URL=... && pnpm tauri:dev`
    // 这种用法直接 work。生产打包后 .app 不会自动继承用户 shell 的 env，那时再考虑挪到
    // Settings UI（plugin-store 持久化 + 运行时热更）。
    if let Ok(base_url) = std::env::var("ANTHROPIC_BASE_URL") {
        cmd = cmd.env("ANTHROPIC_BASE_URL", base_url);
    }
    if let Ok(model) = std::env::var("ANTHROPIC_MODEL") {
        cmd = cmd.env("ANTHROPIC_MODEL", model);
    }
    // Point sidecar at the bundled `built-in/` plugin directory.
    //
    // In a packaged .app the resolved path is real (`$RESOURCES/built-in`).
    // In `tauri dev` the resolver returns a theoretical path under
    // `src-tauri/target/.../Resources/` that does NOT exist — bundle.resources
    // is only copied at bundle time, not on `dev`. If we set the env to a
    // missing path, sidecar treats it as a production misconfig and refuses
    // to fall back, which would hide all built-in skills in dev. So gate on
    // existence: only set the env when the dir actually exists. With env
    // unset, sidecar walks up from its own source file to find `built-in/`.
    if let Ok(builtin_dir) = app.path().resolve("built-in", tauri::path::BaseDirectory::Resource) {
        if builtin_dir.is_dir() {
            cmd = cmd.env("AGENT_STUDIO_BUILTIN_DIR", builtin_dir);
        }
    }
    let (mut rx, child) = cmd.spawn()?;

    app.state::<SidecarChild>()
        .0
        .lock()
        .unwrap()
        .replace(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    log::info!("[sidecar] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Stderr(bytes) => {
                    log::warn!("[sidecar] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Error(err) => log::error!("[sidecar] {err}"),
                CommandEvent::Terminated(payload) => {
                    log::warn!("[sidecar] terminated: code={:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(SidecarInfo { port, token })
}

fn is_desktop_auth_callback_url(url: &str) -> bool {
    if url.starts_with(DESKTOP_AUTH_CALLBACK_PREFIX) {
        return true;
    }

    let Some(rest) = url.strip_prefix("http://") else {
        return false;
    };
    let Some((authority, path_and_query)) = rest.split_once('/') else {
        return false;
    };
    let Some((host, port)) = authority.rsplit_once(':') else {
        return false;
    };
    let Ok(port) = port.parse::<u16>() else {
        return false;
    };
    let path_and_query = format!("/{path_and_query}");

    (host == "127.0.0.1" || host == "localhost")
        && port > 0
        && (path_and_query == LOOPBACK_AUTH_CALLBACK_PATH
            || path_and_query.starts_with(&format!("{LOOPBACK_AUTH_CALLBACK_PATH}?")))
}

fn set_pending_auth_callback(state: &PendingAuthCallback, url: String) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = Some(url);
    Ok(())
}

fn handle_desktop_auth_callback(app: &AppHandle, url: &str) -> Result<(), String> {
    if !is_desktop_auth_callback_url(url) {
        return Ok(());
    }

    let url = url.to_string();
    set_pending_auth_callback(&app.state::<PendingAuthCallback>(), url.clone())?;
    let _ = app.emit("desktop-auth-callback", url);
    Ok(())
}

fn respond_to_loopback_callback(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn handle_loopback_connection(app: &AppHandle, mut stream: TcpStream, addr: SocketAddr) {
    if !addr.ip().is_loopback() {
        respond_to_loopback_callback(&mut stream, "403 Forbidden", "Forbidden");
        return;
    }

    let mut buffer = [0_u8; 4096];
    let Ok(size) = stream.read(&mut buffer) else {
        return;
    };
    let request = String::from_utf8_lossy(&buffer[..size]);
    let Some(request_line) = request.lines().next() else {
        return;
    };
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "GET" || !target.starts_with("/auth/callback") {
        respond_to_loopback_callback(&mut stream, "404 Not Found", "Not found");
        return;
    }

    let Ok(local_addr) = stream.local_addr() else {
        respond_to_loopback_callback(&mut stream, "500 Internal Server Error", "Server error");
        return;
    };
    let callback_url = format!("http://127.0.0.1:{}{}", local_addr.port(), target);
    if let Err(err) = handle_desktop_auth_callback(app, &callback_url) {
        log::warn!("[auth] failed to handle loopback callback: {err}");
        respond_to_loopback_callback(&mut stream, "500 Internal Server Error", "Server error");
        return;
    }

    respond_to_loopback_callback(
        &mut stream,
        "200 OK",
        "<!doctype html><meta charset=\"utf-8\"><title>Agent Studio</title><body style=\"font-family:system-ui;padding:32px;line-height:1.5\"><h1>登录成功</h1><p>可以回到 Agent Studio 继续使用。</p></body>",
    );
}

fn spawn_desktop_auth_loopback(app: AppHandle) -> Result<DesktopAuthRedirectUri, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let redirect_uri = format!(
        "http://127.0.0.1:{}/auth/callback",
        listener.local_addr().map_err(|e| e.to_string())?.port()
    );

    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            match incoming {
                Ok(stream) => {
                    let Ok(addr) = stream.peer_addr() else {
                        continue;
                    };
                    handle_loopback_connection(&app, stream, addr);
                }
                Err(err) => {
                    log::warn!("[auth] loopback listener failed: {err}");
                    break;
                }
            }
        }
    });

    Ok(DesktopAuthRedirectUri(redirect_uri))
}

fn desktop_auth_redirect_uri(app: AppHandle) -> Result<DesktopAuthRedirectUri, String> {
    if cfg!(debug_assertions) {
        spawn_desktop_auth_loopback(app)
    } else {
        Ok(DesktopAuthRedirectUri(
            DESKTOP_AUTH_CALLBACK_PREFIX.to_string(),
        ))
    }
}

fn save_main_window_state(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let size = window.outer_size().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let state = MainWindowState {
        width: size.width.max(MIN_WINDOW_WIDTH),
        height: size.height.max(MIN_WINDOW_HEIGHT),
        x: position.x,
        y: position.y,
        maximized: window.is_maximized().map_err(|e| e.to_string())?,
    };

    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(
        WINDOW_STATE_STORE_KEY,
        serde_json::to_value(state).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

fn restore_main_window_state(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let Some(value) = store.get(WINDOW_STATE_STORE_KEY) else {
        return Ok(());
    };
    let state: MainWindowState = serde_json::from_value(value).map_err(|e| e.to_string())?;

    window
        .set_size(tauri::PhysicalSize::new(
            state.width.max(MIN_WINDOW_WIDTH),
            state.height.max(MIN_WINDOW_HEIGHT),
        ))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::PhysicalPosition::new(state.x, state.y))
        .map_err(|e| e.to_string())?;

    if state.maximized {
        window.maximize().map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn watch_main_window_state(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let app_handle = app.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) | WindowEvent::Moved(_) | WindowEvent::Destroyed => {
            if let Err(err) = save_main_window_state(&app_handle) {
                log::warn!("[window] failed to save main window state: {err}");
            }
        }
        _ => {}
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 从 repo 根的 .env 加载环境变量（dotenvy 从 CWD 向上搜索）。
    // 仅 dev 路径有意义；打包后的 .app 没有 .env 文件，会静默跳过。
    // 已存在的 OS env 不会被覆盖（dotenvy 默认行为）。
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(SidecarChild::default())
        .manage(PendingAuthCallback::default())
        .invoke_handler(tauri::generate_handler![
            get_sidecar_info,
            get_pending_auth_callback,
            get_desktop_auth_redirect_uri,
            store_desktop_auth,
            get_desktop_auth,
            clear_desktop_auth,
            set_api_key,
            get_default_app,
            reveal_in_folder
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let info = spawn_sidecar(app.handle())?;
            log::info!("[sidecar] spawned on port {}", info.port);
            app.manage(info);

            let redirect_uri = desktop_auth_redirect_uri(app.handle().clone())?;
            log::info!("[auth] desktop redirect uri {}", redirect_uri.0);
            app.manage(redirect_uri);

            if let Err(err) = restore_main_window_state(app.handle()) {
                log::warn!("[window] failed to restore main window state: {err}");
            }
            watch_main_window_state(app.handle());

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Err(err) = handle_desktop_auth_callback(&app_handle, url.as_str()) {
                        log::warn!("[auth] failed to handle desktop callback: {err}");
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<SidecarChild>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_callback_accepts_only_expected_prefix() {
        assert!(is_desktop_auth_callback_url(
            "agent-studio://auth/callback?code=abc&state=xyz"
        ));
        assert!(is_desktop_auth_callback_url(
            "http://127.0.0.1:49152/auth/callback?code=abc&state=xyz"
        ));
        assert!(is_desktop_auth_callback_url(
            "http://localhost:49152/auth/callback?code=abc&state=xyz"
        ));
        assert!(is_desktop_auth_callback_url(
            "agent-studio://auth/callback/extra?code=abc"
        ));

        assert!(!is_desktop_auth_callback_url(
            "agent-studio://other/callback?code=abc"
        ));
        assert!(!is_desktop_auth_callback_url(
            "https://example.com/auth/callback?code=abc"
        ));
    }

    #[test]
    fn desktop_auth_tokens_use_expected_store_shape() {
        let tokens = DesktopAuthTokens {
            access_token: "access".into(),
            access_token_expires_at: 1_717_171_717,
            refresh_token: "refresh".into(),
            refresh_token_expires_at: 1_818_181_818,
        };

        let value = serde_json::to_value(&tokens).unwrap();

        assert_eq!(value["access_token"], "access");
        assert_eq!(value["access_token_expires_at"], 1_717_171_717);
        assert_eq!(value["refresh_token"], "refresh");
        assert_eq!(value["refresh_token_expires_at"], 1_818_181_818);

        let restored: DesktopAuthTokens = serde_json::from_value(value).unwrap();
        assert_eq!(restored.access_token, "access");
        assert_eq!(restored.access_token_expires_at, 1_717_171_717);
        assert_eq!(restored.refresh_token, "refresh");
        assert_eq!(restored.refresh_token_expires_at, 1_818_181_818);
    }
}
