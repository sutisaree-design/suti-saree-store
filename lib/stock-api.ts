import { supabase } from './supabase';

/**
 * Nothing in the codebase ever reduced `stock_quantity` after an order was
 * placed — checkout wrote the order row and stopped there, so the number
 * shown on the product page (and in the admin stock list) never moved no
 * matter how many units sold. This is called right after an order is
 * successfully created (both COD and paid orders, in app/checkout/page.tsx)
 * to actually deduct what was just bought.
 *
 * Each order item only carries product_id/color/size/quantity (no
 * variant_id — see the `orderItems` mapping in app/checkout/page.tsx), so a
 * colour is matched back to its `product_variants` row by product_id +
 * colour name, and from there to the specific `product_variant_sizes` row
 * for that size. Both the size-level stock and the parent product's
 * aggregate stock_quantity are updated so the swatch page and the plain
 * product page both reflect the sale. Items with no matching variant
 * (plain, non-variation products) just decrement the product row directly.
 */
export interface OrderStockItem {
  product_id: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
}

async function decrementProductRow(productId: string, quantity: number) {
  const { data: product, error } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .maybeSingle();
  if (error || !product) return;

  const nextStock = Math.max(0, (product.stock_quantity ?? 0) - quantity);
  await supabase
    .from('products')
    .update({ stock_quantity: nextStock, in_stock: nextStock > 0 })
    .eq('id', productId);
}

async function decrementVariantSize(variantId: string, size: string, quantity: number) {
  const { data: sizeRow, error } = await supabase
    .from('product_variant_sizes')
    .select('id, stock_quantity')
    .eq('variant_id', variantId)
    .eq('size', size)
    .maybeSingle();
  if (error || !sizeRow) return false;

  const nextStock = Math.max(0, (sizeRow.stock_quantity ?? 0) - quantity);
  await supabase
    .from('product_variant_sizes')
    .update({ stock_quantity: nextStock })
    .eq('id', sizeRow.id);
  return true;
}

/**
 * Best-effort — called right after an order row is inserted. A failure here
 * shouldn't block order confirmation (the order is already placed), so
 * callers should not await this on the critical path in a way that fails
 * the checkout; errors are swallowed per-item and logged instead.
 */
export async function decrementStockForOrder(items: OrderStockItem[]): Promise<void> {
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity <= 0) continue;
    try {
      let handledAtVariantLevel = false;
      if (item.color && item.size) {
        const { data: variant } = await supabase
          .from('product_variants')
          .select('id')
          .eq('product_id', item.product_id)
          .ilike('color', item.color)
          .maybeSingle();
        if (variant) {
          handledAtVariantLevel = await decrementVariantSize(variant.id, item.size, item.quantity);
        }
      }
      // Always keep the parent product's aggregate stock in sync too — the
      // plain product page (and admin low-stock list) read from here.
      await decrementProductRow(item.product_id, item.quantity);
      void handledAtVariantLevel;
    } catch (err) {
      console.error('Failed to decrement stock for item', item, err);
    }
  }
}
