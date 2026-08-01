using System;
using System.Runtime.InteropServices;

// 参考 desktop-sticky-todo (MIT) 的实现：
// 1) 给 Progman 发两次 0x052C (wParam=0xD)，生成 WorkerW 壁纸层
// 2) 找到包含 SHELLDLL_DefView(图标层) 的窗口，取它后面紧邻的 WorkerW(=壁纸层，图标之下)
// 3) SetParent 挂进去 → 挂件位于壁纸之上、桌面图标之下
class WallpaperEmbed {
    [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", SetLastError=true)]
    static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll", SetLastError=true)]
    static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr wp, IntPtr lp, uint flags, uint timeout, out IntPtr res);
    [DllImport("user32.dll", SetLastError=true)]
    static extern bool SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")]
    static extern int GetWindowLong(IntPtr h, int idx);
    [DllImport("user32.dll")]
    static extern int SetWindowLong(IntPtr h, int idx, int val);

    delegate bool EnumProc(IntPtr h, IntPtr l);
    const uint SMTO_NORMAL = 0x0002;
    const uint WM_SPAWN_WORKER = 0x052C;
    const int GWL_EXSTYLE = -20;
    const int WS_EX_TOOLWINDOW = 0x00000080;
    const int SW_SHOW = 5;
    static IntPtr foundWorker = IntPtr.Zero;

    static bool EnumProcHandler(IntPtr h, IntPtr l) {
        IntPtr def = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (def != IntPtr.Zero) {
            // 取图标层窗口后面紧邻的 WorkerW
            IntPtr worker = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
            if (worker != IntPtr.Zero) { foundWorker = worker; return false; }
        }
        return true;
    }

    static void Main(string[] args) {
        if (args.Length < 1) { Console.WriteLine("usage: WallpaperEmbed.exe <hwnd>"); return; }
        long val;
        if (!long.TryParse(args[0], out val)) { Console.WriteLine("bad hwnd"); return; }
        IntPtr hwnd = new IntPtr(val);

        IntPtr progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) { Console.WriteLine("Progman not found"); return; }
        IntPtr res;
        SendMessageTimeout(progman, WM_SPAWN_WORKER, (IntPtr)0xD, IntPtr.Zero, SMTO_NORMAL, 1000, out res);
        SendMessageTimeout(progman, WM_SPAWN_WORKER, (IntPtr)0xD, (IntPtr)1, SMTO_NORMAL, 1000, out res);

        EnumWindows(EnumProcHandler, IntPtr.Zero);
        if (foundWorker == IntPtr.Zero) {
            foundWorker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null); // 兜底
        }
        if (foundWorker == IntPtr.Zero) { Console.WriteLine("no worker found"); return; }

        SetParent(hwnd, foundWorker);
        int ex = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW);
        ShowWindow(hwnd, SW_SHOW);
        Console.WriteLine("embedded into workerw=" + foundWorker.ToInt64());
    }
}