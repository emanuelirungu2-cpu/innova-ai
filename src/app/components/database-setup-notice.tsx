import Link from "next/link";

export function DatabaseSetupNotice() {
  return (
    <main className="setup-shell">
      <section className="setup-card setup-message-card">
        <Link className="brand setup-brand" href="/"><span className="brand-mark">i</span><span>innova<span className="brand-ai">.ai</span></span></Link>
        <span className="setup-step">PROPERTY OPERATIONS</span>
        <h1>Finish the database setup</h1>
        <p className="setup-intro">Run the housekeeping migration in your Supabase SQL Editor, then refresh this page.</p>
        <div className="database-instructions"><strong>In VS Code, open</strong><p><code>supabase/migrations/20261004150000_add_housekeeping.sql</code></p><strong>Then in Supabase</strong><ol><li>Open <b>SQL Editor</b> and choose <b>New query</b>.</li><li>Copy the entire migration file into the query.</li><li>Click <b>Run</b>, then return here and refresh.</li></ol></div>
        <p className="setup-footnote">This migration adds housekeeping statuses and marks a room as needing cleaning after guest checkout.</p>
      </section>
    </main>
  );
}
