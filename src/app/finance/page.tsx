import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { createExpense } from "@/app/finance/actions";
import { getCurrentHotel } from "@/lib/hotels/current";
import { getPosSalesBetween } from "@/lib/pos-sales-report";
import type { SupabaseClient } from "@supabase/supabase-js";

const categories: Record<string, string> = {
  food_supplies: "Food supplies", payroll: "Payroll", rent: "Rent",
  utilities: "Utilities", maintenance: "Maintenance", transport: "Transport",
  marketing: "Marketing", other: "Other",
};
const paymentLabels: Record<string, string> = {
  cash: "Cash", card: "Card", mobile_money: "Mobile money", bank_transfer: "Bank transfer",
};
const errors: Record<string, string> = {
  "invalid-expense": "Check the expense date, description, category, amount, and payment method.",
  "access-denied": "Only hotel owners, admins, or managers can access expense records.",
  "database-not-ready": "Run the expense tracking migration in Supabase, then refresh this page.",
  "save-failed": "We couldn’t save the expense. Try again.",
};

type ExpenseRecord = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number | string;
  payment_method: string;
  created_at: string;
};

function dateInZone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

async function getRecentExpenses(supabase: SupabaseClient, hotelId: string, start: string, end: string) {
  const expenses: ExpenseRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("expenses")
      .select("id, expense_date, category, description, vendor, amount, payment_method, created_at")
      .eq("hotel_id", hotelId)
      .gte("expense_date", start)
      .lte("expense_date", end)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    expenses.push(...((data ?? []) as ExpenseRecord[]));
    if ((data ?? []).length < 1000) break;
  }
  return expenses;
}

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const { supabase, hotel, userRole } = await getCurrentHotel();
  if (!["owner", "admin", "manager"].includes(userRole)) {
    return <main className="setup-shell"><section className="setup-card"><h1>Finance access is limited</h1><p className="setup-intro">Ask a hotel owner or manager to review expenses.</p><Link className="text-action" href="/dashboard">Return to overview →</Link></section></main>;
  }

  const today = dateInZone(hotel.timezone);
  const firstDay = shiftDate(today, -29);
  let expenses: ExpenseRecord[] = [];
  let salesTotal = 0;
  let loadFailed = false;
  try {
    const [expenseRows, sales] = await Promise.all([
      getRecentExpenses(supabase, hotel.id, firstDay, today),
      getPosSalesBetween(supabase, hotel.id, firstDay, today, hotel.timezone),
    ]);
    expenses = expenseRows;
    salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  } catch {
    loadFailed = true;
  }

  if (loadFailed) {
    return <main className="setup-shell"><section className="setup-card setup-message-card"><Link className="brand setup-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="setup-step">FINANCE</span><h1>Set up expense tracking</h1><p className="setup-intro">Run the expense tracking migration in your Supabase SQL Editor, then refresh.</p><div className="database-instructions"><strong>In VS Code, open</strong><p><code>supabase/migrations/20261004180000_add_expense_tracking.sql</code></p><strong>Then in Supabase</strong><ol><li>Open <b>SQL Editor</b> and choose <b>New query</b>.</li><li>Copy the full migration file into the query.</li><li>Click <b>Run</b>, then return here and refresh.</li></ol></div></section></main>;
  }

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const operatingDifference = salesTotal - total;
  const byCategory = new Map<string, number>();
  for (const expense of expenses) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + Number(expense.amount));
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const formatAmount = (amount: number | string) => new Intl.NumberFormat("en", {
    style: "currency", currency: hotel.currency, maximumFractionDigits: 2,
  }).format(Number(amount));
  const formatDate = (date: string) => new Intl.DateTimeFormat("en", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <main className="module-shell">
      <header className="module-header"><Link className="brand module-brand" href="/dashboard"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link><span className="module-property">{hotel.name} <small>{hotel.city}</small></span><nav className="module-nav" aria-label="Property navigation"><Link href="/dashboard">Overview</Link><Link href="/reports">Reports</Link><Link className="selected" href="/finance">Finance</Link></nav><form action={signOut}><button className="quiet-button" type="submit">Sign out</button></form></header>
      <section className="module-content">
        <div className="module-title-row"><div><p className="eyebrow">FINANCE</p><h1>Expenses</h1><p className="module-subtitle">Track operating expenses paid by your property.</p></div><span className="module-count">Last 30 days</span></div>
        {params.error && errors[params.error] && <p className="form-message error-message" role="alert">{errors[params.error]}</p>}
        {params.message === "expense-created" && <p className="form-message success-message" role="status">Expense recorded.</p>}
        <div className="finance-summary-grid"><article className="stat-card"><div className="stat-top"><span>POS sales</span><span className="stat-icon">＋</span></div><div className="stat-value report-stat-value">{formatAmount(salesTotal)}</div><div className="stat-foot">Last 30 days</div></article><article className="stat-card"><div className="stat-top"><span>Recorded expenses</span><span className="stat-icon">−</span></div><div className="stat-value report-stat-value">{formatAmount(total)}</div><div className="stat-foot">{expenses.length} recorded {expenses.length === 1 ? "expense" : "expenses"}</div></article><article className="stat-card"><div className="stat-top"><span>POS sales less expenses</span><span className="stat-icon">＝</span></div><div className="stat-value report-stat-value">{formatAmount(operatingDifference)}</div><div className="stat-foot">Before room revenue and other costs</div></article><article className="stat-card"><div className="stat-top"><span>Top expense category</span><span className="stat-icon">▤</span></div><div className="stat-value finance-category-value">{topCategory ? categories[topCategory[0]] : "None yet"}</div><div className="stat-foot">{topCategory ? formatAmount(topCategory[1]) : "Add expenses to see a breakdown"}</div></article></div>
        <div className="module-grid finance-grid">
          <section className="module-card"><div className="module-card-heading"><h2>Record an expense</h2><p>Enter a payment already made by the property.</p></div><form className="module-form" action={createExpense}>
            <label htmlFor="expenseDate">Date paid</label><input id="expenseDate" name="expenseDate" type="date" defaultValue={today} max={today} required />
            <label htmlFor="expenseDescription">Description</label><input id="expenseDescription" name="description" type="text" placeholder="e.g. Weekly produce delivery" minLength={2} maxLength={240} required />
            <label htmlFor="expenseVendor">Supplier or payee (optional)</label><input id="expenseVendor" name="vendor" type="text" maxLength={120} placeholder="Supplier name" />
            <label htmlFor="expenseCategory">Category</label><select id="expenseCategory" name="category" defaultValue="food_supplies">{Object.entries(categories).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <label htmlFor="expenseAmount">Amount ({hotel.currency})</label><input id="expenseAmount" name="amount" type="number" min="0.01" step="0.01" required />
            <label htmlFor="expensePaymentMethod">Payment method</label><select id="expensePaymentMethod" name="paymentMethod" defaultValue="cash">{Object.entries(paymentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <button className="primary-button module-submit" type="submit">＋ Save expense</button>
          </form></section>
          <section className="module-card inventory-card"><div className="module-card-heading"><h2>Recent expenses</h2><p>Entries recorded from {formatDate(firstDay)} to {formatDate(today)}.</p></div>
            {!expenses.length ? <div className="empty-state"><span className="empty-icon">▤</span><strong>No expenses recorded</strong><p>Expenses you record will appear here.</p></div> : <div className="expense-list">{expenses.map((expense) => <article className="expense-row" key={expense.id}><span className="room-icon">−</span><div className="room-main"><strong>{expense.description}</strong><small>{categories[expense.category]}{expense.vendor ? ` · ${expense.vendor}` : ""} · {formatDate(expense.expense_date)}</small></div><div className="expense-amount"><strong>{formatAmount(expense.amount)}</strong><small>{paymentLabels[expense.payment_method]}</small></div></article>)}</div>}
          </section>
        </div>
        <p className="report-footnote">This is a basic operating snapshot, not a full accounting statement. It uses POS sales and expenses entered here, and excludes room revenue, taxes, and transactions outside Innova AI.</p>
      </section>
    </main>
  );
}
