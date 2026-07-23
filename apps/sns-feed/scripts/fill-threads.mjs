#!/usr/bin/env node
// post.csv の空欄の「スレッドURL」を、apps/sns-feed 直下の tweets*.js（Twitterアーカイブの
// ツイートエクスポート）から自動で復元して埋める。
//
// post.csv の各行の URL が tweets.js 内のツイートと一致した場合、そのツイートに対する
// 自分自身への自己リプライ（スレッド continuation）を id_str / in_reply_to_status_id_str の
// 親子関係から辿り、URL 自身を先頭にした続きのツイートURLの列を「;」区切りでセットする。
// （分岐している場合は created_at が最も早いリプライを次の一手として採用する）
//
// 使い方: node apps/sns-feed/scripts/fill-threads.mjs [--force]
//   --force を付けると、既に値が入っているスレッドURLも再計算して上書きする。

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.join(__dirname, '..');
const CSV_PATH = path.join(__dirname, '..', 'post.csv');
const FORCE = process.argv.includes('--force');

// ---- 簡易CSVパーサ/シリアライザ（RFC4180準拠、外部依存なし。fill-dates.mjs と同一実装） ----
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

// ---- tweets*.js（Twitterアーカイブ）の読み込み ----
async function loadArchiveTweets() {
  const files = [];
  for await (const entry of glob('tweets*.js', { cwd: ARCHIVE_DIR })) {
    files.push(path.join(ARCHIVE_DIR, entry));
  }
  if (files.length === 0) {
    console.error('apps/sns-feed 直下に tweets*.js が見つかりません');
    process.exit(1);
  }

  const tweets = [];
  let screenName = null;
  for (const file of files) {
    const raw = await readFile(file, 'utf-8');
    const jsonText = raw.slice(raw.indexOf('['));
    const parsed = JSON.parse(jsonText);
    for (const item of parsed) {
      const t = item.tweet || item;
      tweets.push(t);
      if (!screenName) {
        // アーカイブ内の expanded_url（メディアや埋め込みリンク）から自分のスクリーンネームを推定する
        const found = JSON.stringify(t).match(/x\.com\/([A-Za-z0-9_]+)\/status\//);
        if (found) screenName = found[1];
      }
    }
  }
  return { tweets, screenName };
}

// ---- メイン処理 ----
const { tweets, screenName } = await loadArchiveTweets();
if (!screenName) {
  console.error('tweets*.js からスクリーンネームを推定できませんでした（メディア付きツイートが1件もない可能性があります）');
  process.exit(1);
}

const idToTweet = new Map(tweets.map(t => [t.id_str, t]));
const childrenOf = new Map(); // parentId -> [childId, ...]
for (const t of tweets) {
  const parent = t.in_reply_to_status_id_str;
  if (!parent || !idToTweet.has(parent)) continue;
  if (!childrenOf.has(parent)) childrenOf.set(parent, []);
  childrenOf.get(parent).push(t.id_str);
}
for (const children of childrenOf.values()) {
  children.sort((a, b) => new Date(idToTweet.get(a).created_at) - new Date(idToTweet.get(b).created_at));
}

function tweetUrl(id) {
  return `https://x.com/${screenName}/status/${id}`;
}

// 自己リプライは「一連のスレッドとして書いたもの」とは限らない（数日〜数ヶ月後に自分の
// 古い投稿へ返信しただけのケースもある）。そのため、直前のツイートから一定時間以内に
// 投稿された自己リプライだけを「スレッドの続き」とみなして辿る。
const MAX_GAP_MS = 60 * 60 * 1000; // 1時間

function buildThreadUrls(startUrl, startId) {
  const chain = [startUrl];
  const visited = new Set([startId]);
  let cur = startId;
  while (childrenOf.has(cur)) {
    const next = childrenOf.get(cur)[0];
    if (visited.has(next)) break; // 循環防止

    const gap = new Date(idToTweet.get(next).created_at) - new Date(idToTweet.get(cur).created_at);
    if (gap > MAX_GAP_MS) break; // 間隔が空きすぎている＝別の会話とみなして打ち切り

    chain.push(tweetUrl(next));
    visited.add(next);
    cur = next;
  }
  return chain;
}

const raw = await readFile(CSV_PATH, 'utf-8');
const text = raw.replace(/^﻿/, '');
const rows = parseCSV(text);
if (rows.length === 0) {
  console.error('post.csv が空です');
  process.exit(1);
}

const header = rows[0];
const urlIdx = header.indexOf('URL');
const threadIdx = header.indexOf('スレッドURL');
if (urlIdx === -1 || threadIdx === -1) {
  console.error('post.csv のヘッダーに URL / スレッドURL 列が見つかりません');
  process.exit(1);
}

let filled = 0, skippedExisting = 0, skippedNotFound = 0, skippedNoThread = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const url = (row[urlIdx] || '').trim();
  if (!url) continue;

  const existing = (row[threadIdx] || '').trim();
  if (existing && !FORCE) { skippedExisting++; continue; }

  const m = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/);
  if (!m || !idToTweet.has(m[1])) { skippedNotFound++; continue; }

  const chain = buildThreadUrls(url, m[1]);
  if (chain.length <= 1) {
    if (FORCE && existing) row[threadIdx] = ''; // 再計算の結果「続きなし」と分かったので古い値をクリア
    skippedNoThread++;
    continue;
  }

  row[threadIdx] = chain.join(';');
  filled++;
}

await writeFile(CSV_PATH, '﻿' + serializeCSV(rows), 'utf-8');

console.log(`推定スクリーンネーム: ${screenName}`);
console.log(`補完: ${filled}件`);
console.log(`スキップ（既にスレッドURLあり）: ${skippedExisting}件`);
console.log(`スキップ（アーカイブに該当ツイートなし）: ${skippedNotFound}件`);
console.log(`スキップ（続きのツイートなし）: ${skippedNoThread}件`);
