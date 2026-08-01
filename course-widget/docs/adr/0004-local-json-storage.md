# 数据存储：本地 JSON 明文 + 固定 ASCII userData 路径

所有数据（设置/课表/待办/活动）存为 `%APPDATA%\course-widget\data.json` 明文 JSON，原子写入（临时文件 + rename）。选择明文 JSON 而非 SQLite，是为了零原生依赖（本机无编译工具链）且便于用户手动备份/编辑。userData 用 `app.setPath('userData', .../course-widget)` 固定为 ASCII 路径，避免 `productName` 含中文导致路径/兼容问题（曾实测复现中文 userData 目录导致数据读取失败）。JSON.parse 前剥离 UTF-8 BOM，防止带 BOM 的编辑文件导致解析失败。

- **Considered Options**：SQLite（需原生模块/编译，否决）；云同步（需求明确不需要，否决）。