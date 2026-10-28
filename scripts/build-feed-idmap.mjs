// Usage (Windows CMD, repo folder me):
//   node scripts/build-feed-idmap.mjs "C:\backup\suti backup\manual backup\oct\3\parm9eAk4Fc4tv.sql"
//
// Purane WooCommerce DB dump se product ID + variation ID nikalta hai aur
// "feed-idmap.sql" banata hai. Us file ko Supabase SQL Editor me run karo.
// Isse naya feed WAHI product IDs bhejega jo Merchant Center me pehle se hain
// (jaise 10445, 24530), to products "naye" nahi banenge, history/approval bani rahegi.
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('SQL dump ka path do.'); process.exit(1); }
const sql = fs.readFileSync(file, 'utf8');

const cn = (c) => String(c || '').toLowerCase().trim().replace(/\s+/g, '-');

// Parse one "INSERT INTO `table` (...) VALUES (...),(...);" statement list for a table suffix.
function* rows(suffix) {
  const re = new RegExp('INSERT INTO `([A-Za-z0-9_]*' + suffix + ')`\\s*(\\([^)]*\\))?\\s*VALUES\\s*', 'g');
  let m;
  while ((m = re.exec(sql))) {
    const cols = m[2] ? m[2].replace(/[()`\s]/g, '').split(',') : null;
    let i = re.lastIndex;
    const n = sql.length;
    while (i < n) {
      while (i < n && /[\s,]/.test(sql[i])) i++;
      if (sql[i] === ';') { i++; break; }
      if (sql[i] !== '(') break;
      i++;
      const vals = [];
      while (i < n) {
        while (sql[i] === ' ') i++;
        let v;
        if (sql[i] === "'") {
          i++;
          let s = '';
          while (i < n) {
            const c = sql[i];
            if (c === '\\') { s += sql[i + 1]; i += 2; continue; }
            if (c === "'") {
              if (sql[i + 1] === "'") { s += "'"; i += 2; continue; }
              i++; break;
            }
            s += c; i++;
          }
          v = s;
        } else {
          let j = i;
          while (j < n && sql[j] !== ',' && sql[j] !== ')') j++;
          v = sql.slice(i, j).trim();
          i = j;
        }
        vals.push(v);
        if (sql[i] === ',') { i++; continue; }
        if (sql[i] === ')') { i++; break; }
      }
      yield { cols, vals };
    }
    re.lastIndex = i;
  }
}

const POST_DEFAULT = ['ID','post_author','post_date','post_date_gmt','post_content','post_title','post_excerpt','post_status','comment_status','ping_status','post_password','post_name','to_ping','pinged','post_modified','post_modified_gmt','post_content_filtered','post_parent','guid','menu_order','post_type','post_mime_type','comment_count'];

const products = new Map();   // ID -> slug
const variations = new Map(); // ID -> parent ID
for (const r of rows('posts')) {
  const cols = r.cols || POST_DEFAULT;
  const o = Object.fromEntries(cols.map((c, k) => [c, r.vals[k]]));
  if (o.post_status !== 'publish' && o.post_status !== 'private') continue;
  if (o.post_type === 'product') products.set(o.ID, o.post_name);
  else if (o.post_type === 'product_variation') variations.set(o.ID, o.post_parent);
}

const colorOf = new Map(); // variation ID -> color slug
for (const r of rows('postmeta')) {
  const cols = r.cols || ['meta_id', 'post_id', 'meta_key', 'meta_value'];
  const o = Object.fromEntries(cols.map((c, k) => [c, r.vals[k]]));
  if ((o.meta_key === 'attribute_pa_color' || o.meta_key === 'attribute_pa_colour' || o.meta_key === 'attribute_color') && variations.has(o.post_id)) {
    colorOf.set(o.post_id, o.meta_value);
  }
}

const parents = {};
for (const [id, slug] of products) parents[slug] = id;

const variants = {};
const ids = [...variations.keys()].sort((a, b) => Number(a) - Number(b));
for (const vid of ids) {
  const slug = products.get(variations.get(vid));
  const color = colorOf.get(vid);
  if (!slug || !color) continue;
  const key = slug + '|' + cn(color);
  if (!variants[key]) variants[key] = vid; // pehla (sabse chhota) variation ID
}

const json = JSON.stringify({ parents, variants });
const out =
  "insert into settings (key, value) values ('feed_idmap', $json$" + json + "$json$::jsonb)\n" +
  "on conflict (key) do update set value = excluded.value, updated_at = now();\n";
fs.writeFileSync('feed-idmap.sql', out);
console.log('Products:', Object.keys(parents).length, '| Variation colours:', Object.keys(variants).length);
console.log('feed-idmap.sql ban gayi -> Supabase SQL Editor me run karo.');
