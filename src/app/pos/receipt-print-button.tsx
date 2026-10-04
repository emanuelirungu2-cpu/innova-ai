"use client";

export function ReceiptPrintButton() {
  return (
    <button className="primary-button receipt-print-button" type="button" onClick={() => window.print()}>
      Print receipt
    </button>
  );
}
