import { useEffect, useRef } from "react";

/**
 * Hardware-scanner / HID keyboard barcode listener.
 * Most retail scanners type the code and press Enter very fast (<50ms between chars).
 * We accumulate keystrokes, ignore them if the user is typing in an input,
 * and invoke onScan(code) when Enter is pressed.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts?: { minLength?: number; timeoutMs?: number }) {
  const bufferRef = useRef("");
  const lastKeyRef = useRef<number>(0);
  const minLength = opts?.minLength ?? 4;
  const timeoutMs = opts?.timeoutMs ?? 100;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Ignore typing in form fields
      if (t && /INPUT|TEXTAREA|SELECT/i.test(t.tagName) && !(t as HTMLInputElement).dataset?.scanner) return;

      const now = Date.now();
      if (now - lastKeyRef.current > timeoutMs) bufferRef.current = "";
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current.trim();
        bufferRef.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }
      if (e.key.length === 1) bufferRef.current += e.key;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onScan, minLength, timeoutMs]);
}
