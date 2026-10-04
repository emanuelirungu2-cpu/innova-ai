import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentHotel } from "@/lib/hotels/current";
import { getPosSalesBetween, isIsoCalendarDate, shiftCalendarDate } from "@/lib/pos-sales-report";

const paymentLabels: Record<string, string> = { cash: "Cash", card: "Card", mobile_money: "Mobile money" };

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel } = await getCurrentHotel();
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: hotel.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const today = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
  const defaultStart = shiftCalendarDate(today, -6);
  const start = params.start ?? defaultStart;
  const end = params.end ?? today;
  const dayCount = isIsoCalendarDate(start) && isIsoCalendarDate(end)
    ? (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000 + 1
    : 0;
  const rangeIsValid = dayCount >= 1 && dayCount <= 31;

  let sales = [] as Awaited<ReturnType<typeof getPosSalesBetween>>;
  let loadFailed = false;
  if (rangeIsValid) {
    try {
      sales = await getPosSalesBetween(supabase, hotel.id, start, end, hotel.timezone);
    } catch {
      loadFailed = true;
    }
  }

  const total = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const byMethod = new Map<string, { count: number; amount: number }>();
  const byDay = new Map<string, { count: number; amount: number }>();
  for (const sale of sales) {
    const method = byMethod.get(sale.payment_method) ?? { count: 0, amount: 0 };
    method.count += 1;
    method.amount += Number(sale.total_amount);
    byMethod.set(sale.payment_method, method);

    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: hotel.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(sale.created_at));
    const local = Object.fromEntries(localParts.map((part) => [part.type, part.value]));
    const date = `${local.year}-${local.month}-${local.day}`;
    const daily = byDay.get(date) ?? { count: 0, amount: 0 };
    daily.count += 1;
    daily.amount += Number(sale.total_amount);
    byDay.set(date, daily);
  }

  const dates = rangeIsValid
    ? Array.from({ length: dayCount }, (_, index) => shiftCalendarDate(start, index))
    : [];
  const formatAmount = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(amount);
  const formatDate = (date: string) => new Intl.DateTimeFormat("en", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const formatTime = (value: string) => new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: hotel.timezone,
  }).format(new Date(value));

  return (
    <main className="module-shell">
      <header className="module-header">
        <Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="module-property">{hotel.name} <small>{hotel.city}</small></span>
        <nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/rooms">Rooms</Link><Link href="/reservations">Reservations</Link><Link href="/menu">Menu</Link><Link href="/pos">POS</Link><Link className="selected" href="/reports">Reports</Link></nav>
        <form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form>
      </header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">BUSINESS REPORTS</p><h1>Sales report</h1><p className="module-subtitle">Review restaurant sales recorded through the point of sale.</p></div><span className="module-count">{rangeIsValid ? `${dayCount} ${dayCount === 1 ? "day" : "days"}` : "Choose dates"}</span></div>
        <section className="module-card report-filter-card"><form className="report-filter" method="get" action="/reports"><div><label htmlFor="reportStart">From</label><input id="reportStart" name="start" type="date" defaultValue={start} required /></div><div><label htmlFor="reportEnd">To</label><input id="reportEnd" name="end" type="date" defaultValue={end} required /></div><button className="primary-button" type="submit">Apply dates</button>{rangeIsValid && !loadFailed && <Link className="text-action report-download" href={`/reports/sales.csv?start=${start}&end=${end}`}>Download CSV ↓</Link>}</form><p className="report-hint">Choose a period of up to 31 days. Totals are based on POS sales recorded in {hotel.timezone}.</p></section>
        {!rangeIsValid && <p className="form-message error-message" role="alert">Choose valid dates with the start date before the end date and a maximum range of 31 days.</p>}
        {loadFailed && <p className="form-message error-message" role="alert">We couldn’t load the sales report. Refresh and try again.</p>}
        {rangeIsValid && !loadFailed && <>
          <section className="report-summary-grid"><article className="stat-card"><div className="stat-top"><span>Total POS sales</span><span className="stat-icon">▤</span></div><div className="stat-value report-stat-value">{formatAmount(total)}</div><div className="stat-foot">{sales.length} recorded {sales.length === 1 ? "sale" : "sales"}</div></article><article className="stat-card"><div className="stat-top"><span>Average sale</span><span className="stat-icon">↗</span></div><div className="stat-value report-stat-value">{formatAmount(sales.length ? total / sales.length : 0)}</div><div className="stat-foot">Across the selected dates</div></article>{["cash", "card", "mobile_money"].map((method) => { const metric = byMethod.get(method) ?? { count: 0, amount: 0 }; return <article className="stat-card" key={method}><div className="stat-top"><span>{paymentLabels[method]}</span><span className="stat-icon">{method === "cash" ? "¤" : method === "card" ? "▣" : "↗"}</span></div><div className="stat-value report-stat-value">{formatAmount(metric.amount)}</div><div className="stat-foot">{metric.count} {metric.count === 1 ? "sale" : "sales"}</div></article>; })}</section>
          <div className="report-columns"><section className="module-card report-table-card"><div className="module-card-heading"><h2>Daily sales</h2><p>Totals for each local calendar day.</p></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Date</th><th>Sales</th><th>Total</th></tr></thead><tbody>{dates.map((date) => { const day = byDay.get(date) ?? { count: 0, amount: 0 }; return <tr key={date}><td>{formatDate(date)}</td><td>{day.count}</td><td>{formatAmount(day.amount)}</td></tr>; })}</tbody></table></div></section>
            <section className="module-card report-table-card"><div className="module-card-heading"><h2>Recent sales</h2><p>Latest transactions in this date range.</p></div>{sales.length === 0 ? <div className="empty-state"><strong>No sales in this period</strong><p>Recorded POS sales will appear here.</p></div> : <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Sale</th><th>Time</th><th>Payment</th><th>Total</th></tr></thead><tbody>{sales.slice(0, 50).map((sale) => <tr key={sale.id}><td>#{sale.order_number}</td><td>{formatTime(sale.created_at)}</td><td>{paymentLabels[sale.payment_method]}</td><td>{formatAmount(Number(sale.total_amount))}</td></tr>)}</tbody></table></div>}{sales.length > 50 && <p className="report-hint">Showing the latest 50 sales. Download the CSV for the full list.</p>}</section></div>
          <p className="report-footnote">This report shows restaurant POS sales only. It does not include room charges or payments processed outside Innova AI.</p>
        </>}
      </section>
    </main>
  );
}
