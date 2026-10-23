import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ---------------------------------------------------------------------
// Vendor Pickup Slip -- NOT a customer invoice.
//
// A vendor ships stock TO our warehouse, never to the end customer, so
// this document deliberately contains ZERO customer data (no name, no
// phone, no email, no shipping address). "Ship To" is always OUR
// warehouse/pickup address (same one configured in Admin -> Settings ->
// Delhivery, and already shown as plain text on the vendor dashboard's
// "Ship to" line). This mirrors the same customer-data masking guarantee
// already enforced at the query level in app/api/vendor/orders/route.ts.
// ---------------------------------------------------------------------

interface PickupSlipItem {
  order_item_id: string;
  order_id: string;
  product_name: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  created_at: string;
}

interface WarehouseInfo {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
}

interface StoreInfo {
  name?: string;
}

interface VendorInfo {
  name?: string;
  id?: string;
}

const rupee = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;

/**
 * Renders a single-item pickup slip -- what a vendor hands to the
 * pickup courier (or keeps for their own records) confirming what stock
 * is being sent to OUR warehouse for a specific order. Deliberately
 * plain, single-font layout, same style as invoice-pdf.ts.
 */
export async function generateVendorPickupSlipPdf(
  item: PickupSlipItem,
  warehouse: WarehouseInfo,
  vendor: VendorInfo,
  store: StoreInfo
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 419.53]); // A5 landscape-ish, this is a slip not a full invoice
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const pageWidth = page.getWidth();
  let y = page.getHeight() - margin;

  const primary = rgb(0.49, 0.23, 0.11);
  const muted = rgb(0.45, 0.45, 0.45);
  const black = rgb(0.1, 0.1, 0.1);

  const draw = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.f ?? font,
      color: opts.color ?? black,
    });
  };

  // ---- Header ----
  draw(store.name || 'AruhiHandlooms', margin, y, { size: 18, f: bold, color: primary });
  y -= 20;
  draw('VENDOR PICKUP SLIP', margin, y, { size: 11, f: bold, color: muted });

  draw(`Ref: ${item.order_item_id.slice(0, 8).toUpperCase()}`, pageWidth - margin - 160, page.getHeight() - margin, {
    size: 9,
  });
  draw(
    `Order: #${item.order_id.slice(0, 8).toUpperCase()}`,
    pageWidth - margin - 160,
    page.getHeight() - margin - 14,
    { size: 9 }
  );
  draw(
    `Date: ${new Date(item.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`,
    pageWidth - margin - 160,
    page.getHeight() - margin - 28,
    { size: 9 }
  );

  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
  y -= 22;

  // ---- From (vendor) / Ship To (OUR warehouse -- never the customer) ----
  const colLeft = margin;
  const colRight = pageWidth / 2 + 10;
  const sectionTopY = y;

  draw('From (Vendor)', colLeft, y, { size: 9, f: bold, color: primary });
  draw('Ship To (Our Warehouse)', colRight, y, { size: 9, f: bold, color: primary });
  y -= 14;
  draw(vendor.name || 'Vendor', colLeft, y, { size: 9 });
  draw(warehouse.name || store.name || 'Warehouse', colRight, y, { size: 9 });
  y -= 12;

  let leftY = y;
  let rightY = y;
  if (warehouse.address) {
    draw(warehouse.address, colRight, rightY, { size: 9, color: muted });
    rightY -= 12;
  }
  const whLine2 = [warehouse.city, warehouse.state, warehouse.pincode].filter(Boolean).join(', ');
  if (whLine2) {
    draw(whLine2, colRight, rightY, { size: 9, color: muted });
    rightY -= 12;
  }
  if (warehouse.phone) {
    draw(`Phone: ${warehouse.phone}`, colRight, rightY, { size: 9, color: muted });
    rightY -= 12;
  }

  y = Math.min(leftY, rightY) - 10;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
  y -= 22;

  // ---- Item table (single item -- one pickup slip per order item) ----
  const col = { item: margin, barcode: 280, qty: 400, price: 460 };
  draw('Product', col.item, y, { size: 9, f: bold });
  draw('Barcode', col.barcode, y, { size: 9, f: bold });
  draw('Qty', col.qty, y, { size: 9, f: bold });
  draw('Price', col.price, y, { size: 9, f: bold });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
  y -= 18;

  const name = item.product_name.length > 34 ? `${item.product_name.slice(0, 31)}...` : item.product_name;
  draw(name, col.item, y, { size: 9 });
  draw(item.barcode || '-', col.barcode, y, { size: 8, f: font });
  draw(String(item.quantity), col.qty, y, { size: 9 });
  draw(rupee(item.price), col.price, y, { size: 9 });
  y -= 26;

  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
  y -= 22;

  draw(
    'This slip is for internal warehouse pickup use only. It contains no customer information.',
    margin,
    y,
    { size: 8, color: muted }
  );
  y -= 12;
  draw('Please hand this stock, with this slip, to the pickup courier.', margin, y, { size: 8, color: muted });

  return doc.save();
}
