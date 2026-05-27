use std::sync::Mutex;

use rand::distr::{Alphanumeric, SampleString};
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tauri_plugin_store::StoreExt;

#[derive(Clone, Serialize)]
pub struct SidecarInfo {
    port: u16,
    token: String,
}

#[derive(Default)]
struct SidecarChild(Mutex<Option<CommandChild>>);

#[tauri::command]
fn get_sidecar_info(state: State<'_, SidecarInfo>) -> SidecarInfo {
    state.inner().clone()
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
        .manage(SidecarChild::default())
        .invoke_handler(tauri::generate_handler![
            get_sidecar_info,
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
