// add-post.mjs（CLI）と edit-server.mjs（GUI編集サーバー）が共有する、
// post.json の読み書き・X/Blueskyからの投稿内容解決ロジック。

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ARCHIVE_DIR = path.join(__dirname, '..');
export const JSON_PATH = path.join(__dirname, '..', 'post.json');

export function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

export function extractXId(url) {
  const m = (url || '').match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/);
  return m ? m[1] : null;
}

export function isBlueskyUrl(url) {
  return /bsky\.app/.test(url || '');
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

let archiveIndexCache = null;
async function getArchiveIndex() {
  if (archiveIndexCache) return archiveIndexCache;
  const { tweets, screenName } = await loadArchiveTweets();
  const idToTweet = new Map(tweets.map(t => [t.id_str, t]));
  const childrenOf = new Map();
  for (const t of tweets) {
    const parent = t.in_reply_to_status_id_str;
    if (!parent || !idToTweet.has(parent)) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(t.id_str);
  }
  for (const children of childrenOf.values()) {
    children.sort((a, b) => new Date(idToTweet.get(a).created_at) - new Date(idToTweet.get(b).created_at));
  }
  archiveIndexCache = { tweets, screenName, idToTweet, childrenOf };
  return archiveIndexCache;
}

// parentId への自己リプライを、すべて再帰的にツリー化する。
// 分岐（同じツイートへの複数の自己リプライ）はすべて replies の配列要素として保持する。
function buildReplyTree(idToTweet, childrenOf, screenName, parentId, visited) {
  const children = childrenOf.get(parentId) || [];
  const nodes = [];
  for (const childId of children) {
    if (visited.has(childId)) continue; // 循環防止
    const nextVisited = new Set(visited);
    nextVisited.add(childId);
    const tweet = idToTweet.get(childId);
    const { text, media } = extractContent(tweet);
    nodes.push({
      url: `https://x.com/${screenName}/status/${childId}`,
      date: toDateString(new Date(tweet.created_at)),
      text,
      media,
      replies: buildReplyTree(idToTweet, childrenOf, screenName, childId, nextVisited),
    });
  }
  return nodes;
}

export async function resolveXThread(xId) {
  const { tweets, screenName, idToTweet, childrenOf } = await getArchiveIndex();
  if (tweets.length === 0) {
    throw new Error('apps/sns-feed 直下に tweets*.js が見つかりません');
  }
  if (!idToTweet.has(xId)) {
    throw new Error(`指定のツイート(${xId})が tweets*.js アーカイブに見つかりません。アーカイブを最新のものに差し替えてから再実行してください`);
  }
  const rootTweet = idToTweet.get(xId);
  const { text, media } = extractContent(rootTweet);
  return {
    date: toDateString(new Date(rootTweet.created_at)),
    text,
    media,
    replies: buildReplyTree(idToTweet, childrenOf, screenName, xId, new Set([xId])),
  };
}

// ---- Bluesky（AT Protocol公開API。認証不要） ----
function parseBlueskyUrl(url) {
  const m = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z2-7]+)/);
  return m ? { handle: m[1], rkey: m[2] } : null;
}

async function resolveDid(handle) {
  if (handle.startsWith('did:')) return handle;
  const res = await fetch('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=' + encodeURIComponent(handle));
  if (!res.ok) throw new Error('resolveHandle failed: ' + res.status);
  const data = await res.json();
  return data.did;
}

// 投稿のembedから表示用メディア一覧を抜き出す（画像・動画・引用+メディア）。
function extractBskyMedia(embed) {
  if (!embed) return [];
  if (embed.$type === 'app.bsky.embed.images#view') {
    return embed.images.map(img => ({ type: 'photo', url: img.fullsize }));
  }
  if (embed.$type === 'app.bsky.embed.video#view') {
    // 動画はHLS(m3u8)配信でブラウザによって再生できないため、サムネイルのみ表示し
    // 実際の再生はカード下部の「元投稿を開く」リンクに任せる。
    return [{ type: 'video_external', poster: embed.thumbnail }];
  }
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    return extractBskyMedia(embed.media);
  }
  return [];
}

function bskyPermalink(post, rootDid) {
  const rkey = post.uri.split('/').pop();
  return `https://bsky.app/profile/${post.author.handle || rootDid}/post/${rkey}`;
}

// threadNode（getPostThreadのレスポンス）から自分自身への返信だけを辿り、
// Xと同じ形（{ url, date, text, media, replies }の入れ子）のツリーを組み立てる。
function buildBskyNode(threadNode, rootDid) {
  const post = threadNode.post;
  const selfReplies = (threadNode.replies || []).filter(r => r.post && r.post.author && r.post.author.did === rootDid);
  return {
    url: bskyPermalink(post, rootDid),
    date: toDateString(new Date(post.record.createdAt)),
    text: (post.record.text || '').trim(),
    media: extractBskyMedia(post.embed),
    replies: selfReplies.map(r => buildBskyNode(r, rootDid)),
  };
}

async function fetchBskyThread(handle, rkey) {
  const did = await resolveDid(handle);
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const res = await fetch('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=' + encodeURIComponent(uri) + '&depth=50');
  if (!res.ok) throw new Error('getPostThread failed: ' + res.status);
  const data = await res.json();
  if (!data.thread || !data.thread.post) throw new Error('スレッドが取得できませんでした（投稿が削除・非公開の可能性があります）');
  return buildBskyNode(data.thread, did);
}

// URLから投稿内容（投稿日・本文・メディア・スレッド）を解決する。
// X: ローカルのtweets*.jsアーカイブから。Bluesky: AT Protocol公開APIからその場で取得。
export async function resolvePostContent(url) {
  const xId = extractXId(url);
  if (xId) {
    const { date, text, media, replies } = await resolveXThread(xId);
    return { date, text, media, replies };
  }
  if (isBlueskyUrl(url)) {
    const parsed = parseBlueskyUrl(url);
    if (!parsed) {
      throw new Error('Bluesky URLの形式が正しくありません（例: https://bsky.app/profile/handle/post/xxxxx）');
    }
    const node = await fetchBskyThread(parsed.handle, parsed.rkey);
    return { date: node.date, text: node.text, media: node.media, replies: node.replies };
  }
  throw new Error('URLがX(x.com/twitter.com)またはBluesky(bsky.app)の投稿の形式ではありません');
}

export function isSamePost(post, url) {
  const xId = extractXId(url);
  if (xId) return extractXId(post.url) === xId;
  return (post.url || '').trim() === url.trim();
}

// ---- post.json 読み書き ----
export async function readPosts() {
  const raw = await readFile(JSON_PATH, 'utf-8');
  const posts = JSON.parse(raw);
  if (!Array.isArray(posts)) {
    throw new Error('post.json の内容が配列ではありません');
  }
  return posts;
}

export async function writePosts(posts) {
  await writeFile(JSON_PATH, JSON.stringify(posts, null, 2) + '\n', 'utf-8');
}

export function countThreadNodes(nodes) {
  return (nodes || []).reduce((sum, n) => sum + 1 + countThreadNodes(n.replies), 0);
}

// freshNodes（最新の取得結果）の中に、storedNodes（保存済み）にはまだ無いノードが
// いくつあるかを再帰的に数える（URLで同一ノードを対応付け、無いものだけを新規として加算）。
// 新規ノードはその配下も丸ごと新規扱いになる。
export function countNewThreadNodes(freshNodes, storedNodes) {
  const storedByUrl = new Map((storedNodes || []).map(n => [n.url, n]));
  let count = 0;
  for (const node of (freshNodes || [])) {
    const matched = storedByUrl.get(node.url);
    if (!matched) {
      count += 1 + countThreadNodes(node.replies);
    } else {
      count += countNewThreadNodes(node.replies, matched.replies);
    }
  }
  return count;
}
