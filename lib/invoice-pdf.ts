import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage, PDFPage } from 'pdf-lib';

interface InvoiceOrderItem {
  product_name: string;
  size?: string | null;
  color?: string | null;
  image_url?: string | null;
  quantity: number;
  price: number;
}

interface InvoiceOrder {
  id: string;
  created_at: string;
  items: InvoiceOrderItem[];
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: {
    address?: string;
    address2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  } | null;
  subtotal: number | null;
  coupon_code: string | null;
  coupon_discount: number | null;
  shipping_charge: number | null;
  gst_amount: number | null;
  total_amount: number;
  payment_method?: string | null; // 'cod' | 'online' | 'partial'
  // Partial Pay only: advance already paid online / balance to pay on delivery.
  advance_amount?: number | null;
  balance_due?: number | null;
  advance_paid_at?: string | null;
  payment_status?: string | null; // 'pending' | 'paid' | 'cancelled' | 'completed' ...
}

interface StoreInfo {
  name?: string;
  address?: string;
  gstin?: string;
  support_email?: string;
  support_phone?: string;
}

/** Preview of what THIS order earns toward the next purchase -- computed by
 * the caller from the loyalty_program setting, same formula already shown
 * on the order-confirmation and track pages. Points aren't actually
 * credited until the order is delivered (see lib/loyalty-api.ts), so the
 * PDF phrases this as "you'll earn", never "you have earned". */
interface LoyaltyPreview {
  pointsEarned: number;
  redeemValuePerPoint: number;
}

const rupee = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

// Matches the site's brand palette (app/globals.css --primary / --secondary)
const PRIMARY = rgb(0.45, 0.11, 0.2); // wine/maroon
const SECONDARY = rgb(0.86, 0.67, 0.18); // gold
const MUTED = rgb(0.45, 0.45, 0.45);
const BLACK = rgb(0.12, 0.12, 0.12);
const CREAM = rgb(0.98, 0.96, 0.92);
const LINE = rgb(0.85, 0.82, 0.76);
const WHITE = rgb(1, 1, 1);

/** Greedy word-wrap using actual glyph widths, capped at maxLines (last line ellipsized). */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // If we broke out early because we hit maxLines, make sure the last
  // line reflects it wasn't the full string -- ellipsize if truncated.
  const consumed = lines.join(' ').length;
  if (consumed < text.length && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (font.widthOfTextAtSize(`${last}...`, size) > maxWidth && last.length > 0) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}...`;
  }
  return lines.length ? lines : [''];
}

/** Fetches a product image and embeds it in the doc. Returns null (never
 * throws) on any network/format failure so a broken image URL can't take
 * the whole invoice down -- caller draws a placeholder swatch instead. */
async function tryEmbedRemoteImage(doc: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('png') || url.toLowerCase().endsWith('.png')) {
      try {
        return await doc.embedPng(bytes);
      } catch {
        return await doc.embedJpg(bytes);
      }
    }
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return await doc.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

/** Draws a product image scaled/cropped to fill a square box, or a plain
 * lettered swatch as a graceful fallback when no image was embeddable. */
function drawImageBox(
  page: PDFPage,
  image: PDFImage | null,
  fallbackLetter: string,
  x: number,
  y: number,
  boxSize: number
) {
  page.drawRectangle({ x, y, width: boxSize, height: boxSize, color: CREAM, borderColor: LINE, borderWidth: 0.75 });

  if (!image) {
    page.drawText(fallbackLetter, {
      x: x + boxSize / 2 - 5,
      y: y + boxSize / 2 - 6,
      size: 14,
      color: MUTED,
    });
    return;
  }

  const scale = Math.max(boxSize / image.width, boxSize / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;

  page.drawImage(image, {
    x: x - (drawW - boxSize) / 2,
    y: y - (drawH - boxSize) / 2,
    width: drawW,
    height: drawH,
  });
  // Re-stroke the border on top so the (possibly overflowing) image is
  // visually clipped to a clean-edged square.
  page.drawRectangle({ x, y, width: boxSize, height: boxSize, borderColor: LINE, borderWidth: 0.75 });
}

/**
 * Renders a premium, single-page GST invoice as a PDF and returns the raw
 * bytes: product thumbnails, full (wrapped) product names with colour/size,
 * a two-tone brand wordmark matching the storefront, and an optional
 * reward-points preview banner.
 */
export async function generateInvoicePdf(
  order: InvoiceOrder,
  store: StoreInfo,
  loyalty?: LoyaltyPreview | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const margin = 48;
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = pageHeight - margin;

  const draw = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(text, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? BLACK });
  };

  const hLine = (yPos: number, color = LINE, thickness = 0.75, x1 = margin, x2 = pageWidth - margin) => {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness, color });
  };

  // ---- Top brand accent strip ----
  page.drawRectangle({ x: 0, y: pageHeight - 6, width: pageWidth * 0.62, height: 6, color: PRIMARY });
  page.drawRectangle({
    x: pageWidth * 0.62,
    y: pageHeight - 6,
    width: pageWidth * 0.38,
    height: 6,
    color: SECONDARY,
  });
  y -= 14;

  // ---- Header: two-tone wordmark (matches the site header's "Aruhi" +
  // "Handlooms" styling in components/header.tsx) + tax invoice badge ----
  const brandName = store.name || 'AruhiHandlooms';
  const knownSuffix = ['Handlooms', 'Handloom'].find((s) => brandName.toLowerCase().endsWith(s.toLowerCase()));
  const brandFirst = knownSuffix ? brandName.slice(0, brandName.length - knownSuffix.length) : brandName;
  const brandSecond = knownSuffix ? brandName.slice(brandName.length - knownSuffix.length) : '';
  draw(brandFirst, margin, y, { size: 22, f: serifBold, color: PRIMARY });
  draw(brandSecond, margin + serifBold.widthOfTextAtSize(brandFirst, 22), y, {
    size: 22,
    f: serifBold,
    color: SECONDARY,
  });
  y -= 18;
  if (store.address) {
    draw(store.address, margin, y, { size: 8.5, color: MUTED });
    y -= 11;
  }
  if (store.gstin) {
    draw(`GSTIN: ${store.gstin}`, margin, y, { size: 8.5, color: MUTED });
  }

  const badgeW = 118;
  const badgeX = pageWidth - margin - badgeW;
  const badgeY = pageHeight - margin - 30;
  page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: 24, color: PRIMARY });
  draw('TAX INVOICE', badgeX + 14, badgeY + 8, { size: 10.5, f: bold, color: WHITE });
  draw(`Invoice #: ${order.id.slice(0, 8).toUpperCase()}`, badgeX - 8, badgeY - 16, { size: 8.5, color: MUTED });
  draw(
    `Date: ${new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`,
    badgeX - 8,
    badgeY - 28,
    { size: 8.5, color: MUTED }
  );

  // ---- Payment method / status badge ----
  // Answers "COD ya prepaid?" at a glance -- COD in amber (money still to
  // collect), prepaid-and-paid in green, prepaid-but-unpaid in red.
  const isCod = (order.payment_method || '').toLowerCase() === 'cod';
  const status = (order.payment_status || '').toLowerCase();
  let payLabel: string;
  let payColor: ReturnType<typeof rgb>;
  const isPartialPay = (order.payment_method || '').toLowerCase() === 'partial';
  if (isPartialPay) {
    payLabel = order.advance_paid_at ? 'PARTIAL PAY · ADVANCE PAID' : 'PARTIAL PAY · ADVANCE PENDING';
    payColor = order.advance_paid_at ? rgb(0.72, 0.45, 0.05) : rgb(0.6, 0.15, 0.15);
  } else if (isCod) {
    payLabel = 'CASH ON DELIVERY';
    payColor = rgb(0.72, 0.45, 0.05);
  } else if (status === 'paid' || status === 'completed') {
    payLabel = 'PREPAID · PAID';
    payColor = rgb(0.14, 0.5, 0.28);
  } else if (status === 'cancelled') {
    payLabel = 'PREPAID · CANCELLED';
    payColor = rgb(0.6, 0.15, 0.15);
  } else {
    payLabel = 'PREPAID · PAYMENT PENDING';
    payColor = rgb(0.6, 0.15, 0.15);
  }
  const payLabelW = bold.widthOfTextAtSize(payLabel, 8) + 16;
  const payY = badgeY - 52;
  page.drawRectangle({
    x: badgeX + badgeW - payLabelW,
    y: payY,
    width: payLabelW,
    height: 15,
    color: payColor,
  });
  draw(payLabel, badgeX + badgeW - payLabelW + 8, payY + 4.5, { size: 8, f: bold, color: WHITE });

  // Divider must clear whichever column (address block or payment badge
  // stack) extends further down, not just the left column's y.
  y = Math.min(y, payY) - 14;
  hLine(y, PRIMARY, 1.25);
  y -= 22;

  // ---- Billing / shipping (soft card) ----
  const billCardTop = y;
  const addr = order.shipping_address;
  const addrLines: string[] = [];
  if (addr) {
    const line1 = [addr.address, addr.address2].filter(Boolean).join(', ');
    if (line1) addrLines.push(line1);
    if (addr.landmark) addrLines.push(`Landmark: ${addr.landmark}`);
    const line2 = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (line2) addrLines.push(line2);
  }
  if (order.customer_phone) addrLines.push(`Phone: ${order.customer_phone}`);
  if (order.customer_email) addrLines.push(`Email: ${order.customer_email}`);

  // Box must fit: header line (14) + name line (13) + one line per
  // address/phone/email row (12 each) + bottom padding (10) -- the old
  // fixed "26 +" constant was short, which let the last line (usually the
  // email) spill outside the cream background.
  const cardHeight = 14 + 13 + addrLines.length * 12 + 10;
  page.drawRectangle({ x: margin, y: billCardTop - cardHeight, width: contentWidth, height: cardHeight, color: CREAM });
  page.drawRectangle({ x: margin, y: billCardTop - cardHeight, width: 3, height: cardHeight, color: SECONDARY });

  let by = billCardTop - 14;
  draw('BILLED & SHIPPED TO', margin + 14, by, { size: 8.5, f: bold, color: PRIMARY });
  by -= 13;
  draw(order.customer_name || '-', margin + 14, by, { size: 9.5, f: bold });
  by -= 12;
  for (const line of addrLines) {
    draw(line, margin + 14, by, { size: 8.5, color: MUTED });
    by -= 12;
  }

  y = billCardTop - cardHeight - 20;

  // ---- Items table header ----
  const imgSize = 34;
  const colImage = margin;
  const colName = margin + imgSize + 12;
  const colAmount = pageWidth - margin - 62;
  const colPrice = colAmount - 66;
  const colQty = colPrice - 40;
  const nameColWidth = colQty - colName - 10;

  page.drawRectangle({ x: margin, y: y - 6, width: contentWidth, height: 20, color: PRIMARY });
  draw('Product', colName, y, { size: 8.5, f: bold, color: WHITE });
  draw('Qty', colQty, y, { size: 8.5, f: bold, color: WHITE });
  draw('Price', colPrice, y, { size: 8.5, f: bold, color: WHITE });
  draw('Amount', colAmount, y, { size: 8.5, f: bold, color: WHITE });
  y -= 20;

  let rowIndex = 0;
  for (const item of order.items) {
    if (y < 210) break; // guard against absurdly long carts overflowing the page

    // Defensive fallbacks: an order placed against a product that was later
    // deleted/edited, or an older/legacy order row, can have an item with a
    // missing product_name, price, or quantity. Without these fallbacks a
    // single bad item (e.g. on a cancelled order) throws mid-PDF and the
    // whole invoice download fails with a generic error.
    const productName = (item.product_name && String(item.product_name).trim()) || 'Item';
    const price = Number.isFinite(item.price) ? item.price : 0;
    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;

    const amount = price * quantity;
    const nameLines = wrapText(productName, bold, 9.5, nameColWidth, 2);
    const variantBits = [item.color ? `Color: ${item.color}` : null, item.size ? `Size: ${item.size}` : null].filter(
      Boolean
    );
    const rowHeight = Math.max(imgSize + 8, nameLines.length * 12 + (variantBits.length ? 12 : 0) + 14);

    if (rowIndex % 2 === 1) {
      page.drawRectangle({ x: margin, y: y - rowHeight, width: contentWidth, height: rowHeight, color: CREAM });
    }

    // eslint-disable-next-line no-await-in-loop -- sequential is fine for a handful of order items
    const image = await tryEmbedRemoteImage(doc, item.image_url);
    drawImageBox(page, image, productName.charAt(0).toUpperCase() || '?', colImage, y - imgSize - 4, imgSize);

    let ny = y - 12;
    for (const line of nameLines) {
      draw(line, colName, ny, { size: 9.5, f: bold });
      ny -= 12;
    }
    if (variantBits.length) {
      draw(variantBits.join('  ·  '), colName, ny, { size: 8, color: MUTED });
    }

    const numY = y - 12;
    draw(String(quantity), colQty, numY, { size: 9 });
    draw(rupee(price), colPrice, numY, { size: 9 });
    draw(rupee(amount), colAmount, numY, { size: 9, f: bold });

    y -= rowHeight;
    hLine(y, LINE, 0.5);
    y -= 14;
    rowIndex++;
  }

  y -= 6;

  // ---- Totals card ----
  const totalsW = 210;
  const totalsX = pageWidth - margin - totalsW;
  const subtotal =
    order.subtotal ??
    order.items.reduce((s, i) => s + (Number.isFinite(i.price) ? i.price : 0) * (Number.isFinite(i.quantity) ? i.quantity : 0), 0);

  const rows: Array<[string, string, boolean?]> = [['Subtotal', rupee(subtotal)]];
  if (order.coupon_discount && order.coupon_discount > 0) {
    const code = order.coupon_code || '';
    const label = code.length > 14 ? `Coupon (${code.slice(0, 12)}...)` : `Coupon (${code})`;
    rows.push([label, `-${rupee(order.coupon_discount)}`]);
  }
  rows.push(['Shipping', order.shipping_charge ? rupee(order.shipping_charge) : 'FREE']);
  rows.push(['GST (included)', rupee(order.gst_amount ?? 0)]);
  if (isPartialPay) {
    rows.push(['Advance paid online', rupee(Number(order.advance_amount ?? 0))]);
    rows.push(['Balance on delivery', rupee(Number(order.balance_due ?? 0))]);
  }

  const totalsCardHeight = rows.length * 16 + 34;
  page.drawRectangle({
    x: totalsX,
    y: y - totalsCardHeight,
    width: totalsW,
    height: totalsCardHeight,
    color: CREAM,
    borderColor: LINE,
    borderWidth: 0.75,
  });

  let ty = y - 14;
  for (const [label, value] of rows) {
    draw(label, totalsX + 12, ty, { size: 9, color: MUTED });
    draw(value, totalsX + totalsW - 12 - font.widthOfTextAtSize(value, 9), ty, { size: 9 });
    ty -= 16;
  }
  ty -= 2;
  hLine(ty, LINE, 0.75, totalsX + 12, totalsX + totalsW - 12);
  ty -= 18;

  page.drawRectangle({ x: totalsX, y: ty - 6, width: totalsW, height: 22, color: PRIMARY });
  draw('Total', totalsX + 12, ty, { size: 11, f: bold, color: WHITE });
  const totalStr = rupee(order.total_amount);
  draw(totalStr, totalsX + totalsW - 12 - bold.widthOfTextAtSize(totalStr, 11), ty, {
    size: 11,
    f: bold,
    color: WHITE,
  });

  y = y - totalsCardHeight - 22;

  // ---- Reward points preview banner ----
  if (loyalty && loyalty.pointsEarned > 0) {
    const bannerHeight = 34;
    page.drawRectangle({
      x: margin,
      y: y - bannerHeight,
      width: contentWidth,
      height: bannerHeight,
      color: rgb(0.99, 0.95, 0.85),
      borderColor: SECONDARY,
      borderWidth: 1,
    });
    const pointsValue = Math.round(loyalty.pointsEarned * loyalty.redeemValuePerPoint);
    draw('*', margin + 14, y - 21, { size: 14, f: bold, color: SECONDARY });
    draw(`You'll earn ${loyalty.pointsEarned} reward points on successful delivery`, margin + 28, y - 14, {
      size: 9.5,
      f: bold,
      color: PRIMARY,
    });
    draw(
      `Worth ~${rupee(pointsValue)} — automatically usable toward your next order.`,
      margin + 28,
      y - 26,
      { size: 8.5, color: MUTED }
    );
    y -= bannerHeight + 16;
  }

  // ---- Footer ----
  const footerY = 56;
  hLine(footerY + 22, LINE, 0.75);
  draw('Thank you for shopping with us!', margin, footerY + 6, { size: 9, f: bold, color: PRIMARY });
  draw('This is a computer-generated invoice and does not require a signature.', margin, footerY - 6, {
    size: 8,
    color: MUTED,
  });
  if (store.support_email || store.support_phone) {
    draw(
      `Questions? ${store.support_email || ''} ${store.support_phone ? `· ${store.support_phone}` : ''}`.trim(),
      margin,
      footerY - 18,
      { size: 8, color: MUTED }
    );
  }

  return doc.save();
}
