/**
 * 通过临时 .exe 程序调用 Win32 SetWindowPos(HWND_TOPMOST)
 * 实现真正的系统级置顶。
 *
 * 原理：
 * 1. 获取 BrowserWindow 的 HWND
 * 2. 调用一个预编译好的小 exe 来执行 SetWindowPos
 *
 * 但由于编译依赖问题，这里改用写临时 .ps1 文件再执行的方式。
 */

const { exec } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

// HWND 常量
const SWP_FLAGS = 0x0002 | 0x0001 | 0x0010 | 0x4000 // NOMOVE | NOSIZE | NOACTIVATE | ASYNCWINDOWPOS

/**
 * 设置窗口为系统级置顶
 */
function setWindowTopMost(browserWindow, topmost = true) {
  return new Promise((resolve) => {
    if (!browserWindow || browserWindow.isDestroyed()) {
      return resolve(false)
    }

    try {
      const hwnd = browserWindow.getNativeWindowHandle()
      if (!hwnd || hwnd.length === 0) {
        return resolve(false)
      }

      // Buffer 是小端序，读取 HWND
      const hwndInt = hwnd.readUInt32LE(0)
      const hWndInsertAfter = topmost ? -1 : -2

      // 把脚本写入临时文件，避免命令行转义问题
      const tmpDir = os.tmpdir()
      const tmpFile = path.join(tmpDir, `mascot-topmost-${Date.now()}.ps1`)
      const script = `[DllImport("user32.dll", SetLastError = true)]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
`
      const psScript = `
Add-Type -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true)]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
'@ -Name "Win32SetWindowPos" -Namespace "Win32" -ErrorAction SilentlyContinue
[Win32.Win32SetWindowPos]::SetWindowPos([IntPtr]${hwndInt}, [IntPtr]${hWndInsertAfter}, 0, 0, 0, 0, ${SWP_FLAGS})
`

      fs.writeFileSync(tmpFile, psScript, 'utf-8')

      exec(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
        { timeout: 5000, windowsHide: true },
        (error) => {
          // 清理临时文件
          try { fs.unlinkSync(tmpFile) } catch {}
          if (error) {
            console.error('[setWindowTopMost] PowerShell error:', error.message)
            return resolve(false)
          }
          resolve(true)
        }
      )
    } catch (err) {
      console.error('[setWindowTopMost] Exception:', err.message)
      resolve(false)
    }
  })
}

module.exports = { setWindowTopMost }
