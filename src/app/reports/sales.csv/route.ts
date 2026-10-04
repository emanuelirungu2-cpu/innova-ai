import { NextResponse } from "next/server";
import { getCurrentHotel } from "@/lib/hotels/current";
import { getPosSalesBetween, isIsoCalendarDate } from "@/lib/pos-sales-report";

export const dynamic = "force-dynamic";

function csvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!isIsoCalendarDate(start) || !isIsoCalendarDate(end)) {
    return NextResponse.json({ error: "Choose valid start and end dates." }, { status: 400 });
  }
  const dayCount = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000 + 1;
  if (dayCount < 1 || dayCount > 31) {
    return NextResponse.json({ error: "The report range must be no more than 31 days." }, { status: 400 });
  }

  const { supabase, hotel } = await getCurrentHotel();
  try {
    const sales = await getPosSalesBetween(supabase, hotel.id, start, end, hotel.timezone);
    const rows = [
      ["Sale number", "Date and time (UTC)", "Payment method", "Total", "Currency"].map(csvCell).join(","),
      ...sales.map((sale) => [
        sale.order_number,
        new Date(sale.created_at).toISOString(),
        sale.payment_method,
        Number(sale.total_amount).toFixed(2),
        hotel.currency,
      ].map(csvCell).join(",")),
    ];
    const filename = `innova-ai-sales-${start}-to-${end}.csv`;
    return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load sales for this report." }, { status: 500 });
  }
}
