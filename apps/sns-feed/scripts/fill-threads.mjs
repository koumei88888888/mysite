#!/usr/bin/env node
// post.json の空の「replies」「text」「media」を、apps/sns-feed 直下の tweets*.js
// （Twitterアーカイブのツイートエクスポート、ローカルのみ・非公開）から自動で復元して埋める。
//
// X埋め込みウィジェット/oEmbedは、センシティブ判定された画像を含むツイートの埋め込みを
// 拒否することがある（本体は開けるのに埋め込みだけ失敗する）ため、Xの埋め込み機能には
// 頼らず、アーカイブから本文とメディアURLを直接抽出してWEBページ側で自前描画する。
//
// post.json の各投稿の url が tweets.js 内のツイートと一致した場合:
//   - そのツイート自身の本文(text)・メディア(media)をpostに書き込む
//   - そのツイートへの自己リプライ（自分自身への返信）を id_str /
//     in_reply_to_status_id_str の親子関係（tweets.js に明示的に記録されている実データ）
//     から辿り、ツリー構造（{ url, date, text, media, replies: [...] }の入れ子）として
//     replies に書き込む。1つのツイートに複数の自己リプライ（分岐）がある場合は、
//     そのすべてを replies の配列要素として保持する（1本の鎖に潰さない）。
//     時間差による足切りは行わない。
//
// 使い方: node apps/sns-feed/scripts/fill-threads.mjs [--force]
//   --force を付けると、既に replies/text が入っている投稿も再計算して上書きする。

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

// ツイート本体から、表示用の本文とメディア一覧を抜き出す。
// 本文末尾のメディア用t.coリンクは画像/動画側で表示するので取り除く。
function extractContent(tweet) {
  const items = (tweet.extended_entities && tweet.extended_entities.media)
    || (tweet.entities && tweet.entities.media)
    || [];

  const media = [];
  for (const m of items) {
    if (m.type === 'photo') {
      media.push({ type: 'photo', url: m.media_url_https });
    } else if (m.type === 'video' || m.type === 'animated_gif') {
      const variants = ((m.video_info && m.video_info.variants) || [])
        .filter(v => v.content_type === 'video/mp4')
        .sort((a, b) => (+b.bitrate || 0) - (+a.bitrate || 0));
      if (variants[0]) {
        media.push({ type: m.type, url: variants[0].url, poster: m.media_url_https });
      }
    }
  }

  let text = tweet.full_text || '';
  for (const m of items) {
    if (m.url) text = text.split(m.url).join('');
  }
  text = text.trim();

  return { text, media };
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
    const tweet = idToTweet.get(childId);
    const { text, media } = extractContent(tweet);
    nodes.push({
      url: tweetUrl(childId),
      date: toDateString(new Date(tweet.created_at)),
      text,
      media,
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

let filledContent = 0, filledThread = 0, skippedExisting = 0, skippedNotFound = 0, skippedNoThread = 0, skippedNotX = 0;

for (const post of posts) {
  const url = (post.url || '').trim();
  if (!url) continue;

  const m = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/);
  if (!m) { skippedNotX++; continue; } // Bluesky等はライブ埋め込みのため対象外

  if (!idToTweet.has(m[1])) { skippedNotFound++; continue; }
  const rootTweet = idToTweet.get(m[1]);

  if (!post.text || FORCE) {
    const { text, media } = extractContent(rootTweet);
    post.text = text;
    post.media = media;
    filledContent++;
  }

  const hasExisting = Array.isArray(post.replies) && post.replies.length > 0;
  if (hasExisting && !FORCE) { skippedExisting++; continue; }

  const tree = buildReplyTree(m[1], new Set([m[1]]));

  if (tree.length === 0) {
    if (FORCE && hasExisting) post.replies = []; // 再計算の結果「続きなし」と分かったので古い値をクリア
    skippedNoThread++;
    continue;
  }

  post.replies = tree;
  filledThread++;
}

await writeFile(JSON_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf-8');

function countNodes(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.replies || []), 0);
}
const totalNodes = posts.reduce((sum, p) => sum + countNodes(p.replies || []), 0);

console.log(`推定スクリーンネーム: ${screenName}`);
console.log(`本文/メディア補完: ${filledContent}件`);
console.log(`スレッド補完: ${filledThread}件（ツリー内の総ツイート数: ${totalNodes}件）`);
console.log(`スキップ（既にreplies あり）: ${skippedExisting}件`);
console.log(`スキップ（X以外の投稿）: ${skippedNotX}件`);
console.log(`スキップ（アーカイブに該当ツイートなし）: ${skippedNotFound}件`);
console.log(`スキップ（続きのツイートなし）: ${skippedNoThread}件`);
