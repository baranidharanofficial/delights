import { formatMoney } from "./money";
import type { Order } from "./types";

/**
 * Opens a print dialog for a thermal-receipt rendering of an order.
 *
 * Client-only (`window`/`document`) — shared by the terminal (printing right
 * after checkout) and anywhere staff need to reprint a past order's bill.
 */
export function printReceipt(order: Order) {
  const placedAt = new Date(order.placedAtMs);
  const dateStr = placedAt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = placedAt.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const linesHtml = order.lines
    .map(
      (line) => `
      <tr>
        <td>${line.name}</td>
        <td class="qty">${line.quantity}</td>
        <td class="amt">${formatMoney(line.unitPrice)}</td>
        <td class="amt">${formatMoney(line.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt #${order.reference}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      /*
       * Percent, not mm: many thermal printer drivers ignore the @page size
       * below and hand the browser a printable width narrower than the
       * paper, so a fixed-mm layout gets its right edge clipped. Sizing
       * everything relative to the box the driver actually gives us keeps
       * left/right padding visually even no matter what that width is.
       */
      padding: 12px 4% 24px;
      color: #000;
    }
    .center { text-align: center; }
    .shop-name {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 2px;
      margin-bottom: 2px;
    }
    .tagline { font-size: 10px; margin-bottom: 6px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .meta { font-size: 11px; margin-bottom: 2px; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; }
    th { font-size: 10px; text-transform: uppercase; padding-bottom: 3px; }
    td { padding: 2px 0; vertical-align: top; overflow-wrap: break-word; }
    .qty { width: 14%; text-align: center; }
    .amt { width: 24%; text-align: right; }
    .totals { width: 100%; }
    .totals td { padding: 1px 0; }
    .totals .label { text-align: left; }
    .totals .value { text-align: right; width: 34%; }
    .grand-total td { font-size: 14px; font-weight: bold; padding-top: 4px; }
    .footer { margin-top: 8px; font-size: 10px; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">DELIGHTS</div>
    <div class="tagline">Thank you for your order!</div>
  </div>
  <div class="divider"></div>
  <div class="meta">Receipt : #${order.reference}</div>
  <div class="meta">Date    : ${dateStr} ${timeStr}</div>
  <div class="meta">Payment : ${order.method}</div>
  ${order.cashier.name ? `<div class="meta">Cashier : ${order.cashier.name}</div>` : ""}
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Item</th>
        <th class="qty">Qty</th>
        <th class="amt">Rate</th>
        <th class="amt">Amt</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <div class="divider"></div>
  <table class="totals">
    <tr>
      <td class="label">Subtotal</td>
      <td class="value">${formatMoney(order.subtotal)}</td>
    </tr>
    <tr>
      <td class="label">${order.taxLabel}</td>
      <td class="value">${formatMoney(order.tax)}</td>
    </tr>
    ${
      order.discount
        ? `<tr>
      <td class="label">Launch coupon</td>
      <td class="value">- ${formatMoney(order.discount.amount)}</td>
    </tr>`
        : ""
    }
  </table>
  <div class="divider"></div>
  <table class="totals grand-total">
    <tr>
      <td class="label">TOTAL</td>
      <td class="value">${formatMoney(order.total)}</td>
    </tr>
  </table>
  <div class="divider"></div>
  <div class="center footer">
    <div>Visit us again!</div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  win.onafterprint = () => win.close();
}
