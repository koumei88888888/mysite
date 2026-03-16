// ============================================================
//  portal.js — ポータルホーム アプリ定義
//  shared/js/portal.js
//
//  新しいサービスを追加するには APPS 配列にオブジェクトを追加するだけ。
// ============================================================

const PORTAL_CONFIG = {
  title:    "MY PORTAL",
  subtitle: "サービス一覧",
  owner:    "My GitHub Pages",
};

// ============================================================
//  アプリ（サービス）定義
//  status: "live" | "wip" | "soon"
//  image:  バナー画像のURL（省略またはnullで頭文字のデフォルト表示）
// ============================================================
const APPS = [
  {
    id:     "review",
    name:   "ReView",
    desc:   "漫画・ゲームなどのレビューサイト。独自スコアとフィルタリングで作品を探せます。",
    image:  "",           // 例: "./apps/review/banner.png"
    color:  "#f0c040",
    tags:   ["漫画", "ゲーム", "レビュー"],
    href:   "./apps/review/index.html",
    status: "live",
  },
  {
    id:     "spotify-playlist",
    name:   "Spotify-playlist",
    desc:   "アーティスト毎にプレイリストを自動生成する",
    image:  "",
    color:  "#91f040",
    tags:   ["音楽"],
    href:   "./apps/spotify-playlist/index.html",
    status: "live",
  },

  // ---- 追加例（コメントアウトを外すだけで表示される）----
  // {
  //   id:     "blog",
  //   name:   "Blog",
  //   desc:   "日々の記録や技術メモを発信するブログ。",
  //   image:  "./apps/blog/banner.png",
  //   color:  "#60a5fa",
  //   tags:   ["日記", "技術"],
  //   href:   "./apps/blog/index.html",
  //   status: "wip",
  // },
];

// ============================================================
//  ポータルUI を構築
// ============================================================
function buildPortal() {
  // --- ヘッダー ---
  document.getElementById('portal-title').innerHTML =
    PORTAL_CONFIG.title.split('').map((ch, i) =>
      ch === ' ' ? ' ' : '<span style="animation-delay:' + (i * 40) + 'ms">' + ch + '</span>'
    ).join('');

  document.getElementById('portal-subtitle').textContent = PORTAL_CONFIG.subtitle;

  // --- アプリグリッド ---
  const grid = document.getElementById('app-grid');
  const statusLabel    = { live: '公開中', wip: '開発中', soon: '近日公開' };
  const statusDotClass = { live: '',       wip: 'wip',    soon: 'soon'      };

  APPS.forEach(function(app, i) {
    const card = document.createElement('a');
    card.className = 'app-card' + (app.status === 'soon' ? ' coming-soon' : '');
    card.href = app.status !== 'soon' ? app.href : '#';
    card.style.setProperty('--card-color', app.color);
    card.style.animationDelay = (i * 80) + 'ms';

    // バナー: image があれば img タグ、なければ頭文字をデフォルト表示
    var bannerContent = app.image
      ? '<img src="' + app.image + '" alt="' + app.name + '" class="app-card-banner-img">'
      : '<span class="app-card-banner-default">' + app.name.charAt(0).toUpperCase() + '</span>';

    var tagsHTML = app.tags.map(function(t) {
      return '<span class="app-card-tag">' + t + '</span>';
    }).join('');

    card.innerHTML =
      '<div class="app-card-banner">' + bannerContent + '</div>' +
      '<div class="app-card-body">' +
        '<div class="app-card-name">' + app.name + '</div>' +
        '<p class="app-card-desc">' + app.desc + '</p>' +
        '<div class="app-card-tags">' + tagsHTML + '</div>' +
      '</div>' +
      '<div class="app-card-footer">' +
        '<span class="app-card-status">' +
          '<span class="status-dot ' + statusDotClass[app.status] + '"></span>' +
          statusLabel[app.status] +
        '</span>' +
        '<span class="app-card-arrow">-></span>' +
      '</div>';

    grid.appendChild(card);
  });

  // --- フッター ---
  document.getElementById('portal-footer').textContent =
    '© ' + new Date().getFullYear() + ' ' + PORTAL_CONFIG.owner;
}

document.addEventListener('DOMContentLoaded', buildPortal);