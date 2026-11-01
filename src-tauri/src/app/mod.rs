pub mod data_dir_migration;
mod edge_geometry;
pub mod commands;
pub mod hooks;
pub mod light_mode;
pub mod setup;
pub mod system;
#[cfg(target_os = "windows")]
pub mod window_fade;
pub mod window_manager;
