"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Open animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimating(true));
      });
    } else {
      setIsAnimating(false);
      const timeout = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Touch drag-to-dismiss
  const touchStartY = useRef(0);
  const currentTranslateY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    currentTranslateY.current = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      currentTranslateY.current = diff;
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${diff}px)`;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = "";
    }
    if (currentTranslateY.current > 100) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
  }, [onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[2000]">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          isAnimating ? "opacity-50" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sheet — bottom on mobile, centered modal on desktop */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:right-auto sm:max-w-lg sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl transition-transform duration-300 ease-out max-h-[85vh] flex flex-col ${
          isAnimating
            ? "translate-y-0 sm:translate-y-[-50%]"
            : "translate-y-full sm:translate-y-[-40%] sm:opacity-0"
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xl"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
