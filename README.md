<div align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="AuraClip 图标">

  # AuraClip · 极光剪贴板

  Windows 剪贴板历史与常用短语工具，可接收手机短信验证码。
</div>

---

## 功能

- **剪贴板历史**：记录文本、图片、文件和路径，支持搜索、类型筛选、置顶和标签。
- **常用短语**：独立保存常用文本，支持标签、置顶和排序；清空剪贴板历史不会影响短语。
- **快速粘贴**：点击记录或短语后复制、关闭窗口并粘贴回之前的应用；支持顺序粘贴和纯文本粘贴。
- **隐私**：数据库中的敏感内容本地加密；手机号、邮箱、密钥等可在列表中模糊显示。
- **短信验证码同步**：手机端 SmsForwarder 通过 TLS 发到自建 Mosquitto，AuraClip 订阅后写入剪贴板并弹出通知。
- **复制提示音**：复制时播放短提示音，可调音量或关闭；粘贴静音。
- **迁移**：可从 Ditto 导入历史；可用密码导出、导入文本历史。

## 默认快捷键

| 快捷键 | 作用 |
|---|---|
| `Alt+V` | 打开剪贴板 / 隐藏窗口 |
| `Alt+C` | 打开常用短语 |
| `Alt+Shift+S` | 顺序粘贴下一条（开启顺序粘贴后） |
| `Alt+Shift+V` | 纯文本粘贴 |
| `Alt+F` | 搜索 |

所有快捷键都可在设置里修改。

## 开发与构建

只支持 Windows 10/11 x64。需要 Node.js 24+、pnpm、Rust stable MSVC、Visual Studio 2022 C++ Build Tools 和 WebView2。

```powershell
pnpm install
pnpm tauri:dev      # 开发
pnpm preflight      # lint、单测、类型检查、构建、Rust 测试
pnpm run deploy     # 发布构建并安装到 D:\!SOFTWARE\AuraClip
```

用 Cargo 直接构建发布版时必须加 `--features tauri/custom-protocol`，否则程序会去请求开发服务器 `localhost:1420`。

用户数据位于 `%APPDATA%\com.auraclip.clipboard\`，与源码分开。维护说明见 [AGENTS.md](AGENTS.md)。

## 来源与许可

AuraClip 基于 [TieZ Clipboard](https://github.com/jimuzhe/tiez-clipboard) 二次开发，感谢原项目及其贡献者。本项目遵循 [GPL-3.0 许可证](LICENSE)。
