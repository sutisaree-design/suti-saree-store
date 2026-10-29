// scripts/import-legacy-reviews.mjs
//
// Purane WooCommerce MySQL dump se approved product reviews -> Supabase `reviews`.
//
// DEFAULT = DRY RUN: dump padhta hai, counts dikhata hai. Kuch likha/upload nahi hota.
//           Agar SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set hain to products ko
//           sirf READ karke SKU mapping bhi check karta hai.
// --write   : asli import (reviews insert + photos upload).
// --limit=N : sirf pehle N reviews (chhota test).
// --only=ID,ID : sirf ye comment IDs (jaise --only=4,1611 -> ek bina photo, ek photo wala).
// --photos=DIR : review photos folder (default C:\backup\feedcheck\review_photos,
//                usme _map.csv hona chahiye: comment id -> file name).
//
// Duplicate se bachav: legacy_wc_comment_id pe unique index (migration
// 20261029000000_reviews_legacy_wc_comment_id.sql pehle Supabase me run karo).
// Jo review pehle import ho chuka hai wo skip hota hai, overwrite nahi.
//
// Usage (CMD, repo folder me):
//   node scripts\import-legacy-reviews.mjs "<dump.sql>"
//   node scripts\import-legacy-reviews.mjs "<dump.sql>" --write --limit=5
//   node scripts\import-legacy-reviews.mjs "<dump.sql>" --write
//
// Env (CMD session me):
//   set SUPABASE_URL=...            (NEXT_PUBLIC_SUPABASE_URL bhi chalega)
//   set SUPABASE_SERVICE_ROLE_KEY=...
//   set NEXT_PUBLIC_SITE_URL=https://www.sutisaree.com   (optional)
//
// Ye script customer ka naam/email/comment text kahin print nahi karti.
// Email import hi nahi hota (guest_email se reward mail chal sakti hai).

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const DUMP = args.find((a) => !a.startsWith('--'));
const WRITE = args.includes('--write');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map((x) => x.trim()).filter(Boolean)) : null;
const photosArg = args.find((a) => a.startsWith('--photos='));
const PHOTOS_DIR = photosArg ? photosArg.slice('--photos='.length) : 'C:\\backup\\feedcheck\\review_photos';

if (!DUMP) {
  console.error('Usage: node scripts\\import-legacy-reviews.mjs "<dump.sql>" [--write] [--limit=N] [--photos=DIR]');
  process.exit(1);
}

const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');
const HAVE_SB = !!(SB_URL && SB_KEY);
if (WRITE && !HAVE_SB) {
  console.error('--write ke liye SUPABASE_URL (ya NEXT_PUBLIC_SUPABASE_URL) aur SUPABASE_SERVICE_ROLE_KEY set karo.');
  process.exit(1);
}

// ---------- MySQL dump parser ----------
const ESC = { n: '\n', r: '\r', t: '\t', '0': '', Z: '\x1a', b: '\b' };
const text = fs.readFileSync(DUMP, 'utf8');
console.log('Dump padh liya, size (MB):', (text.length / 1048576).toFixed(1));

// Table-suffix ke har INSERT ki rows. cols null ho sakta hai (mysqldump bina column list).
function* rows(suffix) {
  const re = new RegExp('INSERT INTO `([A-Za-z0-9_]*' + suffix + ')`\\s*(\\([^)]*\\))?\\s*VALUES\\s*', 'g');
  let m;
  const n = text.length;
  while ((m = re.exec(text))) {
    const cols = m[2] ? m[2].replace(/[()`\s]/g, '').split(',') : null;
    let i = re.lastIndex;
    while (i < n) {
      while (i < n && /[\s,]/.test(text[i])) i++;
      if (text[i] === ';') { i++; break; }
      if (text[i] !== '(') break;
      i++;
      const vals = [];
      while (i < n) {
        while (text[i] === ' ') i++;
        let v;
        if (text[i] === "'") {
          i++;
          let s = '';
          while (i < n) {
            const c = text[i];
            if (c === '\\') { const e = text[i + 1]; s += e in ESC ? ESC[e] : e; i += 2; continue; }
            if (c === "'") {
              if (text[i + 1] === "'") { s += "'"; i += 2; continue; }
              i++; break;
            }
            s += c; i++;
          }
          v = s;
        } else {
          let j = i;
          while (j < n && text[j] !== ',' && text[j] !== ')') j++;
          v = text.slice(i, j).trim();
          if (v === 'NULL') v = null;
          i = j;
        }
        vals.push(v);
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ')') { i++; break; }
      }
      yield { cols, vals };
    }
    re.lastIndex = i;
  }
}

// Default WordPress column order (jab dump me column list na ho).
const COMMENTS_COLS = ['comment_ID', 'comment_post_ID', 'comment_author', 'comment_author_email', 'comment_author_url',
  'comment_author_IP', 'comment_date', 'comment_date_gmt', 'comment_content', 'comment_karma', 'comment_approved',
  'comment_agent', 'comment_type', 'comment_parent', 'user_id'];
const COMMENTMETA_COLS = ['meta_id', 'comment_id', 'meta_key', 'meta_value'];
const POSTMETA_COLS = ['meta_id', 'post_id', 'meta_key', 'meta_value'];

function asObj(r, defCols) {
  const cols = r.cols || defCols;
  const o = {};
  for (let k = 0; k < cols.length; k++) o[cols[k]] = r.vals[k];
  return o;
}

// Pass 1: approved comments
const comments = new Map(); // id -> {postId, name, date, content, parent}
const allStatus = new Map(); // har comment ka status (sirf diagnostics ke liye)
let totalComments = 0;
for (const r of rows('comments')) {
  if (r.vals.length < 15 && !r.cols) continue;
  const o = asObj(r, COMMENTS_COLS);
  totalComments++;
  allStatus.set(o.comment_ID, { approved: o.comment_approved, type: o.comment_type, parent: o.comment_parent, post: o.comment_post_ID });
  if (o.comment_approved !== '1') continue;
  comments.set(o.comment_ID, {
    id: o.comment_ID, postId: o.comment_post_ID, name: (o.comment_author || '').trim(),
    dateGmt: o.comment_date_gmt, date: o.comment_date, content: o.comment_content || '',
    parent: o.comment_parent,
  });
}
console.log('wp_comments rows:', totalComments, '| approved:', comments.size);

// Pass 2: rating / verified meta
const rating = new Map(), verified = new Map();
// Review photos ka link: in meta_keys me photo (attachment) ki WordPress ID hoti hai.
// (find-review-photo-links.mjs se confirm hua: reviewx_attachments, ivole_review_image2)
const PHOTO_META_KEYS = new Set(['reviewx_attachments', 'ivole_review_image2']);
const photoMeta = []; // {cid, val}
for (const r of rows('commentmeta')) {
  const o = asObj(r, COMMENTMETA_COLS);
  if (!comments.has(o.comment_id)) continue;
  if (o.meta_key === 'rating') rating.set(o.comment_id, parseInt(o.meta_value, 10));
  else if (o.meta_key === 'verified') verified.set(o.comment_id, o.meta_value === '1');
  else if (PHOTO_META_KEYS.has(o.meta_key) && o.meta_value && o.meta_value.length < 5000) photoMeta.push({ cid: o.comment_id, val: o.meta_value });
}

// Review = approved + rating meta wala. (Admin replies / blog comments me rating nahi hoti.)
let reviews = [...comments.values()].filter((c) => rating.has(c.id));
console.log('Approved reviews (rating ke saath):', reviews.length);

// Pass 3: SKU of each product post
const postIds = new Set(reviews.map((r) => r.postId));
const skuByPost = new Map();
for (const r of rows('postmeta')) {
  const o = asObj(r, POSTMETA_COLS);
  if (o.meta_key === '_sku' && postIds.has(o.post_id) && o.meta_value) skuByPost.set(o.post_id, o.meta_value.trim());
}

// ---------- photos map ----------
function parseCsv(s) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); out.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); out.push(row); }
  return out.filter((r) => r.some((x) => x !== ''));
}

const photosByComment = new Map(); // comment id -> [file names]
const fileByAttachment = new Map(); // photo (attachment) post ID -> local file name
const mapFile = path.join(PHOTOS_DIR, '_map.csv');
let missingPhotoFiles = 0;
if (fs.existsSync(mapFile)) {
  const csv = parseCsv(fs.readFileSync(mapFile, 'utf8').replace(/^\uFEFF/, ''));
  // _map.csv ka format: header ke bina bhi chalta hai.
  //   bina header: comment_id, purana path (2025/11/x.jpg), local file name (2025__11__x.jpg)
  //   header ke saath: "comment" wala column + "file/name/path" wala column
  const first = csv[0] || [];
  const hasHeader = !/^\d+$/.test((first[0] || '').trim());
  let rowsCsv = csv, cIdx = 0, fIdxs = [2, 1];
  if (hasHeader) {
    const header = first.map((h) => h.trim().toLowerCase());
    cIdx = header.findIndex((h) => /comment/.test(h));
    const f = header.findIndex((h) => /(file|name|path)/.test(h) && !/comment/.test(h));
    if (cIdx < 0 || f < 0) {
      console.error('_map.csv ke header samajh nahi aaye. Header ke column naam:', JSON.stringify(first));
      process.exit(1);
    }
    fIdxs = [f];
    rowsCsv = csv.slice(1);
  }
  for (const r of rowsCsv) {
    const cid = (r[cIdx] || '').trim();
    if (!cid) continue;
    // pehle local naam (col 3) try karo, na mile to purane path ka naam (col 2)
    let found = null;
    for (const fi of fIdxs) {
      const f = path.basename((r[fi] || '').trim().replace(/\\/g, '/'));
      if (f && fs.existsSync(path.join(PHOTOS_DIR, f))) { found = f; break; }
    }
    if (!found) { missingPhotoFiles++; continue; }
    fileByAttachment.set(cid, found); // pehla column = attachment post ID (comment ID nahi)
  }
  // Attachment ID -> review (comment) : commentmeta se
  for (const pm of photoMeta) {
    const nums = pm.val.match(/\d+/g) || [];
    for (const nn of nums) {
      const f = fileByAttachment.get(nn);
      if (!f) continue;
      if (!photosByComment.has(pm.cid)) photosByComment.set(pm.cid, []);
      if (!photosByComment.get(pm.cid).includes(f)) photosByComment.get(pm.cid).push(f);
    }
  }
  console.log('Photos map: photos =', fileByAttachment.size, '| approved reviews se juda =', photosByComment.size, '| map me file folder me nahi mili =', missingPhotoFiles);
} else {
  console.log('NOTE: _map.csv nahi mili (' + mapFile + '), photos skip honge.');
}

// ---------- Supabase REST (fetch, supabase-js nahi) ----------
const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
async function sb(method, url, body, extra = {}) {
  const res = await fetch(SB_URL + url, { method, headers: { ...H, ...extra }, body });
  if (!res.ok) throw new Error(method + ' ' + url.split('?')[0] + ' -> ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
async function fetchAll(table, select, filter = '') {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const page = await sb('GET', `/rest/v1/${table}?select=${select}${filter}&order=id`, undefined, { Range: `${from}-${from + 999}` });
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

const skuToProduct = new Map();
const alreadyImported = new Set();
if (HAVE_SB) {
  for (const p of await fetchAll('products', 'id,sku', '&sku=not.is.null')) skuToProduct.set(String(p.sku).trim().toLowerCase(), p.id);
  console.log('Naye products (SKU wale):', skuToProduct.size);
  try {
    for (const r of await fetchAll('reviews', 'id,legacy_wc_comment_id', '&legacy_wc_comment_id=not.is.null')) alreadyImported.add(String(r.legacy_wc_comment_id));
    console.log('Pehle se imported reviews:', alreadyImported.size);
  } catch (e) {
    console.error('reviews.legacy_wc_comment_id column nahi mila? Pehle migration 20261029000000_reviews_legacy_wc_comment_id.sql Supabase SQL Editor me run karo.\n', e.message);
    process.exit(1);
  }
} else {
  console.log('NOTE: Supabase env set nahi, isliye SKU->product mapping check nahi hui (sirf dump ke counts).');
}

// ---------- plan ----------
const skipped = { no_post_sku: [], sku_not_in_new_site: [], bad_rating: [], already_imported: [] };
const plan = [];
for (const r of reviews) {
  const rt = rating.get(r.id);
  if (!(rt >= 1 && rt <= 5)) { skipped.bad_rating.push(r.id); continue; }
  const sku = skuByPost.get(r.postId);
  if (!sku) { skipped.no_post_sku.push(r.id + '(post ' + r.postId + ')'); continue; }
  if (HAVE_SB) {
    if (!skuToProduct.has(sku.toLowerCase())) { skipped.sku_not_in_new_site.push(r.id + '(' + sku + ')'); continue; }
    if (alreadyImported.has(r.id)) { skipped.already_imported.push(r.id); continue; }
  }
  plan.push({ ...r, rating: rt, sku, productId: HAVE_SB ? skuToProduct.get(sku.toLowerCase()) : null });
}
const todo = ONLY ? plan.filter((p) => ONLY.has(p.id)) : LIMIT > 0 ? plan.slice(0, LIMIT) : plan;
if (ONLY) console.log('--only: maange gaye', ONLY.size, 'comment IDs, plan me mile', todo.length);

console.log('\n=== Plan ===');
console.log('Import ke liye ready:', plan.length, LIMIT ? `(is run me sirf ${todo.length}, --limit)` : '');
for (const [k, v] of Object.entries(skipped)) {
  console.log('Skip -', k + ':', v.length, v.length ? ' -> ' + v.slice(0, 20).join(', ') : '');
}
console.log('Photos wale reviews (ready me se):', todo.filter((t) => photosByComment.has(t.id)).length);
console.log('Verified (dump ke meta se):', todo.filter((t) => verified.get(t.id)).length);

// Photo wale reviews me se kaun plan me nahi?  (sirf IDs aur status, koi customer data nahi)
if (photosByComment.size) {
  const inPlan = new Set(plan.map((p) => p.id));
  const why = {};
  const sample = [];
  for (const cid of photosByComment.keys()) {
    let w;
    const st = allStatus.get(cid);
    if (inPlan.has(cid)) w = 'plan_me_hai';
    else if (!st) w = 'dump_ke_comments_me_nahi';
    else if (st.approved !== '1') w = 'approved_nahi(' + st.approved + ')';
    else if (!rating.has(cid)) w = 'approved_par_rating_meta_nahi';
    else w = 'skip_hua(sku/rating)';
    why[w] = (why[w] || 0) + 1;
    if (sample.length < 10) sample.push(cid + ':' + w + (st ? ' type=' + st.type + ' post=' + st.post : ''));
  }
  console.log('\n=== Photo wale ' + photosByComment.size + ' reviews ka status ===');
  for (const [k, v] of Object.entries(why)) console.log('  ' + k + ':', v);
  console.log('  namune:', sample.join(' | '));
}

if (!WRITE) {
  console.log('\nDRY RUN: kuch likha nahi gaya. Asli import ke liye --write lagao (pehle --write --limit=5).');
  for (const t of todo.slice(0, 15)) {
    console.log(`  comment ${t.id} | ${t.rating}* | sku ${t.sku} | photos ${(photosByComment.get(t.id) || []).join(' ; ') || '-'}`);
  }
  const withPhotos = todo.filter((t) => photosByComment.has(t.id));
  if (withPhotos.length) {
    console.log('\nPhotos wale reviews (comment | rating | sku | photos ki ginti):');
    for (const t of withPhotos.slice(0, 30)) console.log(`  comment ${t.id} | ${t.rating}* | sku ${t.sku} | ${photosByComment.get(t.id).length} photo(s)`);
  }
  process.exit(0);
}

// ---------- write ----------
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
async function uploadPhoto(commentId, idx, fileName) {
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  const key = `legacy/${commentId}-${idx + 1}-${safe}`;
  const buf = fs.readFileSync(path.join(PHOTOS_DIR, fileName));
  const res = await fetch(`${SB_URL}/storage/v1/object/review-images/${key}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': MIME[ext] || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: buf,
  });
  if (!res.ok) throw new Error('photo upload ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return `${SITE_URL}/media/review-images/${key}`;
}

let done = 0, failed = 0, photosUp = 0;
for (const t of todo) {
  try {
    const photos = [];
    for (const [i, f] of (photosByComment.get(t.id) || []).entries()) { photos.push(await uploadPhoto(t.id, i, f)); photosUp++; }
    const row = {
      product_id: t.productId,
      user_id: null,
      customer_name: t.name || 'Customer',
      rating: t.rating,
      title: null,
      comment: t.content.trim() || null,
      is_approved: true,
      created_at: (t.dateGmt && t.dateGmt !== '0000-00-00 00:00:00' ? t.dateGmt : t.date).replace(' ', 'T') + 'Z',
      verified_purchase: verified.get(t.id) === true,
      photos,
      legacy_wc_comment_id: Number(t.id),
    };
    await sb('POST', '/rest/v1/reviews?on_conflict=legacy_wc_comment_id', JSON.stringify(row),
      { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' });
    done++;
    if (done % 25 === 0) console.log('  ... imported', done);
  } catch (e) {
    failed++;
    console.error('FAIL comment', t.id, '-', e.message);
  }
}
console.log(`\nKhatam. Imported: ${done}, failed: ${failed}, photos uploaded: ${photosUp}.`);
console.log('Dobara chalaoge to imported reviews skip honge (duplicate nahi banega).');
