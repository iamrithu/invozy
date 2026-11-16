// The Reports page's tabs, in order — `?tab=<id>` in the URL, so a link
// can open straight onto one. Plain module (no 'use client') so the server
// page can read the URL's tab to decide what to pre-render.

export const REPORT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales analysis' },
  { id: 'receivables', label: 'Receivables' },
  { id: 'collections', label: 'Collections' },
  { id: 'inventory', label: 'Inventory' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['id'];

/** The URL's `tab` param as a known tab, Overview for anything else. */
export function parseReportTab(value: string | null | undefined): ReportTab {
  return REPORT_TABS.find((t) => t.id === value)?.id ?? 'overview';
}
