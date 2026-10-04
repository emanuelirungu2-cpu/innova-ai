import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createMenuItem, updateMenuItemAvailability } from "@/app/menu/actions";
import { getCurrentHotel } from "@/lib/hotels/current";

const errors: Record<string, string> = {
  "invalid-item": "Check the item name, category, description, and price.",
  "duplicate-item": "An item with that name is already on this menu.",
  "database-not-ready": "Run the menu catalog migration in Supabase, then refresh this page.",
  "save-failed": "We couldn’t save the menu item. Try again.",
};

export const dynamic = "force-dynamic";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel } = await getCurrentHotel();
  const { data: items, error } = await supabase
    .from("menu_items")
    .select("id, name, category, description, price, is_available")
    .eq("hotel_id", hotel.id)
    .order("category")
    .order("name");

  if (error) {
    return (
      <main className="setup-shell"><section className="setup-card setup-message-card">
        <Link className="brand setup-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="setup-step">RESTAURANT &amp; BAR</span><h1>Set up your menu</h1>
        <p className="setup-intro">Run the menu catalog migration in your Supabase SQL Editor, then refresh this page.</p>
        <div className="database-instructions"><strong>In VS Code, open</strong><p><code>supabase/migrations/20261004160000_add_menu_catalog.sql</code></p><strong>Then in Supabase</strong><ol><li>Open <b>SQL Editor</b> and choose <b>New query</b>.</li><li>Copy the entire migration file into the query.</li><li>Click <b>Run</b>, then return here and refresh.</li></ol></div>
      </section></main>
    );
  }

  const formatPrice = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(Number(amount));

  return (
    <main className="module-shell">
      <header className="module-header">
        <Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="module-property">{hotel.name} <small>{hotel.city}</small></span>
        <nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link><Link className="selected" href="/menu">Menu</Link><Link href="/pos">POS</Link></nav>
        <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
      </header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">RESTAURANT &amp; BAR</p><h1>Menu</h1><p className="module-subtitle">Set your food and drink items and prices before recording orders.</p></div><span className="module-count">{items.length} {items.length === 1 ? "item" : "items"}</span></div>
        {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
        {params.message && <p className="form-message success-message" role="status">{params.message === "item-created" ? "Menu item added." : "Availability updated."}</p>}
        <div className="module-grid">
          <section className="module-card"><div className="module-card-heading"><h2>Add a menu item</h2><p>Prices use your hotel’s currency: {hotel.currency}.</p></div>
            <form className="module-form" action={createMenuItem}>
              <label htmlFor="menuName">Item name</label><input id="menuName" name="name" type="text" placeholder="e.g. Grilled chicken" minLength={2} maxLength={120} required />
              <label htmlFor="menuCategory">Category</label><select id="menuCategory" name="category" defaultValue="food"><option value="food">Food</option><option value="beverage">Beverage</option><option value="other">Other</option></select>
              <label htmlFor="menuDescription">Description (optional)</label><textarea id="menuDescription" name="description" placeholder="Short description" maxLength={500} rows={3} />
              <label htmlFor="menuPrice">Price ({hotel.currency})</label><input id="menuPrice" name="price" type="number" min="0" step="0.01" required />
              <button className="primary-button module-submit" type="submit">＋ Add to menu</button>
            </form>
          </section>
          <section className="module-card inventory-card"><div className="module-card-heading"><h2>Menu items</h2><p>Unavailable items remain in the catalog but can’t be sold when we add order taking.</p></div>
            {items.length === 0 ? <div className="empty-state"><span className="empty-icon">♧</span><strong>Your menu is empty</strong><p>Add a food or drink item to get started.</p></div> : <div className="menu-list">{items.map((item) => <article className="menu-row" key={item.id}><span className="room-icon">{item.category === "beverage" ? "◒" : item.category === "food" ? "♧" : "•"}</span><div className="room-main"><strong>{item.name}</strong><small>{item.category}{item.description ? ` · ${item.description}` : ""}</small></div><strong className="menu-price">{formatPrice(item.price)}</strong><span className={`room-status ${item.is_available ? "is-active" : "is-offline"}`}>{item.is_available ? "Available" : "Unavailable"}</span><form action={updateMenuItemAvailability}><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="available" value={item.is_available ? "false" : "true"} /><button className="text-action" type="submit">{item.is_available ? "Mark unavailable" : "Make available"}</button></form></article>)}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
