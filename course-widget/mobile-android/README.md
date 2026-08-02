# mobile-android · 手机端 APK（WebView 壳）

Android WebView 套壳，加载电脑端「手机远程桥」提供的同一套网页（见 docs/adr/0007）。
- 打开 App → 输入电脑地址（同网：`http://<电脑IP>:8723/`；樱花frp：`http://<公网映射地址>:<端口>/`）→ 连接
- 首次连接后在页面里粘贴电脑设置的**访问令牌**（页面会记住）
- 离线时新增的待办会进入待发送队列，连上自动补发

## 构建 APK（需 Android Studio）
1. 用 Android Studio 打开本目录
2. Build → Build APK(s)
3. 产物：`app/build/outputs/apk/debug/app-debug.apk`，私发给安卓手机安装（需允许"未知来源"）

> 说明：网页套壳，代码量很小；以后要系统通知/闹钟再升级为原生实现（见 ADR-0007 愿望清单）。
