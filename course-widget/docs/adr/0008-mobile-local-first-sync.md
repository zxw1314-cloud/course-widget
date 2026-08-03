# 手机端改为本地优先：本地课表 + 手动同步/上传（含樱花 HTTPS 处理）

- 状态：已实施（2026-08-03）
- 相关：ADR-0007（手机远程桥）、ADR-0004（本地 JSON 存储）

## Context
v0.2.1 的 APK 是 WebView 套壳加载电脑端网页：PC 不在线就打不开页面、也看不到课表；同时樱花frp 隧道强制"自动 HTTPS"，用 http:// 访问会返回 501 重定向页，跳 https 后证书不受信（免费隧道 IP:端口 与节点证书不匹配）导致 WebView 一直卡住。用户提出新模型：手机本地保存一套课表，连上电脑后手动同步/上传，上传失败保留队列、连上自动补发。

## Decision
1. **本地优先**：APK 改为加载内置页面（`assets/mobile.html`），课表快照、上传队列、服务器地址/令牌全部存 WebView localStorage，**断网也能打开看今日/本周课表**。
2. **API 扩展（电脑端）**：
   - 新增 `GET /api/schedule`（token 鉴权）→ 全量快照：日期/周次/作息表/课程简写/课程/活动/倒数日/全部待办。
   - 手机桥所有响应加 CORS 头（`Access-Control-Allow-Origin: *` 等）+ 处理 `OPTIONS` 预检——内置页面是 `file://` 源，跨域调电脑必须放行。
   - 原有 `/api/today`、`/api/todo`、`/api/health` 不变（网页/PWA 在线模式继续用）；新增 `POST /api/event`（手机新增临时活动：title 必填，date/time/location/points 可选）。
3. **同步语义**：「同步到手机」= 拉取 `/api/schedule` 全量覆盖本地课程/活动/倒数日；待办与本地"未上传项"按 (text+deadline) 合并去重，不丢已加未传的。手机端仍只增不改不删（沿用 ADR-0007）。
4. **上传与离线队列**：新增待办/临时活动先写本地快照 + 进上传队列，尝试立即 POST `/api/todo` 或 `/api/event`；失败保留，进 App / 每 20 秒自动补发 / 手动上传（支持单个或全部）。
5. **樱花 HTTPS**：页面 fetch 检测到 HTTP 501（樱花强制 HTTPS 重定向页）自动换 https 重试一次；WebView `onReceivedSslError → handler.proceed()` 放行不受信证书（个人工具 + 随机 token 的既定取舍，不做证书 pinning）。
6. **网页/PWA 模式保持在线现状**，不做本地化。

## Consequences
- APK 不再需要地址栏：`MainActivity` 直接加载内置页，服务器地址移到页面「设置」tab。
- 手机可离线查看课表、离线新增待办；连接质量差时也不丢数据。
- 服务端多一个只读全量接口 + CORS，暴露面仍是 8723 + token。
- 局限：本地快照的周次以最后一次同步为准（离线跨周不自动更新）；证书全放行仅限手机壳。