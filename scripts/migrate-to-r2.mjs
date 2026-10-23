#!/usr/bin/env node
// ---------------------------------------------------------------------
// PHASE 2 (optional): copies every existing file in the Supabase
// `product-images` and `product-videos` buckets into your R2 bucket,
// keeping the exact same folder/filename layout.
//
// SAFE BY DESIGN:
//  - This only COPIES. It never deletes or modifies anything in
//    Supabase Storage. Your ~500 existing images/videos keep working
//    exactly as before, from their existing supabase.co URLs.
//  - Run it as many times as you like -- it skips files that already
//    exist in R2 (checked by key), so re-running after a partial run
//    or a new upload batch is safe.
//  - It does NOT touch your database. Product/variant/banner rows keep
//    pointing at the old Supabase URLs until you deliberately run
//    scripts/rewrite-urls-to-r2.sql (a separate, reversible step).
//
// USAGE
//   node scripts/migrate-to-r2.mjs
//
// REQUIRED ENV VARS (put these in a local .env.migration file or export
// them in your shell -- do NOT commit real keys):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME
// ---------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const SOURCE_BUCKETS = ['product-images', 'product-videos'];

async function listAllFiles(bucket, prefix = '') {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // it's a "folder" -- recurse
      out.push(...(await listAllFiles(bucket, path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

async function alreadyInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateBucket(bucket) {
  console.log(`\n[${bucket}] listing files...`);
  const files = await listAllFiles(bucket);
  console.log(`[${bucket}] found ${files.length} files.`);

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const path of files) {
    const key = `${bucket}/${path}`;
    if (await alreadyInR2(key)) {
      skipped++;
      continue;
    }
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) throw error || new Error('empty download');
      const buffer = Buffer.from(await data.arrayBuffer());
      await r2.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: data.type || 'application/octet-stream',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
      copied++;
      if (copied % 20 === 0) console.log(`[${bucket}] copied ${copied}/${files.length}...`);
    } catch (err) {
      failed++;
      console.error(`[${bucket}] FAILED: ${path}`, err?.message || err);
    }
  }

  console.log(`[${bucket}] done. copied=${copied} skipped(existing)=${skipped} failed=${failed}`);
}

for (const bucket of SOURCE_BUCKETS) {
  await migrateBucket(bucket);
}

console.log('\nAll done. Supabase originals were NOT touched or deleted.');
console.log('Next optional step: run scripts/rewrite-urls-to-r2.sql in the Supabase SQL editor');
console.log('to point your database rows at the new R2 URLs (keep a backup first).');
