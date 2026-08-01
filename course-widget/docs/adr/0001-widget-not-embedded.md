# 挂件不嵌入壁纸层：固定角落 + 空白区域鼠标穿透

Windows 桌面图标层（SHELLDLL_DefView）会截获其上方区域的所有鼠标事件，因此把挂件嵌入"壁纸之上、图标之下"的 WorkerW 层后，挂件完全无法点击（实测复现）。我们决定放弃壁纸嵌入，让挂件保持普通顶层窗口并固定在屏幕角落（右下/右上），同时用选择性鼠标穿透（`setIgnoreMouseEvents(true, {forward:true})` + mousemove 判定目标）让空白区域不挡桌面、日期格与按钮保留交互。

- **Considered Options**：① WorkerW 嵌入（图标之下，无法点击，已否决）；② Electron `alwaysOnTop('desktop')`（实际落在最顶层，否决）；③ 固定角落普通窗口 + 空白穿透（采用）。
- **Consequences**：挂件不是"贴进壁纸"的视觉效果，而是角落里的半透明窗口；其它窗口最大化时可能盖住它。`helper/WallpaperEmbed.*` 保留但未调用。