import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createPosSale } from "@/app/pos/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const errors: Record<string, string> = {
  "invalid-sale": "Choose at least one item, with quantities from 1 to 100, and select how the customer paid.",
  "unavailable-item": "One of those menu items is no longer available. Refresh the page and try again.",
  "database-not-ready": "Run the point-of-sale migration in Supabase, then refresh this page.",
  "save-failed": "We couldn’t record the sale. Try again.",
};

const categoryLabel: Record<string, string> = { food: "Food", beverage: "Beverages", other: "Other" };

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel } = await getCurrentHotel();
  const [{ data: items, error: itemsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from("menu_items")
      .select("id, name, category, price")
      .eq("hotel_id", hotel.id)
      .eq("is_available", true)
      .order("category").order("name"),
    supabase.from("pos_orders")
      .select("id, order_number, payment_method, total_amount, created_at")
      .eq("hotel_id", hotel.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (itemsError || ordersError) {
    return (
      <main className="setup-shell"><section className="setup-card setup-message-card">
        <Link className="brand setup-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="setup-step">POINT OF SALE</span><h1>Finish the POS database setup</h1>
        <p className="setup-intro">Run the point-of-sale migration in your Supabase SQL Editor, then refresh this page.</p>
        <div className="database-instructions"><strong>In VS Code, open</strong><p><code>supabase/migrations/20261004170000_add_point_of_sale.sql</code></p><strong>Then in Supabase</strong><ol><li>Open <b>SQL Editor</b> and choose <b>New query</b>.</li><li>Copy the entire migration file into the query.</li><li>Click <b>Run</b>, then return here and refresh.</li></ol></div>
        <p className="setup-footnote">Make sure the menu catalog migration has already been run.</p>
      </section></main>
    );
  }

  const orderIds = (orders ?? []).map((order) => order.id);
  const { data: lines } = orderIds.length
    ? await supabase.from("pos_order_items").select("order_id, item_name, quantity").eq("hotel_id", hotel.id).in("order_id", orderIds)
    : { data: [] as Array<{ order_id: string; item_name: string; quantity: number }> };
  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines ?? []) {
    const current = linesByOrder.get(line.order_id) ?? [];
    current.push(line);
    linesByOrder.set(line.order_id, current);
  }

  const formatAmount = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(Number(amount));
  const formatTime = (value: string) => new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: hotel.timezone,
  }).format(new Date(value));
  const groupedItems = ["food", "beverage", "other"].map((category) => ({
    category,
    items: (items ?? []).filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="module-shell">
      <header className="module-header">
        <Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="module-property">{hotel.name} <small>{hotel.city}</small></span>
        <nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link><Link href="/menu">Menu</Link><Link className="selected" href="/pos">POS</Link></nav>
        <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
      </header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">RESTAURANT &amp; BAR</p><h1>Point of sale</h1><p className="module-subtitle">Record a sale from your available menu items.</p></div><span className="module-count">{(orders ?? []).length} recent sales</span></div>
        {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
        {params.message === "sale-created" && <p className="form-message success-message" role="status">Sale recorded successfully.</p>}
        <p className="demo-note">Choose a payment type after collecting payment. This records sales; it does not charge a card or mobile wallet.</p>
        <div className="module-grid reservation-grid">
          <section className="module-card pos-card"><div className="module-card-heading"><h2>New sale</h2><p>Enter the quantity for each item. Leave items at zero if they weren’t ordered.</p></div>
            {!groupedItems.length ? <div className="empty-state"><span className="empty-icon">♧</span><strong>No available menu items</strong><p>Add items to your restaurant menu before recording a sale.</p><Link className="text-action" href="/menu">Open menu →</Link></div> : <form className="module-form" action={createPosSale}>
              <div className="pos-item-groups">{groupedItems.map((group) => <fieldset className="pos-item-group" key={group.category}><legend>{categoryLabel[group.category]}</legend>{group.items.map((item) => <label className="pos-item-row" key={item.id} htmlFor={`quantity_${item.id}`}><span><strong>{item.name}</strong><small>{formatAmount(item.price)}</small></span><input id={`quantity_${item.id}`} name={`quantity_${item.id}`} type="number" min="0" max="100" defaultValue="0" /></label>)}</fieldset>)}</div>
              <label htmlFor="paymentMethod">How did the customer pay?</label><select id="paymentMethod" name="paymentMethod" defaultValue="cash"><option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option></select>
              <button className="primary-button module-submit" type="submit">＋ Record sale</button>
            </form>}
          </section>
          <section className="module-card booking-card"><div className="module-card-heading"><h2>Recent sales</h2><p>Latest sales recorded at {hotel.name}.</p></div>
            {!(orders ?? []).length ? <div className="empty-state"><span className="empty-icon">▤</span><strong>No sales recorded yet</strong><p>Your completed sales will appear here.</p></div> : <div className="booking-list">{(orders ?? []).map((order) => <article className="booking-row pos-order" key={order.id}><div className="booking-row-top"><span className="room-icon">#{order.order_number}</span><div className="guest-name"><strong>Sale #{order.order_number}</strong><small>{formatTime(order.created_at)} · {order.payment_method.replaceAll("_", " ")}</small></div><strong className="menu-price">{formatAmount(order.total_amount)}</strong></div><div className="pos-order-lines">{(linesByOrder.get(order.id) ?? []).map((line, index) => <span key={`${order.id}-${index}`}>{line.quantity} × {line.item_name}</span>)}</div><div className="pos-order-footer"><Link className="text-action" href={`/pos/receipt/${order.id}`}>View / print receipt →</Link></div></article>)}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
