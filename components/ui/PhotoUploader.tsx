"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Camera, Image as ImageIcon, X } from "lucide-react";

interface PhotoUploaderProps {
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

interface FileItem {
  file: File;
  preview: string;
  oversized: boolean;
}

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isValidExt(f: File) {
  const ext = f.name.split(".").pop()?.toLowerCase() || "";
  return ALLOWED_EXT.has(ext);
}

export default function PhotoUploader({
  onFilesChange,
  maxFiles = 10,
  disabled,
}: PhotoUploaderProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [warning, setWarning] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMobile(
      navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent)
    );
  }, []);

  useEffect(() => {
    const validFiles = items
      .filter((item) => !item.oversized)
      .map((item) => item.file);
    onFilesChange(validFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(incoming: File[]) {
    setWarning("");

    const extValid = incoming.filter(isValidExt);
    if (extValid.length < incoming.length) {
      setWarning("일부 파일은 허용되지 않는 형식이라 제외되었습니다.");
    }

    const newItems: FileItem[] = extValid.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
      oversized: f.size > MAX_SIZE,
    }));

    setItems((prev) => {
      const combined = [...prev, ...newItems];

      if (combined.length > maxFiles) {
        setWarning(`최대 ${maxFiles}장까지 첨부할 수 있습니다.`);
        const removed = combined.slice(maxFiles);
        removed.forEach((item) => URL.revokeObjectURL(item.preview));
        return combined.slice(0, maxFiles);
      }

      return combined;
    });
  }

  function removeFile(index: number) {
    setWarning("");
    setItems((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold text-gray-500">
        기판 사진 <span className="text-rose-500">*</span>
        {items.length > 0 && ` (${items.length}/${maxFiles})`}
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />

      {isMobile ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled || items.length >= maxFiles}
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-[12px] text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
          >
            <Camera size={16} />
            카메라 촬영
          </button>
          <button
            type="button"
            disabled={disabled || items.length >= maxFiles}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-[12px] text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
          >
            <ImageIcon size={16} />
            갤러리 선택
          </button>
        </div>
      ) : (
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() =>
            !disabled && items.length < maxFiles && fileInputRef.current?.click()
          }
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 transition-colors
            ${
              dragging
                ? "border-blue-500 bg-blue-50 text-blue-600"
                : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:text-blue-500"
            }
            ${disabled || items.length >= maxFiles ? "cursor-not-allowed opacity-40" : ""}`}
        >
          <Upload size={20} className="mb-1" />
          <p className="text-[11px]">
            {dragging ? "여기에 놓으세요" : "클릭하거나 파일을 끌어다 놓으세요"}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-300">
            JPG, PNG, WebP, HEIC / 최대 10MB
          </p>
        </div>
      )}

      {warning && <p className="mt-1.5 text-[11px] text-amber-600">{warning}</p>}

      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <div
              key={`${item.file.name}-${i}`}
              className={`relative overflow-hidden rounded-lg bg-gray-100 ${
                item.oversized ? "ring-2 ring-red-400" : ""
              }`}
              style={{ width: 72, height: 72 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.preview}
                alt={item.file.name}
                className="h-full w-full object-cover"
              />

              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
              >
                <X size={10} />
              </button>

              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-center">
                {item.oversized ? (
                  <span className="text-[9px] font-medium text-red-300">
                    용량 초과
                  </span>
                ) : (
                  <span className="text-[9px] text-white">
                    {formatSize(item.file.size)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
