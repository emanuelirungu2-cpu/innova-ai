import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptPrintButton } from "@/app/pos/receipt-print-button";
import { getCurrentHotel } from "@/lib/hotels/current";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, hotel } = await getCurrentHotel();
  const { data: order, error: orderError } = await supabase
    .from("pos_orders")
    .select("id, order_number, payment_method, total_amount, created_at")
    .eq("id", id)
    .eq("hotel_id", hotel.id)
    .maybeSingle();

  if (orderError || !order) notFound();

  const { data: items, error: itemsError } = await supabase
    .from("pos_order_items")
    .select("item_name, quantity, unit_price, line_total")
    .eq("order_id", order.id)
    .eq("hotel_id", hotel.id)
    .order("created_at");
  if (itemsError || !items) notFound();

  const formatAmount = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(Number(amount));
  const formatTime = new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: hotel.timezone,
  }).format(new Date(order.created_at));

  return (
    <main className="receipt-shell">
      <div className="receipt-screen-actions">
        <Link className="text-action" href="/pos">← Back to sales</Link>
        <ReceiptPrintButton />
      </div>
      <article className="receipt-card">
        <header className="receipt-header">
          <span className="brand-mark">i</span>
          <h1>{hotel.name}</h1>
          <p>{hotel.city}{hotel.country ? `, ${hotel.country}` : ""}</p>
          <strong>SALES RECEIPT</strong>
        </header>
        <div className="receipt-meta"><span>Receipt</span><strong>#{order.order_number}</strong></div>
        <div className="receipt-meta"><span>Date</span><span>{formatTime}</span></div>
        <div className="receipt-meta"><span>Payment</span><span>{order.payment_method.replaceAll("_", " ")}</span></div>
        <table className="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.item_name}-${index}`}><td><strong>{item.item_name}</strong><small>{formatAmount(item.unit_price)} each</small></td><td>{item.quantity}</td><td>{formatAmount(item.line_total)}</td></tr>)}</tbody></table>
        <div className="receipt-total"><span>Total paid</span><strong>{formatAmount(order.total_amount)}</strong></div>
        <footer className="receipt-thanks"><strong>Thank you for visiting!</strong><span>We hope to see you again.</span></footer>
      </article>
    </main>
  );
}
