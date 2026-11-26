/**
 * ym-playlist 用 YouTube Music 中継 Worker (Cloudflare Workers)
 *
 * ブラウザから music.youtube.com の内部API (youtubei) は CORS で呼べないため、
 * この Worker が代わりに取得して必要な部分だけを返す。
 *
 *   GET /discography?channelId=UC...  → アーティストの全アルバム/シングル/EP
 *   GET /album?browseId=MPREb_...     → アルバムの収録曲 (videoId, トラック順)
 */

const ALLOWED_ORIGINS = [
  'https://koumei88888888.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const YTM_URL = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
const CONTEXT = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20241120.01.00', hl: 'ja', gl: 'JP' },
};

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    try {
      let body;
      if (url.pathname === '/discography') {
        const channelId = url.searchParams.get('channelId') || '';
        if (!/^UC[\w-]{22}$/.test(channelId)) return json({ error: 'invalid channelId' }, 400, cors);
        body = await getDiscography(channelId);
      } else if (url.pathname === '/album') {
        const browseId = url.searchParams.get('browseId') || '';
        if (!/^MPREb_[\w-]+$/.test(browseId)) return json({ error: 'invalid browseId' }, 400, cors);
        body = await getAlbum(browseId);
      } else {
        return json({ error: 'not found' }, 404, cors);
      }
      return json(body, 200, { ...cors, 'Cache-Control': 'public, max-age=1800' });
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, cors);
    }
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function browse(payload) {
  const r = await fetch(YTM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, context: CONTEXT }),
  });
  if (!r.ok) throw new Error(`YouTube Music browse failed: ${r.status}`);
  return r.json();
}

function walk(o, fn) {
  if (!o || typeof o !== 'object') return;
  fn(o);
  for (const k in o) walk(o[k], fn);
}

const runsText = (t) => (t?.runs || []).map((r) => r.text).join('');

/** musicTwoRowItemRenderer (アルバム/シングルのカード) を集める */
function collectReleases(data, map) {
  walk(data, (o) => {
    const r = o.musicTwoRowItemRenderer;
    if (!r) return;
    const browseId = r.navigationEndpoint?.browseEndpoint?.browseId || '';
    if (!browseId.startsWith('MPREb_')) return; // プレイリスト・アーティスト等は除外
    const subtitle = runsText(r.subtitle);
    const playlistId = (JSON.stringify(r).match(/OLAK5uy_[\w-]+/) || [])[0] || '';
    const year = (subtitle.match(/(\d{4})/) || [])[1] || '';
    let type = subtitle.includes('•') ? subtitle.split('•')[0].trim() : '';
    const prev = map.get(browseId);
    if (prev) { // 既出: 欠けている情報だけ補う
      prev.type ||= type;
      prev.playlistId ||= playlistId;
      prev.year ||= year;
      return;
    }
    map.set(browseId, { browseId, playlistId, title: runsText(r.title), type, year });
  });
}

/** グリッドの続き (件数が多い場合) */
function gridContinuation(data) {
  let token = '';
  walk(data, (o) => {
    if (token) return;
    const c = o.gridRenderer?.continuations?.[0]?.nextContinuationData?.continuation
      || o.gridContinuation?.continuations?.[0]?.nextContinuationData?.continuation
      || o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (c) token = c;
  });
  return token;
}

async function collectPaged(payload, map) {
  let data = await browse(payload);
  collectReleases(data, map);
  for (let i = 0; i < 20; i++) {
    const token = gridContinuation(data);
    if (!token) break;
    data = await browse({ continuation: token });
    collectReleases(data, map);
  }
}

async function getDiscography(channelId) {
  const map = new Map();
  const sources = [];

  // 1) アーティストページ: 「アルバム」「シングルと EP」の棚 + ディスコグラフィーへのリンク
  const artist = await browse({ browseId: channelId });
  const artistName = runsText(
    artist.header?.musicImmersiveHeaderRenderer?.title
    || artist.header?.musicVisualHeaderRenderer?.title
    || artist.header?.musicHeaderRenderer?.title
  );
  collectReleases(artist, map);
  sources.push('artist');

  const discoLinks = new Map();
  walk(artist, (o) => {
    const be = o.browseEndpoint;
    if (be?.browseId?.startsWith('MPAD')
      && be.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ARTIST_DISCOGRAPHY') {
      discoLinks.set(be.browseId + '|' + (be.params || ''), { browseId: be.browseId, params: be.params });
    }
  });

  // 2) ディスコグラフィーページ (全種類) + 棚ごとの「もっと見る」リンク先
  const pages = [{ browseId: 'MPAD' + channelId }, ...discoLinks.values()];
  for (const p of pages) {
    try {
      await collectPaged(p.params ? { browseId: p.browseId, params: p.params } : { browseId: p.browseId }, map);
      sources.push(p.browseId + (p.params ? '(' + p.params + ')' : ''));
    } catch (e) {
      // ディスコグラフィーページが無いアーティストもいる
    }
  }

  // 3) プレイリストIDがカードに無いものはアルバムページから補完
  for (const rel of map.values()) {
    if (rel.playlistId) continue;
    try {
      const alb = await browse({ browseId: rel.browseId });
      rel.playlistId = (JSON.stringify(alb).match(/OLAK5uy_[\w-]+/) || [])[0] || '';
    } catch (e) { /* クライアント側で /album を使う */ }
  }

  return { channelId, artistName, sources, releases: [...map.values()] };
}

async function getAlbum(browseId) {
  const data = await browse({ browseId });
  const tracks = [];
  const seen = new Set();
  walk(data, (o) => {
    const r = o.musicResponsiveListItemRenderer;
    if (!r) return;
    const videoId = r.playlistItemData?.videoId;
    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);
    tracks.push({
      videoId,
      title: runsText(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text),
      index: parseInt(runsText(r.index), 10) || tracks.length + 1,
    });
  });
  const playlistId = (JSON.stringify(data).match(/OLAK5uy_[\w-]+/) || [])[0] || '';
  return { browseId, playlistId, tracks };
}
