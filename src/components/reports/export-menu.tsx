'use client';

import { useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  DatabaseBackup,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Landmark,
  ListOrdered,
  Package,
  Printer,
  Settings2,
  ShoppingCart,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/components/current-user';
import { downloadFile, rangeQuery } from './download-file';
import { TallyDialog } from './tally-dialog';
import { Gstr1Dialog } from './gstr1-dialog';
import { MonthlyReportDialog } from './monthly-report-dialog';

const CSV_EXPORTS: { kind: string; label: string; icon: LucideIcon; snapshot?: boolean }[] = [
  { kind: 'invoices', label: 'Invoices', icon: FileText },
  { kind: 'invoice-items', label: 'Invoice items', icon: ListOrdered },
  { kind: 'payments', label: 'Payments', icon: Wallet },
  { kind: 'credit-notes', label: 'Credit notes', icon: Undo2 },
  { kind: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { kind: 'stock-movements', label: 'Stock movements', icon: ArrowLeftRight },
  { kind: 'customers', label: 'Customers', icon: Users, snapshot: true },
  { kind: 'products', label: 'Products + stock', icon: Package, snapshot: true },
];

/** The Reports page's one "Export" button. Everything that leaves the app
 * lives behind it — Excel (CSV) sheets for the selected date range, GSTR-1
 * files for the GST portal, the monthly report PDF, Tally XML, a full
 * backup, and printing the page — so the header stays one button wide. The data exports are owner-only (the routes check again);
 * staff just get Print. */
export function ExportMenu({ range, rangeLabel }: { range: { from?: string; to?: string }; rangeLabel: string }) {
  const { isOwner } = useCurrentUser();
  const [tallyOpen, setTallyOpen] = useState(false);
  const [gstr1Open, setGstr1Open] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  function run(url: string, fallbackName: string, what: string) {
    toast.promise(downloadFile(url, fallbackName), {
      loading: `Preparing ${what}…`,
      success: `${what[0].toUpperCase()}${what.slice(1)} downloaded`,
      error: (e: unknown) => (e instanceof Error ? e.message : 'Download failed.'),
    });
  }

  if (!isOwner) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer size={13} /> Print
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Download size={13} /> Export <ChevronDown size={12} className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[230px]">
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <FileSpreadsheet size={12} /> Excel (CSV) · {rangeLabel}
          </DropdownMenuLabel>
          {CSV_EXPORTS.map((e) => (
            <DropdownMenuItem
              key={e.kind}
              onSelect={() => run(`/api/export/${e.kind}${e.snapshot ? '' : rangeQuery(range)}`, `asb-${e.kind}.csv`, e.label.toLowerCase())}
            >
              <e.icon size={14} className="text-ink-faint" />
              {e.label}
              {e.snapshot && <span className="ml-auto text-[10.5px] font-medium text-ink-faint">today</span>}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>GST &amp; reports</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setGstr1Open(true)}>
            <Landmark size={14} className="text-ink-faint" /> GSTR-1 for the GST portal…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMonthlyOpen(true)}>
            <FileText size={14} className="text-ink-faint" /> Monthly report PDF…
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Tally · {rangeLabel}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => run(`/api/export/tally${rangeQuery(range)}`, 'asb-tally-vouchers.xml', 'Tally vouchers')}>
            <FileCode2 size={14} className="text-ink-faint" /> Tally vouchers (XML)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTallyOpen(true)}>
            <Settings2 size={14} className="text-ink-faint" /> Tally ledger names…
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run('/api/export/backup', 'asb-backup.json.gz', 'backup')}>
            <DatabaseBackup size={14} className="text-ink-faint" /> Download backup
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.print()}>
            <Printer size={14} className="text-ink-faint" /> Print this page
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TallyDialog open={tallyOpen} onOpenChange={setTallyOpen} range={range} />
      <Gstr1Dialog open={gstr1Open} onOpenChange={setGstr1Open} range={range} rangeLabel={rangeLabel} />
      <MonthlyReportDialog open={monthlyOpen} onOpenChange={setMonthlyOpen} />
    </>
  );
}
