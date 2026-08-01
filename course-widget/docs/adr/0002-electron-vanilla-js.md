# 技术栈：Electron + 原生 JS（无打包器/无构建步骤）

本机只有 Node.js 24（无 Rust/MSVC/.NET SDK），需求是快速可用的 Windows 桌面小工具，因此选择 Electron + 原生 HTML/CSS/JS（ES modules，renderer 直接加载文件，无 Vite/webpack）。前端暂不引入框架，避免构建链与依赖膨胀。

- **Considered Options**：Tauri 2 + Rust（更省内存但需装 Rust+MSVC，约数 GB 且首次编译慢，否决）；WinUI/C#（无 .NET SDK，否决）；Python/PyQt（打包与界面打磨成本高，否决）。
- **Consequences**：运行时内存约 150-250MB；若未来追求更轻量，前端代码可复用迁移到 Tauri。