import { notFound } from 'next/navigation';
import { getStockLedger } from '@/actions/inventory';
import { LedgerClient } from './ledger-client';

export const dynamic = 'force-dynamic';

export default async function StockLedgerPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const ledger = await getStockLedger(productId, { page: 1 });
  if (!ledger) notFound();
  return <LedgerClient key={productId} productId={productId} initialData={ledger} />;
}
