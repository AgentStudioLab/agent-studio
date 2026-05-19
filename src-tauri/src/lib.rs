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

fn spawn_sidecar(app: &AppHandle) -> Result<SidecarInfo, Box<dyn std::error::Error>> {
    let port = portpicker::pick_unused_port().ok_or("no free port")?;
    let token = Alphanumeric.sample_string(&mut rand::rng(), 32);

    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;
    let db_path = app_data.join("agent-studio.db");

    let api_key: Option<String> = {
        let store = app.store("settings.json")?;
        store.get("anthropic_api_key").and_then(|v| v.as_str().map(String::from))
    };

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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(SidecarChild::default())
        .invoke_handler(tauri::generate_handler![get_sidecar_info])
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
