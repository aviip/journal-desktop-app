import { BrowserWindow, app, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function createMainWindow() {
  const appDir = path.dirname(fileURLToPath(import.meta.url));
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#0b0d10",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(appDir, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist-react/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.setFullScreen(true);
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("journal:fullscreen-changed", true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("journal:fullscreen-changed", false);
  });
}

app.whenReady().then(() => {
  ipcMain.handle("journal:toggle-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle("journal:set-fullscreen", (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setFullScreen(Boolean(value));
    return win.isFullScreen();
  });

  ipcMain.handle("journal:is-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle(
    "journal:export-to-file",
    async (
      event,
      payload: { suggestedName: string; content: string; filters?: Electron.FileFilter[] },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false as const, error: "No active window" };

      const result = await dialog.showSaveDialog(win, {
        title: "Export",
        defaultPath: payload.suggestedName,
        filters: payload.filters,
      });

      if (result.canceled || !result.filePath) {
        return { ok: false as const, error: "canceled" };
      }

      await fs.writeFile(result.filePath, payload.content, "utf8");
      return { ok: true as const, filePath: result.filePath };
    },
  );

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
