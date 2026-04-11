import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  createEntry,
  getActiveEntry,
  loadJournalState,
  saveJournalState,
  upsertEntry,
  type JournalEntry,
} from "./lib/journalStore";
import { createExportOrder, verifyPayment } from "./lib/paymentsClient";
import { openRazorpayCheckout } from "./lib/razorpay";

type SaveStatus = "saved" | "saving" | "error";
type PayStatus = "idle" | "starting" | "verifying" | "error";

const PLACEHOLDERS = [
  "Begin writing…",
  "Start typing…",
  "What’s on your mind?",
  "One sentence is enough.",
  "Pick a thought and go.",
];

function formatDay(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function preview(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (!singleLine) return "Empty entry";
  return singleLine.length > 44 ? `${singleLine.slice(0, 44)}…` : singleLine;
}

const EXPORT_UNLOCK_KEY = "journal.exportsUnlocked.v1";

function fileSafeDate(timestampMs: number): string {
  const d = new Date(timestampMs);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function downloadFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [state, setState] = useState(() => loadJournalState());
  const activeEntry = useMemo(() => getActiveEntry(state), [state]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [showChrome, setShowChrome] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean | null>(null);
  const [exportsUnlocked, setExportsUnlocked] = useState(() => {
    try {
      return localStorage.getItem(EXPORT_UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [payStatus, setPayStatus] = useState<PayStatus>("idle");
  const [payError, setPayError] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const chromeTimeoutRef = useRef<number | null>(null);

  const placeholder = useMemo(
    () => PLACEHOLDERS[activeEntry.id.charCodeAt(0) % PLACEHOLDERS.length],
    [activeEntry.id],
  );

  const entries = useMemo(() => state.entries, [state.entries]);

  const setChromeTemporarily = useCallback(() => {
    setShowChrome(true);
    if (chromeTimeoutRef.current) window.clearTimeout(chromeTimeoutRef.current);
    chromeTimeoutRef.current = window.setTimeout(() => setShowChrome(false), 1500);
  }, []);

  const newEntry = useCallback(() => {
    setState((prev) => {
      const existingEmpty = prev.entries.find((e) => !e.text.trim());
      if (existingEmpty) {
        return { ...prev, activeId: existingEmpty.id };
      }

      const now = Date.now();
      const entry = createEntry(now);
      setSaveStatus("saving");
      return { entries: [entry, ...prev.entries], activeId: entry.id };
    });
    setSidebarOpen(false);
    setChromeTemporarily();
  }, [setChromeTemporarily]);

  const selectEntry = useCallback(
    (id: string) => {
      setState((prev) => ({ ...prev, activeId: id }));
      setSidebarOpen(false);
      setChromeTemporarily();
    },
    [setChromeTemporarily],
  );

  const onChangeText = useCallback((value: string) => {
    setSaveStatus("saving");
    const now = Date.now();
    setState((prev) => {
      const current =
        prev.entries.find((e) => e.id === prev.activeId) ?? createEntry(now);
      const updated: JournalEntry = { ...current, text: value, updatedAt: now };
      return upsertEntry(prev, updated);
    });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      const next = await window.journal?.toggleFullscreen?.();
      if (typeof next === "boolean") setIsFullscreen(next);
    } catch {
      // ignore
    }
  }, []);

  const openExport = useCallback(() => {
    if (!exportsUnlocked) {
      setPaywallOpen(true);
      setExportModalOpen(false);
      setChromeTemporarily();
      return;
    }
    setExportModalOpen(true);
    setPaywallOpen(false);
    setChromeTemporarily();
  }, [exportsUnlocked, setChromeTemporarily]);

  const exportToFile = useCallback(async (suggestedName: string, content: string) => {
    const filters = [{ name: "Text", extensions: ["md", "txt", "json"] }];
    const api = window.journal?.exportToFile;
    if (api) {
      const res = await api({ suggestedName, content, filters });
      if (!res.ok && res.error !== "canceled") throw new Error(res.error);
      return;
    }
    downloadFile(suggestedName, content, "text/plain");
  }, []);

  const exportCurrentMarkdown = useCallback(async () => {
    const name = `journal-${fileSafeDate(activeEntry.createdAt)}.md`;
    const content = `# ${new Date(activeEntry.createdAt).toLocaleString()}\n\n${activeEntry.text}\n`;
    await exportToFile(name, content);
    setExportModalOpen(false);
  }, [activeEntry.createdAt, activeEntry.text, exportToFile]);

  const exportAllMarkdown = useCallback(async () => {
    const name = `journal-all-${fileSafeDate(Date.now())}.md`;
    const content =
      state.entries
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(
          (e) =>
            `# ${new Date(e.createdAt).toLocaleString()}\n\n${e.text}\n\n---\n\n`,
        )
        .join("") || "# Journal\n\n";
    await exportToFile(name, content);
    setExportModalOpen(false);
  }, [exportToFile, state.entries]);

  const exportAllJson = useCallback(async () => {
    const name = `journal-all-${fileSafeDate(Date.now())}.json`;
    const content = JSON.stringify(state, null, 2);
    await exportToFile(name, content);
    setExportModalOpen(false);
  }, [exportToFile, state]);

  const startPayment = useCallback(async () => {
    setPayError(null);
    setPayStatus("starting");
    try {
      const order = await createExportOrder(`export-${Date.now()}`);
      if (!order.ok) throw new Error(order.error);

      await openRazorpayCheckout({
        key: order.keyId,
        name: order.productName,
        description: "Unlock exports",
        order_id: order.orderId,
        handler: async (resp) => {
          try {
            setPayStatus("verifying");
            const verified = await verifyPayment({
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            if (!verified.ok) throw new Error(verified.error);

            localStorage.setItem(EXPORT_UNLOCK_KEY, "1");
            setExportsUnlocked(true);
            setPaywallOpen(false);
            setExportModalOpen(true);
            setPayStatus("idle");
          } catch (e) {
            setPayStatus("error");
            setPayError(e instanceof Error ? e.message : "Verification failed");
          }
        },
        modal: {
          ondismiss: () => {
            setPayStatus("idle");
          },
        },
        theme: { color: "#8b5cf6" },
      });
    } catch (e) {
      setPayStatus("error");
      setPayError(e instanceof Error ? e.message : "Payment failed");
    }
  }, []);

  useEffect(() => {
    editorRef.current?.focus();
  }, [state.activeId]);

  useEffect(() => {
    chromeTimeoutRef.current = window.setTimeout(() => setShowChrome(false), 1500);
    const onMove = () => setChromeTemporarily();
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [setChromeTemporarily]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === "F11" || (mod && e.key === "Enter")) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      if (mod && key === "n") {
        e.preventDefault();
        newEntry();
        return;
      }

      if (mod && key === "h") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        setChromeTemporarily();
        return;
      }

      if (mod && key === "e") {
        e.preventDefault();
        openExport();
        return;
      }

      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newEntry, openExport, sidebarOpen, setChromeTemporarily, toggleFullscreen]);

  useEffect(() => {
    let cancelled = false;

    window.journal
      ?.isFullscreen?.()
      .then((value) => {
        if (!cancelled) setIsFullscreen(value);
      })
      .catch(() => {
        if (!cancelled) setIsFullscreen(null);
      });

    const unsub = window.journal?.onFullscreenChanged?.((value) => {
      setIsFullscreen(value);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        saveJournalState(state);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 350);

    return () => window.clearTimeout(t);
  }, [state]);

  const statusText =
    saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved";

  return (
    <div className="app">
      {paywallOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Unlock exports">
          <div className="modal">
            <div className="modalTitle">Unlock export</div>
            <div className="modalBody">
              Exports are a paid feature. Complete a Razorpay payment to unlock on this device.
            </div>
            {payError ? <div className="modalError">{payError}</div> : null}
            <div className="modalActions">
              <button
                className="ghostButton"
                type="button"
                onClick={() => setPaywallOpen(false)}
                disabled={payStatus === "starting" || payStatus === "verifying"}
              >
                Cancel
              </button>
              <button
                className="primaryButton"
                type="button"
                onClick={startPayment}
                disabled={payStatus === "starting" || payStatus === "verifying"}
                title="Pay with Razorpay"
              >
                {payStatus === "starting"
                  ? "Starting…"
                  : payStatus === "verifying"
                    ? "Verifying…"
                    : "Pay & Unlock"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exportModalOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Export">
          <div className="modal">
            <div className="modalTitle">Export</div>
            <div className="modalBody">Choose what to export.</div>
            <div className="modalActions">
              <button className="ghostButton" type="button" onClick={() => setExportModalOpen(false)}>
                Close
              </button>
              <button className="ghostButton" type="button" onClick={exportCurrentMarkdown}>
                Current (.md)
              </button>
              <button className="ghostButton" type="button" onClick={exportAllMarkdown}>
                All (.md)
              </button>
              <button className="ghostButton" type="button" onClick={exportAllJson}>
                All (.json)
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebarHeader">
          <div className="sidebarTitle">Entries</div>
          <button
            className="iconButton"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close history"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        <div className="entries">
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`entry ${e.id === state.activeId ? "active" : ""}`}
              onClick={() => selectEntry(e.id)}
              title={new Date(e.updatedAt).toLocaleString()}
            >
              <div className="entryMeta">{formatDay(e.updatedAt)}</div>
              <div className="entryPreview">{preview(e.text)}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className={`chrome top ${showChrome ? "show" : ""}`}>
          <div className="chromeLeft">
            <button
              className="ghostButton"
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              title="History (Ctrl/⌘+H)"
            >
              History
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={newEntry}
              title="New entry (Ctrl/⌘+N)"
            >
              New
            </button>
          </div>

          <div className="chromeCenter">{statusText}</div>

          <div className="chromeRight">
            <button
              className="ghostButton"
              type="button"
              onClick={openExport}
              title={exportsUnlocked ? "Export (Ctrl/⌘+E)" : "Export locked (Ctrl/⌘+E)"}
            >
              {exportsUnlocked ? "Export" : "Export (locked)"}
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={toggleFullscreen}
              title="Fullscreen (F11 / Ctrl/⌘+Enter)"
            >
              {isFullscreen ? "Windowed" : "Fullscreen"}
            </button>
          </div>
        </div>

        <textarea
          ref={editorRef}
          className="editor"
          value={activeEntry.text}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          onFocus={setChromeTemporarily}
        />

        <div className={`chrome bottom ${showChrome ? "show" : ""}`}>
          <div className="bottomLeft">{formatDay(activeEntry.createdAt)}</div>
          <div className="bottomRight">{wordCount(activeEntry.text)} words</div>
        </div>
      </main>
    </div>
  );
}
