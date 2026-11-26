# YouTube Music 中継 Worker

ym-playlist が YouTube Music の「シングルとアルバム」(ディスコグラフィー) を取得するための中継です。
music.youtube.com の内部 API はブラウザから直接呼べない (CORS) ため、Cloudflare Workers で中継します。

| エンドポイント | 内容 |
|---|---|
| `GET /discography?channelId=UC...` | アーティストページの「アルバム」「シングルと EP」棚 + ディスコグラフィーページ (`MPAD...`) を合わせた全リリース (`OLAK5uy_...` プレイリストID付き) |
| `GET /album?browseId=MPREb_...` | アルバムページの収録曲 (トラック順)。公式APIでプレイリストが取れない時の予備 |

## デプロイ (無料枠で十分)

```sh
cd apps/ym-playlist/worker
npx wrangler login
npx wrangler deploy
```

表示された URL (例: `https://ym-playlist-proxy.<アカウント>.workers.dev`) を
`apps/ym-playlist/index.html` の `YTM_PROXY_URL` に設定する (末尾スラッシュなし)。

ダッシュボードから作る場合: Workers & Pages → Create → Worker → `worker.js` の内容を貼り付けて Deploy。

## 注意

- 非公式の内部 API を使うため、YouTube Music 側の仕様変更で動かなくなる可能性がある。
- 許可する Origin は `worker.js` の `ALLOWED_ORIGINS` で設定。
