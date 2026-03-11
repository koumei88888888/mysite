// ==============================
//  Helper utilities
// ==============================

/** カテゴリ設定を id で引く */
function getCategoryConfig(id) {
  return SITE_CONFIG.categories.find(c => c.id === id) || { label: id, emoji: "📄", color: "#888" };
}

/** ★ 表示文字列 (0.5刻み) */
function starsHTML(score) {
  const full  = Math.floor(score);
  const half  = score - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '⭐' : '') + '☆'.repeat(empty);
}

/** 日付を整形 */
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

/** レビューカード DOM を返す */
function createCard(review) {
  const cat = getCategoryConfig(review.category);

  const card = document.createElement('article');
  card.className = 'review-card';
  card.style.setProperty('--cat-color', cat.color);

  card.innerHTML = `
    <img class="card-thumb" src="${review.thumbnail}" alt="${review.title}" loading="lazy">
    <div class="card-body">
      <div class="card-meta">
        <span class="card-category" style="background:${cat.color}22;color:${cat.color}">
          ${cat.emoji} ${cat.label}
        </span>
        <span class="card-date">${formatDate(review.date)}</span>
      </div>
      <div class="card-title">${review.title}</div>
      <div class="card-subtitle">${review.subtitle}</div>
      <p class="card-summary">${review.summary}</p>
      <div class="card-tags">
        ${review.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}
      </div>
      <div class="card-footer">
        <div class="card-score">
          <span class="score-num">${review.score.toFixed(1)}</span>
          <span class="score-denom">/ 5.0</span>
        </div>
        <div class="card-stars">${starsHTML(review.score)}</div>
      </div>
    </div>
  `;
  return card;
}

/** ナビゲーションを生成して挿入 */
function buildNav(activePage) {
  const nav = document.getElementById('site-nav');
  if (!nav) return;

  const tabs = [
    { href: '../index.html', id: 'home', label: 'HOME', emoji: '🏠' },
    ...SITE_CONFIG.categories.map(c => ({
      href: `../${c.id}/index.html`,
      id: c.id,
      label: c.label,
      emoji: c.emoji,
    })),
  ];

  nav.innerHTML = `
    <div class="nav-inner">
      <span class="nav-logo">${SITE_CONFIG.title}</span>
      <ul class="nav-tabs">
        ${tabs.map(t => `
          <li>
            <a href="${t.href}" class="${activePage === t.id ? 'active' : ''}">
              <span>${t.emoji}</span> ${t.label}
            </a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

/** フッターを生成 */
function buildFooter() {
  const f = document.getElementById('site-footer');
  if (!f) return;
  f.innerHTML = `<p>© ${new Date().getFullYear()} ${SITE_CONFIG.title} — All reviews are personal opinions.</p>`;
}

/** カードにアニメーション遅延を付与 */
function applyCardDelay(container) {
  container.querySelectorAll('.review-card').forEach((c, i) => {
    c.style.animationDelay = `${i * 60}ms`;
  });
}
