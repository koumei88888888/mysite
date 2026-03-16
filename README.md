# My Portal — GitHub Pages

## ディレクトリ構成

```
(リポジトリルート)/
│
├── index.html                  ← ★ ポータルホーム（入口）
│
├── shared/                     ← サービス横断の共通資産
│   ├── css/
│   │   └── portal.css          ← ポータルホームのスタイル
│   └── js/
│       └── portal.js           ← ★ アプリ定義はここに追加
│
└── apps/                       ← 各サービスをここに格納
    │
    ├── review/                 ← レビューサイト
    │   ├── index.html
    │   ├── css/style.css
    │   ├── js/
    │   │   ├── data.js         ← ★ レビューデータ・カテゴリ設定
    │   │   └── utils.js
    │   ├── manga/index.html
    │   └── game/index.html
    │
    └── （次のサービス）/       ← 新サービスはここに追加
```

---

## 新しいサービスを追加する手順

### 1. `shared/js/portal.js` の `APPS` 配列にエントリを追加

```js
{
  id:      "blog",
  name:    "Blog",
  desc:    "日々の記録や技術メモを発信するブログ。",
  emoji:   "📝",
  color:   "#60a5fa",       // アクセントカラー
  bgColor: "#080d14",       // バナー背景色
  tags:    ["日記", "技術"],
  href:    "./apps/blog/index.html",
  status:  "live",          // "live" | "wip" | "soon"
},
```

### 2. `apps/` 以下にサービスのフォルダを作成

```
apps/blog/
└── index.html
```

それだけでポータルホームにカードが表示されます。

---

## GitHub Pages への公開

1. このフォルダ全体をリポジトリのルートにプッシュ
2. `Settings` → `Pages` → Source を `main` ブランチのルート (`/`) に設定
3. `https://<username>.github.io/<repo>/` でポータルが公開されます
