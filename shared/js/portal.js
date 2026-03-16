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
// ============================================================
const APPS = [
  {
    id:      "review",
    name:    "ReView",
    desc:    "漫画・ゲームなどのレビューサイト。独自スコアとフィルタリングで作品を探せます。",
    emoji:   "⭐",
    color:   "#f0c040",
    bgColor: "#13110a",
    tags:    ["漫画", "ゲーム", "レビュー"],
    href:    "./apps/review/index.html",
    status:  "live",
  },
  {
    id:      "spotify-playlist",
    name:    "Spotify-playlist",
    desc:    "アーティスト毎にプレイリストを自動生成する",
    emoji:   "🎵",
    color:   "#91f040",
    bgColor: "#13110a",
    tags:    ["音楽"],
    href:    "./apps/spotify-playlist/index.html",
    status:  "live",
  },
  

  // ---- 追加例（コメントアウトを外すだけで表示される）----
  // {
  //   id:      "blog",
  //   name:    "Blog",
  //   desc:    "日々の記録や技術メモを発信するブログ。",
  //   emoji:   "📝",
  //   color:   "#60a5fa",
  //   bgColor: "#080d14",
  //   tags:    ["日記", "技術"],
  //   href:    "./apps/blog/index.html",
  //   status:  "wip",   // "wip" = 開発中バッジ
  // },
  // {
  //   id:      "tools",
  //   name:    "Tools",
  //   desc:    "自作の便利ツール集。",
  //   emoji:   "🔧",
  //   color:   "#a78bfa",
  //   bgColor: "#0d0a14",
  //   tags:    ["ツール"],
  //   href:    "./apps/tools/index.html",
  //   status:  "soon",  // "soon" = 近日公開（カードが薄く表示）
  // },
];

// ============================================================
//  ポータルUI を構築
// ============================================================
function buildPortal() {
  // --- ヘッダー ---
  document.getElementById('portal-title').innerHTML =
    PORTAL_CONFIG.title.split('').map((ch, i) =>
      ch === ' ' ? ' ' : `<span style="animation-delay:${i*40}ms">${ch}</span>`
    ).join('');

  document.getElementById('portal-subtitle').textContent = PORTAL_CONFIG.subtitle;

  // --- アプリグリッド ---
  const grid = document.getElementById('app-grid');
  const statusLabel = { live: '公開中', wip: '開発中', soon: '近日公開' };
  const statusDotClass = { live: '', wip: 'wip', soon: 'soon' };

  APPS.forEach((app, i) => {
    const card = document.createElement('a');
    card.className = 'app-card' + (app.status === 'soon' ? ' coming-soon' : '');
    card.href = app.status !== 'soon' ? app.href : '#';
    card.style.setProperty('--card-color', app.color);
    card.style.setProperty('--card-bg', app.bgColor);
    card.style.animationDelay = `${i * 80}ms`;

    card.innerHTML = `
      <div class="app-card-banner">
        <span style="position:relative;z-index:1">${app.emoji}</span>
      </div>
      <div class="app-card-body">
        <div class="app-card-name">${app.name}</div>
        <p class="app-card-desc">${app.desc}</p>
        <div class="app-card-tags">
          ${app.tags.map(t => `<span class="app-card-tag">${t}</span>`).join('')}
        </div>
      </div>
      <div class="app-card-footer">
        <span class="app-card-status">
          <span class="status-dot ${statusDotClass[app.status]}"></span>
          ${statusLabel[app.status]}
        </span>
        <span class="app-card-arrow">→</span>
      </div>
    `;
    grid.appendChild(card);
  });

  // --- フッター ---
  document.getElementById('portal-footer').textContent =
    `© ${new Date().getFullYear()} ${PORTAL_CONFIG.owner}`;
}

document.addEventListener('DOMContentLoaded', buildPortal);
