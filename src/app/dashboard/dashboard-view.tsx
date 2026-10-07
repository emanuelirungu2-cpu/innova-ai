import { signOut } from "@/app/auth/actions";
import { switchWorkspace } from "@/app/workspaces/actions";
import Link from "next/link";

type DashboardStat = { label: string; value: string; note: string; icon: string };
type DashboardArrival = { name: string; detail: string; date: string; status: string };
type SalesPerformance = {
  currency: string;
  total: number;
  trend: string;
  days: Array<{ label: string; amount: number }>;
};

export function DashboardView({
  hotelName,
  managerName,
  todayLabel,
  stats,
  roomStats,
  salesPerformance,
  arrivals,
  arrivalsToday,
  hotelId,
  workspaces,
}: {
  hotelName: string;
  managerName: string;
  todayLabel: string;
  stats: DashboardStat[];
  roomStats: { occupied: number; available: number; outOfService: number; occupancy: number };
  salesPerformance: SalesPerformance;
  arrivals: DashboardArrival[];
  arrivalsToday: number;
  hotelId: string;
  workspaces: Array<{ id: string; name: string; city: string; role: string }>;
}) {
  const formatSalesAmount = (amount: number) => new Intl.NumberFormat("en", {
    style: "currency", currency: salesPerformance.currency, maximumFractionDigits: 0,
  }).format(amount);
  const maximumDailySales = Math.max(1, ...salesPerformance.days.map((day) => day.amount));
  const totalRooms = roomStats.occupied + roomStats.available + roomStats.outOfService;
  const occupiedShare = totalRooms ? (roomStats.occupied / totalRooms) * 100 : 0;
  const activeShareEnd = totalRooms
    ? ((roomStats.occupied + roomStats.available) / totalRooms) * 100
    : 0;
  const occupancyRing = totalRooms
    ? `conic-gradient(#49845f 0 ${occupiedShare}%, #91b79a ${occupiedShare}% ${activeShareEnd}%, #e9eee9 ${activeShareEnd}% 100%)`
    : "#e9eee9";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Innova AI home">
          <span className="brand-mark">i</span>
          <span>innova<span className="brand-ai">.ai</span></span>
        </a>
        <div className="property-switcher"><span className="property-icon">H</span><form action={switchWorkspace} className="property-switch-form"><label className="visually-hidden" htmlFor="activeWorkspace">Current property</label><select id="activeWorkspace" name="workspaceId" defaultValue={hotelId}>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name} · {workspace.city}</option>)}</select><button className="chevron" type="submit" aria-label="Switch property">⌄</button></form></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="#overview"><span>▦</span> Overview</a>
          <Link className="nav-item" href="/reservations"><span>▣</span> Reservations</Link>
          <Link className="nav-item" href="/calendar"><span>▦</span> Room calendar</Link>
          <Link className="nav-item" href="/rooms"><span>⌂</span> Rooms</Link>
          <Link className="nav-item" href="/menu"><span>♧</span> Restaurant menu</Link>
          <Link className="nav-item" href="/pos"><span>▤</span> Point of sale</Link>
          <Link className="nav-item" href="/guests"><span>♙</span> Guests</Link>
          <Link className="nav-item" href="/reports"><span>▤</span> Reports</Link>
          <Link className="nav-item" href="/finance"><span>¤</span> Finance</Link>
          <Link className="nav-item" href="/ai"><span>✳</span> Innova AI</Link>
          <Link className="nav-item" href="/billing"><span>◈</span> Billing</Link>
          <Link className="nav-item" href="/workspaces"><span>⌂</span> Properties</Link>
          <Link className="nav-item" href="/team"><span>♙</span> Team</Link>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/dashboard/settings"><span>⚙</span> Settings</a>
          <div className="user-card"><span className="user-avatar">{managerName.slice(0, 2).toUpperCase()}</span><span className="property-copy"><strong>{managerName}</strong><small>Hotel owner</small></span><form action={signOut}><button className="signout-button" type="submit">Sign out</button></form></div>
        </div>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div className="breadcrumb">{hotelName} <span>/</span> <strong>Overview</strong></div>
          <div className="top-actions"><span className="today-pill"><i /> {todayLabel}</span><button className="icon-button" aria-label="Notifications">♧<i /></button><span className="top-avatar">{managerName.slice(0, 2).toUpperCase()}</span></div>
        </header>

        <div className="dashboard-content">
          <div className="welcome-row"><div><p className="eyebrow">{todayLabel.toUpperCase()}</p><h1>Good morning, {managerName.split(" ")[0]} <span>✳</span></h1><p className="welcome-subtitle">Here&apos;s what&apos;s happening at {hotelName} today.</p></div><Link className="primary-button" href="/reservations"><span>＋</span> New reservation</Link></div>

          <p className="demo-note">Room, arrival, and restaurant sales figures are live from your records.</p>

          <section className="stat-grid" aria-label="Today's key figures">
            {stats.map((stat) => <article className="stat-card" key={stat.label}><div className="stat-top"><span>{stat.label}</span><span className="stat-icon">{stat.icon}</span></div><div className="stat-value">{stat.value}</div><div className="stat-foot">{stat.note}</div></article>)}
          </section>

          <section className="content-grid">
            <article className="panel revenue-panel"><div className="panel-heading"><div><h2>Restaurant sales</h2><p>Sales recorded through the point of sale</p></div><span className="select-button">Last 7 days</span></div><div className="revenue-total"><strong>{formatSalesAmount(salesPerformance.total)}</strong><span className={`trend ${salesPerformance.trend.startsWith("↘") ? "trend-down" : ""}`}>{salesPerformance.trend}</span></div><p className="revenue-caption">Total recorded sales in the last 7 days</p><div className="chart" role="img" aria-label="Restaurant sales recorded over the last seven days">{salesPerformance.days.map((day, index) => { const height = day.amount > 0 ? Math.max(9, day.amount / maximumDailySales * 100) : 3; return <div className="bar-column" key={`${day.label}-${index}`} title={`${day.label}: ${formatSalesAmount(day.amount)}`}><div className={`bar ${index === salesPerformance.days.length - 1 ? "bar-highlight" : ""}`} style={{ height: `${height}%` }} /></div>; })}</div><div className="chart-labels">{salesPerformance.days.map((day, index) => <span key={`${day.label}-${index}`}>{day.label}</span>)}</div></article>

            <article className="panel occupancy-panel"><div className="panel-heading"><div><h2>Room occupancy</h2><p>Today&apos;s room status</p></div><Link className="more-button" href="/rooms" aria-label="Manage rooms">···</Link></div><div className="occupancy-ring" style={{ background: occupancyRing }}><div className="ring-center"><strong>{roomStats.occupancy}<span>%</span></strong><small>occupied</small></div></div><div className="occupancy-legend"><div><span><i className="dot occupied" /> Occupied</span><strong>{roomStats.occupied} rooms</strong></div><div><span><i className="dot available" /> Available</span><strong>{roomStats.available} rooms</strong></div><div><span><i className="dot cleaning" /> Out of service</span><strong>{roomStats.outOfService} rooms</strong></div></div></article>
          </section>

          <section className="panel arrivals-panel" id="reservations"><div className="panel-heading"><div><h2>Upcoming arrivals</h2><p>Guests checking in today <span className="arrival-count">{arrivalsToday}</span></p></div><Link className="view-all" href="/reservations">View all <span>→</span></Link></div><div className="arrival-list">{arrivals.length === 0 ? <p className="empty-arrivals">No upcoming arrivals. New reservations will appear here.</p> : arrivals.map((guest) => <div className="arrival-row" key={guest.name}><span className="guest-avatar blue">{guest.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span className="guest-name"><strong>{guest.name}</strong><small>{guest.detail}</small></span><span className="arrival-time">{guest.date}</span><span className="checkin-status">{guest.status}</span></div>)}</div></section>
          <footer className="footer-note"><span>✳</span> Innova AI brings your hospitality business together.</footer>
        </div>
      </section>
    </main>
  );
}
