#!/usr/bin/env node
// post.csv の空欄の「投稿日」を、投稿URLから完全オフラインで復元して埋める。
// X: Snowflake ID (status ID) にミリ秒精度のタイムスタンプが符号化されている。
// Bluesky: 投稿レコードキー(rkey)は AT Protocol の TID で、マイクロ秒精度のタイムスタンプが符号化されている。
// どちらもAPI通信・認証なしでデコードできる。
//
// 使い方: node apps/sns-feed/scripts/fill-dates.mjs [--force]
//   --force を付けると、既に値が入っている投稿日も再計算して上書きする。

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', 'post.csv');
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

// ---- 簡易CSVパーサ/シリアライザ（RFC4180準拠、外部依存なし） ----
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function serializeField(value) {
  if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

function serializeCSV(rows) {
  return rows.map(r => r.map(serializeField).join(',')).join('\n') + '\n';
}

// ---- メイン処理 ----
const raw = await readFile(CSV_PATH, 'utf-8');
const text = raw.replace(/^﻿/, '');
const rows = parseCSV(text);
if (rows.length === 0) {
  console.error('post.csv が空です');
  process.exit(1);
}

const header = rows[0];
const urlIdx = header.indexOf('URL');
const dateIdx = header.indexOf('投稿日');
if (urlIdx === -1 || dateIdx === -1) {
  console.error('post.csv のヘッダーに URL / 投稿日 列が見つかりません');
  process.exit(1);
}

let filled = 0, skippedExisting = 0, skippedUnparsable = 0;
const unparsableUrls = [];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const url = (row[urlIdx] || '').trim();
  if (!url) continue;

  const existing = (row[dateIdx] || '').trim();
  if (existing && !FORCE) { skippedExisting++; continue; }

  const date = resolvePostDate(url);
  if (!date || Number.isNaN(date.getTime())) {
    skippedUnparsable++;
    unparsableUrls.push(url);
    continue;
  }

  row[dateIdx] = toDateString(date);
  filled++;
}

await writeFile(CSV_PATH, '﻿' + serializeCSV(rows), 'utf-8');

console.log(`補完: ${filled}件`);
console.log(`スキップ（既に投稿日あり）: ${skippedExisting}件`);
if (skippedUnparsable > 0) {
  console.log(`スキップ（URLを解析できず）: ${skippedUnparsable}件`);
  unparsableUrls.forEach(u => console.log(`  - ${u}`));
}
