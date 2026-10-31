# keep_screen_awake.ps1
# 盛隆瓦斯主機防休眠與螢幕恆亮常駐守護程序
# 透過 Windows 底層 Kernel32 SetThreadExecutionState 強制保持螢幕不關閉、系統不進入休眠，確保背景程式 24 小時穩定執行

$ErrorActionPreference = 'SilentlyContinue'

$code = @'
using System;
using System.Runtime.InteropServices;

public static class KeepAwakeNative {
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);

    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;
    public const uint ES_DISPLAY_REQUIRED = 0x00000002;
    public const uint ES_AWAYMODE_REQUIRED = 0x00000040;

    public static void KeepAlive() {
        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED | ES_AWAYMODE_REQUIRED);
    }
}
'@

Add-Type -TypeDefinition $code -Language CSharp

while ($true) {
    [KeepAwakeNative]::KeepAlive()
    Start-Sleep -Seconds 30
}
