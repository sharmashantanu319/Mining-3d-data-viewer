"use client";

import { useEffect, useRef, useState } from "react";
import { dragHasFiles, pickExportFile } from "./dropFile";

/**
 * Window-wide drag-and-drop of an export file.
 *
 * Listens on `window` so the whole viewer is a drop target (including over
 * the WebGL canvas), and always calls preventDefault on file drags —
 * otherwise the browser navigates away to the dropped file. `dragenter` and
 * `dragleave` fire for every child element crossed, so a depth counter
 * (rather than a boolean) decides when the cursor has truly left the window.
 *
 * @param {(file: File) => void} onFile called with the chosen file
 * @param {(message: string) => void} onReject called when the drop has no usable file
 * @param {boolean} disabled ignore drops (e.g. while an export is loading)
 * @returns {boolean} whether a file is currently being dragged over the window
 */
export function useFileDrop(onFile, onReject, disabled = false) {
  const [isDragging, setIsDragging] = useState(false);
  const handlersRef = useRef({ onFile, onReject, disabled });
  handlersRef.current = { onFile, onReject, disabled };

  useEffect(() => {
    let depth = 0;

    function handleDragEnter(event) {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth += 1;
      if (!handlersRef.current.disabled) setIsDragging(true);
    }
    function handleDragOver(event) {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = handlersRef.current.disabled ? "none" : "copy";
    }
    function handleDragLeave(event) {
      if (!dragHasFiles(event.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    }
    function handleDrop(event) {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth = 0;
      setIsDragging(false);
      if (handlersRef.current.disabled) return;
      const picked = pickExportFile(event.dataTransfer.files);
      if (picked.file) handlersRef.current.onFile(picked.file);
      else handlersRef.current.onReject?.(picked.error);
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return isDragging;
}
