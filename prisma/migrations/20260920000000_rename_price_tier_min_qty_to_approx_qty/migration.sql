-- Rename, not drop+add — `minQty` held real data (43 non-null rows) and was
-- never actually a purchase minimum in practice, just an approximate
-- quantity-per-unit conversion; the column is renamed to match, values kept.
ALTER TABLE "ProductPriceTier" RENAME COLUMN "minQty" TO "approxQty";
