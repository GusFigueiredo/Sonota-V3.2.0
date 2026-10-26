#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{RunEvent, WebviewUrl};
use url::Url;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SONOTA_PORT: u16 = 31727;

fn executable_root() -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(custom) = env::var("SONOTA_INSTALL_ROOT") {
        return Ok(PathBuf::from(custom));
    }
    let exe = env::current_exe()?;
    let parent = exe.parent().ok_or("Não foi possível localizar a pasta do Sonota.")?;
    Ok(parent.to_path_buf())
}

fn local_data_dir(root: &Path) -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.to_path_buf())
        .join("Sonota")
        .join("data")
}

fn health_check(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(700)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));
    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.contains("200 OK") && response.contains("\"status\":\"ok\"")
}


fn ollama_health_check() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 11434));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(700)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(900)));
    let request = "GET /api/tags HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() { return false; }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() { return false; }
    response.contains("200 OK")
}

fn find_ollama_exe(root: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.push(root.join("runtime").join("ollama").join("ollama.exe"));
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join("Programs").join("Ollama").join("ollama.exe"));
    }
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("Ollama").join("ollama.exe"));
    }
    if let Some(path) = env::var_os("PATH") {
        for dir in env::split_paths(&path) { candidates.push(dir.join("ollama.exe")); }
    }
    candidates.into_iter().find(|p| p.exists())
}

fn ensure_ollama_server(root: &Path) {
    if ollama_health_check() { return; }
    let Some(ollama) = find_ollama_exe(root) else { return; };

    let log_dir = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.to_path_buf())
        .join("Sonota")
        .join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("ollama-runtime.log");
    let stdout_log = std::fs::OpenOptions::new().create(true).append(true).open(&log_path).ok();
    let stderr_log = stdout_log.as_ref().and_then(|f| f.try_clone().ok());

    let model_dir = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.to_path_buf())
        .join("Sonota")
        .join("models")
        .join("ollama");
    let _ = std::fs::create_dir_all(&model_dir);

    let mut command = Command::new(ollama);
    command.arg("serve").env("OLLAMA_MODELS", &model_dir).stdin(Stdio::null());
    if let Some(out) = stdout_log { command.stdout(Stdio::from(out)); } else { command.stdout(Stdio::null()); }
    if let Some(err) = stderr_log { command.stderr(Stdio::from(err)); } else { command.stderr(Stdio::null()); }
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let _ = command.spawn();

    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(15) {
        if ollama_health_check() { return; }
        thread::sleep(Duration::from_millis(500));
    }
}

fn wait_for_backend(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if health_check(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn spawn_backend(root: &Path) -> Result<Child, Box<dyn std::error::Error>> {
    let app_dir = root.join("app");
    let node = root.join("runtime").join("node.exe");
    let server = app_dir.join("src").join("server.js");

    if !node.exists() {
        return Err(format!("Runtime Node do Sonota não encontrado: {}", node.display()).into());
    }
    if !server.exists() {
        return Err(format!("Backend do Sonota não encontrado: {}", server.display()).into());
    }

    let data_dir = local_data_dir(root);
    std::fs::create_dir_all(&data_dir)?;

    let log_dir = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.to_path_buf())
        .join("Sonota")
        .join("logs");
    std::fs::create_dir_all(&log_dir)?;
    let backend_log = log_dir.join("backend.log");
    let stdout_log = std::fs::OpenOptions::new().create(true).append(true).open(&backend_log)?;
    let stderr_log = stdout_log.try_clone()?;

    let mut command = Command::new(node);
    command
        .arg("--env-file-if-exists=.env")
        .arg(server)
        .current_dir(&app_dir)
        .env("PORT", SONOTA_PORT.to_string())
        .env("HOST", "127.0.0.1")
        .env("DATA_DIR", &data_dir)
        .env("APP_ORIGINS", format!("http://localhost:{SONOTA_PORT},http://127.0.0.1:{SONOTA_PORT}"))
        .env("COOKIE_SECURE", "false")
        .env("SONOTA_DESKTOP", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log));

    // Se o ambiente Python de áudio existe, o backend SEMPRE tenta detectar as
    // capacidades reais. O arquivo audio-status.json é apenas diagnóstico do
    // instalador; ele não bloqueia mais o Laboratório inteiro quando um autoteste
    // opcional falha. Assim a interface consegue mostrar o erro exato de cada
    // recurso (Demucs, Basic Pitch, MusicXML etc.) e também permite reparo.
    let audio_python = root.join("runtime").join("python310").join("python.exe");
    let audio_status = root.join("runtime").join("audio-status.json");
    if audio_python.exists() {
        command
            .env("AUDIO_ENABLED", "true")
            .env("AUDIO_PYTHON", &audio_python)
            .env("AUDIO_STATUS_FILE", &audio_status);
    } else {
        command
            .env("AUDIO_ENABLED", "false")
            .env("AUDIO_STATUS_FILE", &audio_status);
    }
    let ffmpeg_dir = root.join("runtime").join("ffmpeg");
    if ffmpeg_dir.exists() {
        let current_path = env::var_os("PATH").unwrap_or_default();
        let paths = std::iter::once(ffmpeg_dir).chain(env::split_paths(&current_path));
        if let Ok(joined) = env::join_paths(paths) {
            command.env("PATH", joined);
        }
    }

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    Ok(command.spawn()?)
}

fn stop_backend(backend: &Arc<Mutex<Option<Child>>>) {
    if let Ok(mut guard) = backend.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
}

fn main() {
    let backend: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let backend_for_setup = Arc::clone(&backend);

    let app = tauri::Builder::default()
        .setup(move |app| {
            let root = executable_root()?;

            // Mostra imediatamente uma janela local, antes de aguardar Python,
            // Ollama ou a API. Assim o usuário não encara uma tela preta.
            let startup_window = tauri::WebviewWindowBuilder::new(
                app, "main", WebviewUrl::App("index.html".into())
            )
                .title("Sonota")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 620.0)
                .resizable(true)
                .center()
                .build()?;

            let backend_for_thread = Arc::clone(&backend_for_setup);
            // Esperas bloqueantes ficam numa thread, para a janela continuar animada.
            thread::spawn(move || {
                let startup_result = (|| -> Result<Url, Box<dyn std::error::Error>> {
                    // Se o Ollama estiver ausente, o Sonota ainda inicia e oferece reparo.
                    ensure_ollama_server(&root);

                    if !health_check(SONOTA_PORT) {
                        let child = spawn_backend(&root)?;
                        *backend_for_thread
                            .lock()
                            .map_err(|_| "Falha ao registrar o processo do backend.")? = Some(child);
                    }
                    if !wait_for_backend(SONOTA_PORT, Duration::from_secs(25)) {
                        stop_backend(&backend_for_thread);
                        return Err("O backend do Sonota não iniciou corretamente.".into());
                    }
                    Ok(Url::parse(&format!("http://127.0.0.1:{SONOTA_PORT}/app/"))?)
                })();

                match startup_result {
                    Ok(url) => {
                        let navigate_window = startup_window.clone();
                        if let Err(error) = startup_window.run_on_main_thread(move || {
                            if let Err(error) = navigate_window.navigate(url) {
                                eprintln!("[sonota-desktop] Navegação: {error}");
                            }
                        }) {
                            eprintln!("[sonota-desktop] Janela: {error}");
                        }
                    }
                    Err(error) => {
                        eprintln!("[sonota-desktop] Inicialização: {error}");
                        let show_error = startup_window.clone();
                        let _ = startup_window.run_on_main_thread(move || {
                            let _ = show_error.eval(
                                "document.getElementById('loading-status').textContent='Não foi possível iniciar o Sonota. Feche e abra novamente.'; document.getElementById('loading-status').classList.add('error');"
                            );
                        });
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Falha ao inicializar o Sonota Desktop.");

    app.run(move |_app_handle, event| {
        if matches!(event, RunEvent::Exit) {
            stop_backend(&backend);
        }
    });
}
