# 桌面课表备忘录 (course-widget)

Electron 写的 Windows 桌面小工具：**每周课表 + 上课提醒 + 临时活动 + 半透明壁纸挂件**。

## 功能
- 📅 **周课表**：设置窗口网格编辑（周几 × 第几节），支持地点、周次过滤（如"1-16 周"或"1,3,5"）、每门课单独的提前提醒分钟数
- 🔔 **上课提醒**：课前 N 分钟弹 Windows 系统通知（默认提前 10 分钟，可改）
- 🗓 **临时活动**：按日期添加一次性活动（可设时间、提醒），到点通知
- 🖼 **壁纸挂件**：半透明毛玻璃，通过 Win32 WorkerW 技巧嵌入桌面壁纸层（最下层，不影响其它软件/桌面图标）；显示今日课表 + 本周日期条
- 👆 **点日期加待办**：点击挂件上的日期 → 弹出当日窗口，查看课程/活动/待办，直接添加待办
- 🧩 **托盘常驻**：显示/隐藏挂件、开机自启、退出
- 💾 **本地存储**：JSON 文件（%APPDATA%\course-widget\data.json），支持导出/导入备份

## 运行
```powershell
npm start
```
（首次会打开设置窗口；之后开机自动恢复挂件，设置窗口可通过托盘"打开设置"找回）

## 构建壁纸嵌入助手（已内置 exe，无需重复构建）
```powershell
npm run helper:build
```

## 项目结构
- `main.js` — Electron 主进程：窗口/托盘/通知/提醒循环/存储 IPC
- `helper/WallpaperEmbed.exe` — C# 小工具：把挂件窗口 SetParent 到 WorkerW 壁纸层
- `renderer/setup.html|js` — 设置窗口（课表/活动/待办/设置）
- `renderer/widget.html|js` — 壁纸挂件
- `renderer/popup.html|js` — 当日待办弹窗