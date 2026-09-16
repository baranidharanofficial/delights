"use client";

import { useEffect } from "react";

import type { Order } from "@/lib/shop/types";

import OrderList from "./reports/order-list";

/**
 * Orders for the business date the terminal is currently on (today, unless
 * the cashier has stepped back to backdate a sale), reachable so a cashier
 * can reprint a bill or remove a mis-entered sale without leaving the counter
 * screen for the owner-only Reports section.
 *
 * Void stays hidden here — that workflow belongs on Reports, where the daily
 * totals it affects are visible right next to it.
 */
export default function PastOrders({
  orders,
  title = "Today’s orders",
  onClose,
}: {
  orders: Order[];
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-background">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto">
          <OrderList orders={orders} showVoid={false} />
        </div>
      </div>
    </div>
  );
}
