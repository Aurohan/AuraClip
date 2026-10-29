<div align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="AuraClip 图标">

  # AuraClip · 极光剪贴板

  一款用于 Windows 的剪贴板管理与常用短语工具。

  **剪贴板历史 · 常用短语 · 标签管理 · 快速粘贴**
</div>

---

## 功能

- **剪贴板历史**：收集并管理文本、图片、文件和路径等内容，支持搜索、分类和置顶。
- **常用短语**：保存经常使用的文本，通过标签筛选、排序和置顶，方便快速查找。
- **快速粘贴**：点击剪贴板记录或常用短语后，复制内容、关闭窗口并粘贴到之前的应用。
- **标签管理**：分别管理剪贴板记录和常用短语的分类标签。
- **可选同步**：支持配置 WebDAV 同步、局域网互传和 MQTT 短信通知，具体功能取决于设备和服务端配置。
- **桌面体验**：基于 Tauri 的 Windows 桌面应用，提供全局快捷键和窗口外观设置。

## 使用与开发

本仓库维护的是 AuraClip 的源码；当前没有在 GitHub Releases 提供安装包。Windows 开发和构建需要 Node.js、pnpm、Rust stable MSVC、Visual Studio C++ Build Tools 和 WebView2。

```powershell
git clone https://github.com/Aurohan/AuraClip.git
cd AuraClip
pnpm install
pnpm tauri:dev
```

构建应用：

```powershell
pnpm tauri:build
```

应用的数据和配置独立于源码。清理或迁移前请先备份；开启同步后，数据的保护方式取决于所用服务及配置。

## 项目来源与许可

AuraClip 基于 [TieZ Clipboard](https://github.com/jimuzhe/tiez-clipboard) 二次开发，感谢原项目及其贡献者。项目遵循 [GPL-3.0 许可证](LICENSE)。
