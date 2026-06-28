import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/services/dashboard";

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = await getDashboardData({
    dateFrom: parseDate(searchParams.get("dateFrom")),
    dateTo: parseDate(searchParams.get("dateTo"), true),
    departmentId: searchParams.get("departmentId") || undefined,
    positionId: searchParams.get("positionId") || undefined
  });
  return NextResponse.json(data);
}
