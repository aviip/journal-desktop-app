export {};

declare global {
  interface Window {
    journal?: {
      toggleFullscreen: () => Promise<boolean>;
      setFullscreen: (value: boolean) => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      onFullscreenChanged: (handler: (value: boolean) => void) => () => void;
      exportToFile: (payload: {
        suggestedName: string;
        content: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{ ok: true; filePath: string } | { ok: false; error: string }>;
    };
  }
}
