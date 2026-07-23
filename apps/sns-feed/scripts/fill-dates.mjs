#!/usr/bin/env node
// post.json の空欄の「date」を、投稿URLから完全オフラインで復元して埋める。
// X: Snowflake ID (status ID) にミリ秒精度のタイムスタンプが符号化されている。
// Bluesky: 投稿レコードキー(rkey)は AT Protocol の TID で、マイクロ秒精度のタイムスタンプが符号化されている。
// どちらもAPI通信・認証なしでデコードできる。
//
// スレッド内の各ツイートの date は fill-threads.mjs が tweets.js の created_at から
// 直接埋めるため、このスクリプトはトップレベルの date のみを対象にする。
//
// 使い方: node apps/sns-feed/scripts/fill-dates.mjs [--force]
//   --force を付けると、既に値が入っている date も再計算して上書きする。

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, '..', 'post.json');
const FORCE = process.argv.includes('--force');

const TWITTER_EPOCH_MS = 1288834974657n;
const TID_CHARSET = '234567abcdefghijklmnopqrstuvwxyz';

function tweetIdToDate(id) {
  const ms = (BigInt(id) >> 22n) + TWITTER_EPOCH_MS;
  return new Date(Number(ms));
}

function decodeTID(tid) {
  let val = 0n;
  for (const ch of tid) {
    const idx = TID_CHARSET.indexOf(ch);
    if (idx === -1) return null;
    val = (val << 5n) | BigInt(idx);
  }
  const timestampUs = val >> 10n;
  return new Date(Number(timestampUs / 1000n));
}

function resolvePostDate(url) {
  const xMatch = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/);
  if (xMatch) return tweetIdToDate(xMatch[1]);

  const bskyMatch = url.match(/bsky\.app\/profile\/[^/]+\/post\/([a-zA-Z2-7]+)/);
  if (bskyMatch) return decodeTID(bskyMatch[1]);

  return null;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// ---- メイン処理 ----
const raw = await readFile(JSON_PATH, 'utf-8');
const posts = JSON.parse(raw);
if (!Array.isArray(posts)) {
  console.error('post.json の内容が配列ではありません');
  process.exit(1);
}

let filled = 0, skippedExisting = 0, skippedUnparsable = 0;
const unparsableUrls = [];

for (const post of posts) {
  const url = (post.url || '').trim();
  if (!url) continue;

  const existing = (post.date || '').trim();
  if (existing && !FORCE) { skippedExisting++; continue; }

  const date = resolvePostDate(url);
  if (!date || Number.isNaN(date.getTime())) {
    skippedUnparsable++;
    unparsableUrls.push(url);
    continue;
  }

  post.date = toDateString(date);
  filled++;
}

await writeFile(JSON_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf-8');

console.log(`補完: ${filled}件`);
console.log(`スキップ（既に値あり）: ${skippedExisting}件`);
if (skippedUnparsable > 0) {
  console.log(`スキップ（URLを解析できず）: ${skippedUnparsable}件`);
  unparsableUrls.forEach(u => console.log(`  - ${u}`));
}
