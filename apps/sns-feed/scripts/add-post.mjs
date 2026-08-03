#!/usr/bin/env node
// post.json に投稿を1件だけ追加、または既存の1件だけを更新するスクリプト。
//
// X・Bluesky共通。URL・大ジャンル・小ジャンルを指定するだけで、投稿日・本文・
// メディア・スレッド（自己リプライのツリー）を全て自動補完してpost.jsonに追加する。
// X: tweets*.js アーカイブ（ローカル、非公開）から抽出する。
// Bluesky: AT Protocolの公開API（認証不要）からその場で取得する。
// どちらも取得結果をpost.jsonに焼き込むため、WEBページ側は一切ライブ取得しない。
//
// [新規追加]
//   node apps/sns-feed/scripts/add-post.mjs <URL> <大ジャンル> <小ジャンル>
//
// [既存の更新／スレッドが後から伸びた時の追従] 同じURLの投稿が既にpost.jsonに
// あれば、大ジャンル/小ジャンルは指定しない限りそのままに、その投稿のスレッド・
// 本文・メディア・投稿日だけを最新の内容で再計算して上書きする
// （Xはtweets.jsを新しいアーカイブ書き出しに差し替えてから実行する。Blueskyは
// 常に最新の投稿状況をその場で取得するので差し替え不要）。
//   node apps/sns-feed/scripts/add-post.mjs <URL>
//
// 大ジャンル/小ジャンルを指定した場合は、既存投稿でもジャンルを上書きする。
//
// カテゴリの再設定やツイートの削除だけを行いたい場合は、GUI編集ツール
// （node apps/sns-feed/scripts/edit-server.mjs）の方が手軽。

import { readPosts, writePosts, resolvePostContent, isSamePost, countThreadNodes } from './post-lib.mjs';

const [, , urlArg, majorArg, minorArg] = process.argv;

if (!urlArg) {
  console.error('使い方:');
  console.error('  新規追加: node apps/sns-feed/scripts/add-post.mjs <URL> <大ジャンル> <小ジャンル>');
  console.error('  既存更新: node apps/sns-feed/scripts/add-post.mjs <URL>');
  process.exit(1);
}

const posts = await readPosts();

let entry = posts.find(p => isSamePost(p, urlArg));
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
let content;
try {
  content = await resolvePostContent(urlArg);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
entry.date = content.date;
entry.text = content.text;
entry.media = content.media;
entry.replies = content.replies;

await writePosts(posts);

console.log(isNew ? '新規追加しました' : '既存の投稿を更新しました（スレッドは現在のアーカイブ/最新の投稿内容で再計算）');
console.log(`URL: ${entry.url}`);
console.log(`大ジャンル: ${entry.major} / 小ジャンル: ${entry.minor}`);
console.log(`投稿日: ${entry.date}`);
console.log(`スレッド内投稿数: ${countThreadNodes(entry.replies)}`);
