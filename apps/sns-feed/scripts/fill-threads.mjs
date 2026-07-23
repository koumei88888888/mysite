#!/usr/bin/env node
// post.json の空の「replies」を、apps/sns-feed 直下の tweets*.js（Twitterアーカイブの
// ツイートエクスポート）から自動で復元して埋める。
//
// post.json の各投稿の url が tweets.js 内のツイートと一致した場合、そのツイートへの
// 自己リプライ（自分自身への返信）を id_str / in_reply_to_status_id_str の親子関係
// （tweets.js に明示的に記録されている実データ）から辿り、ツリー構造
// （{ url, date, replies: [...] }の入れ子）として replies に書き込む。
// 1つのツイートに複数の自己リプライ（分岐）がある場合は、そのすべてを replies の
// 配列要素として保持する（1本の鎖に潰さない）。時間差による足切りは行わない
// （in_reply_to_status_id_str が指す関係をそのままツリーとして採用する）。
//
// 使い方: node apps/sns-feed/scripts/fill-threads.mjs [--force]
//   --force を付けると、既に replies が入っている投稿も再計算して上書きする。

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.join(__dirname, '..');
const JSON_PATH = path.join(__dirname, '..', 'post.json');
const FORCE = process.argv.includes('--force');

function toDateString(date) {
  return date.toISOString().slice(0, 10);
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
const childrenOf = new Map(); // parentId -> [childId, ...]（created_at昇順）
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

// parentId への自己リプライ（in_reply_to_status_id_str が指す実データ）を、
// すべて再帰的にツリー化する。分岐（同じツイートへの複数の自己リプライ）は
// すべて replies の配列要素として保持する。
function buildReplyTree(parentId, visited) {
  const children = childrenOf.get(parentId) || [];
  const nodes = [];
  for (const childId of children) {
    if (visited.has(childId)) continue; // 循環防止

    const nextVisited = new Set(visited);
    nextVisited.add(childId);
    nodes.push({
      url: tweetUrl(childId),
      date: toDateString(new Date(idToTweet.get(childId).created_at)),
      replies: buildReplyTree(childId, nextVisited),
    });
  }
  return nodes;
}

const raw = await readFile(JSON_PATH, 'utf-8');
const posts = JSON.parse(raw);
if (!Array.isArray(posts)) {
  console.error('post.json の内容が配列ではありません');
  process.exit(1);
}

let filled = 0, skippedExisting = 0, skippedNotFound = 0, skippedNoThread = 0, skippedNotX = 0;

for (const post of posts) {
  const url = (post.url || '').trim();
  if (!url) continue;

  const m = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/);
  if (!m) { skippedNotX++; continue; } // Bluesky等はスレッドをライブ判定するため対象外

  const hasExisting = Array.isArray(post.replies) && post.replies.length > 0;
  if (hasExisting && !FORCE) { skippedExisting++; continue; }

  if (!idToTweet.has(m[1])) { skippedNotFound++; continue; }

  const tree = buildReplyTree(m[1], new Set([m[1]]));

  if (tree.length === 0) {
    if (FORCE && hasExisting) post.replies = []; // 再計算の結果「続きなし」と分かったので古い値をクリア
    skippedNoThread++;
    continue;
  }

  post.replies = tree;
  filled++;
}

await writeFile(JSON_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf-8');

function countNodes(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.replies || []), 0);
}
const totalNodes = posts.reduce((sum, p) => sum + countNodes(p.replies || []), 0);

console.log(`推定スクリーンネーム: ${screenName}`);
console.log(`補完: ${filled}件（ツリー内の総ツイート数: ${totalNodes}件）`);
console.log(`スキップ（既にreplies あり）: ${skippedExisting}件`);
console.log(`スキップ（X以外の投稿）: ${skippedNotX}件`);
console.log(`スキップ（アーカイブに該当ツイートなし）: ${skippedNotFound}件`);
console.log(`スキップ（続きのツイートなし）: ${skippedNoThread}件`);
