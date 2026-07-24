#!/usr/bin/env node
// post.json に投稿を1件だけ追加、または既存の1件だけを更新するスクリプト。
//
// [新規追加] URL・大ジャンル・小ジャンルを指定するだけで、投稿日・
// （Xの場合は）本文・メディア・スレッド（自己リプライのツリー）を
// tweets*.js アーカイブ / URLから全て自動補完してpost.jsonに追加する。
//   使い方: node apps/sns-feed/scripts/add-post.mjs <URL> <大ジャンル> <小ジャンル>
//
// [既存の更新／スレッドが後から伸びた時の追従] 同じURLの投稿が既にpost.jsonに
// あれば、大ジャンル/小ジャンルは指定しない限りそのままに、現在の tweets*.js
// アーカイブの内容でスレッド・本文・メディア・投稿日を再計算して上書きする。
// tweets.js を新しいアーカイブ書き出しに差し替えてから実行すれば、後から
// 増えた自己リプライが自動でツリーに追加される。
//   使い方: node apps/sns-feed/scripts/add-post.mjs <URL>
//
// 大ジャンル/小ジャンルを指定した場合は、既存投稿でもジャンルを上書きする。
// Bluesky投稿はスレッドをWEBページ側でライブ判定するため、ここでは投稿日のみ扱う。

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.join(__dirname, '..');
const JSON_PATH = path.join(__dirname, '..', 'post.json');

const [, , urlArg, majorArg, minorArg] = process.argv;

if (!urlArg) {
  console.error('使い方:');
  console.error('  新規追加: node apps/sns-feed/scripts/add-post.mjs <URL> <大ジャンル> <小ジャンル>');
  console.error('  既存更新: node apps/sns-feed/scripts/add-post.mjs <URL>');
  process.exit(1);
}

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
  return new Date(Number((val >> 10n) / 1000n));
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function extractXId(url) {
  const m = (url || '').match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/);
  return m ? m[1] : null;
}

const xId = extractXId(urlArg);
const isBluesky = /bsky\.app/.test(urlArg);

if (!xId && !isBluesky) {
  console.error('URLがX(x.com/twitter.com)またはBluesky(bsky.app)の投稿の形式ではありません');
  process.exit(1);
}

// ---- tweets*.js（Twitterアーカイブ。Xの投稿を扱う場合のみ必要） ----
async function loadArchiveTweets() {
  const files = [];
  for await (const entry of glob('tweets*.js', { cwd: ARCHIVE_DIR })) {
    files.push(path.join(ARCHIVE_DIR, entry));
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
  return { text: text.trim(), media };
}

let idToTweet = new Map();
let childrenOf = new Map();
let screenName = null;

if (xId) {
  const loaded = await loadArchiveTweets();
  if (loaded.tweets.length === 0) {
    console.error('apps/sns-feed 直下に tweets*.js が見つかりません');
    process.exit(1);
  }
  screenName = loaded.screenName;
  idToTweet = new Map(loaded.tweets.map(t => [t.id_str, t]));
  for (const t of loaded.tweets) {
    const parent = t.in_reply_to_status_id_str;
    if (!parent || !idToTweet.has(parent)) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(t.id_str);
  }
  for (const children of childrenOf.values()) {
    children.sort((a, b) => new Date(idToTweet.get(a).created_at) - new Date(idToTweet.get(b).created_at));
  }
  if (!idToTweet.has(xId)) {
    console.error(`指定のツイート(${xId})が tweets*.js アーカイブに見つかりません。アーカイブを最新のものに差し替えてから再実行してください`);
    process.exit(1);
  }
}

function tweetUrl(id) {
  return `https://x.com/${screenName}/status/${id}`;
}

// parentId への自己リプライを、すべて再帰的にツリー化する。
// 分岐（同じツイートへの複数の自己リプライ）はすべて replies の配列要素として保持する。
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

// ---- post.json 読み込み ----
const raw = await readFile(JSON_PATH, 'utf-8');
const posts = JSON.parse(raw);
if (!Array.isArray(posts)) {
  console.error('post.json の内容が配列ではありません');
  process.exit(1);
}

function isSamePost(post) {
  if (xId) return extractXId(post.url) === xId;
  return (post.url || '').trim() === urlArg.trim();
}

let entry = posts.find(isSamePost);
let isNew = false;

if (!entry) {
  if (!majorArg || !minorArg) {
    console.error('新規追加には大ジャンルと小ジャンルの指定が必要です:');
    console.error('  node apps/sns-feed/scripts/add-post.mjs <URL> <大ジャンル> <小ジャンル>');
    process.exit(1);
  }
  entry = { url: urlArg, major: majorArg, minor: minorArg, date: '', replies: [] };
  posts.push(entry);
  isNew = true;
} else {
  if (majorArg) entry.major = majorArg;
  if (minorArg) entry.minor = minorArg;
}

// ---- 投稿日・本文・メディア・スレッドを解決 ----
if (xId) {
  const rootTweet = idToTweet.get(xId);
  const { text, media } = extractContent(rootTweet);
  entry.date = toDateString(new Date(rootTweet.created_at));
  entry.text = text;
  entry.media = media;
  entry.replies = buildReplyTree(xId, new Set([xId]));
} else {
  const bskyMatch = urlArg.match(/bsky\.app\/profile\/[^/]+\/post\/([a-zA-Z2-7]+)/);
  const date = bskyMatch ? decodeTID(bskyMatch[1]) : null;
  if (date && !Number.isNaN(date.getTime())) entry.date = toDateString(date);
  entry.replies = entry.replies || [];
}

await writeFile(JSON_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf-8');

function countNodes(nodes) {
  return (nodes || []).reduce((sum, n) => sum + 1 + countNodes(n.replies), 0);
}

console.log(isNew ? '新規追加しました' : '既存の投稿を更新しました（スレッドは現在のアーカイブ内容で再計算）');
console.log(`URL: ${entry.url}`);
console.log(`大ジャンル: ${entry.major} / 小ジャンル: ${entry.minor}`);
console.log(`投稿日: ${entry.date}`);
if (xId) console.log(`スレッド内ツイート数: ${countNodes(entry.replies)}`);
