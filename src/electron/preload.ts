import { contextBridge, ipcRenderer } from "electron";

type Unsubscribe = () => void;

contextBridge.exposeInMainWorld("journal", {
  toggleFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke("journal:toggle-fullscreen"),
  setFullscreen: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke("journal:set-fullscreen", value),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke("journal:is-fullscreen"),
  onFullscreenChanged: (handler: (value: boolean) => void): Unsubscribe => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean) => {
      handler(value);
    };
    ipcRenderer.on("journal:fullscreen-changed", listener);
    return () => {
      ipcRenderer.removeListener("journal:fullscreen-changed", listener);
    };
  },
  exportToFile: (payload: {
    suggestedName: string;
    content: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke("journal:export-to-file", payload),
});
