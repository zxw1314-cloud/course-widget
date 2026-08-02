# 桌面课表备忘录 (course-widget)

Electron 开发的 Windows 桌面小工具：**每周课表 + 上课/待办/活动提醒 + 半透明桌面挂件**。本地存储、无需账号、开源（MIT 思路，个人项目）。

## 功能（当前 v3）

- 📅 **14 天双周挂件**：上行=本周 7 天（显示 课程+待办+活动），下行=下周 7 天（只显示 待办+活动，不重复课表）；今天的格子高亮
- 🎨 **颜色约定**：课程=白字（可自定义**课程颜色**与**教师**）、待办=黄字（带 ⏰ 截止时间）、临时活动=红字；每格按时间从上到下排、不限制条数
- 👆 **点日期编辑**：点击任意日期 → 弹出"当日窗口"，查看课程/待办/活动，直接添加、勾选完成、删除
- 🔔 **多次提醒**：课程/待办/活动都支持 **多个提醒点**（如提前 10、60 分钟各提醒一次）+ **周期重复提醒**（截止前 X 分钟起每 Y 分钟提醒一次），到点弹 Windows 系统通知
- 🛎 **上下课铃声**：到上课/下课时间播放合成铃声（校园电铃 / 音乐钟声 / 叮咚等，纯 WebAudio 合成、无需音频文件），设置里可试听与调音量；仅在有课的节次触发
- ⏭ **当前课 / 下节课**：挂件头部实时显示「现在在上什么课」或「下节课还有几分钟」，当前课程高亮
- 🎯 **倒数日**：设置中添加考试、假期等目标日期，挂件显示最近 3 个「还有 N 天」
- 🪟 **挂件形态**：自由摆放 + 手动缩放（左上角 ⠿ 手柄拖动、四边四角缩放，位置/大小持久化）；每个日期格右上角 **+** 按钮打开当日窗口；**除 14 个加号、移动/缩放手柄、右上角按钮外全部鼠标穿透**，不挡桌面图标点击；设置里可一键"贴到右下角/右上角"
- 🧩 **托盘常驻**：打开设置 / 显示隐藏挂件 / 立即检查提醒 / 开机自启 / 退出
- 💾 **本地存储**：`%APPDATA%\course-widget\data.json`（明文 JSON，支持导出/导入备份，可手动复制备份）
- 单实例（重复启动会聚焦已有实例）；桌面快捷方式「桌面课表备忘录.lnk」

## 运行

```powershell
cd course-widget
npm start
```
或双击桌面快捷方式「桌面课表备忘录.lnk」（应用不在跑则启动，在跑则打开设置窗口）。

首次打开设置窗口；录入课表/待办/活动后点「保存并应用到桌面」，挂件出现在右下角（之后可用左上角 ⠿ 手柄随意拖动）。之后启动直接恢复挂件，设置窗口通过托盘或挂件 ⚙ 找回。

## 数据模型（data.json）

```jsonc
{
  "settings": { "firstRun", "widgetApplied", "remindMinutes", "semesterStart", "widgetWidth", "widgetHeight", "widgetX", "widgetY", "widgetCorner"(legacy), "clickThrough", "autostart", ... },
  "periods":   [ { "index", "start": "08:00", "end": "08:45" }, ... ],      // 节次时间表
  "courses":   [ { "id", "name", "day": 1-7, "period", "weeks": []|null, "location", "teacher", "color": "#xxxxxx"|null, "reminders": { "points": [10,60], "repeat": { "start": 30, "every": 10 } | null } } ],
  "todos":     { "YYYY-MM-DD": [ { "id", "text", "deadline": "HH:MM"|null, "done", "reminders": {...} } ] },
  "events":    [ { "id", "title", "date", "time": "HH:MM"|null, "reminders": {...} } ],
  "countdowns": [ { "id", "title", "date": "YYYY-MM-DD", "color": "#xxxxxx"|null } ]
}
```

- `reminders.points`：提前 N 分钟各提醒一次（数组）；`reminders.repeat`：周期重复提醒（可空）
- 旧格式（`remindMinutes` 单一提前量）会自动迁移
- 提醒只在"当天有具体时间"的项上生效；待办无截止时间则无提醒

## 项目结构

```
course-widget/
├── main.js                 # Electron 主进程：窗口/托盘/提醒循环/存储 IPC/单实例
├── preload.js              # contextBridge 安全桥接（window.api.*）
├── helper/WallpaperEmbed.* # C# 壁纸嵌入助手（当前未启用，见 docs/adr/0001）
├── renderer/setup.html|js  # 设置窗口：课表/待办/活动/设置
├── renderer/widget.html|js # 14 天桌面挂件（含选择性点击穿透）
├── renderer/popup.html|js  # 当日窗口（可拖动）
├── renderer/chime.js       # 纯 WebAudio 合成铃声/提示音（上下课铃声）
├── assets/icon.png         # 托盘/窗口图标
├── CONTEXT.md              # 领域词汇表
└── docs/adr/               # 架构决策记录
```

## 关键决策（详见 docs/adr/）

| 决策 | 摘要 |
|---|---|
| ADR-0001 | 挂件**不嵌入壁纸层**：Windows 图标层会吞鼠标事件，嵌入后挂件无法点击；改为固定角落 + 空白处鼠标穿透 |
| ADR-0002 | Electron + 原生 JS（无打包器/无构建步骤），本机无 Rust/MSVC，优先快速可用 |
| ADR-0003 | 统一 `reminders` 模型：多个提醒点 + 周期重复提醒 |
| ADR-0004 | 本地 JSON 明文存储；userData 固定为 ASCII 路径 `%APPDATA%\course-widget`（避免中文 productName 路径问题） |

## 当前状态 / 交接

- ✅ 已实现：14 天双周挂件、三色事项（课程可自定义颜色/教师）、当日窗口编辑、多次提醒、上下课铃声、当前课/下节课状态、倒数日、托盘、开机自启、导出/导入、单实例、选择性点击穿透
- ⚠️ 已知取舍：挂件是"固定角落的普通窗口"，不是"贴进壁纸图层"（原因见 ADR-0001）
- 🚧 可能的下一步：electron-builder 打包独立 exe；农历/节假日自动显示（当前倒数日需手动添加）；课程也支持周期重复提醒的界面简化；挂件内直接快速添加事项
- 数据位置：`%APPDATA%\course-widget\data.json`；运行日志相关见 main.js 的 console 输出

## 开发

```powershell
npm install          # 首次（国内建议 npm_config_registry=https://registry.npmmirror.com, ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm start
```
壁纸嵌入助手如需重新编译：`npm run helper:build`（需要 .NET Framework csc，Windows 自带）。