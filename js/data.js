// =============================================
//  サイト設定 - ここを編集してカスタマイズ
// =============================================
const SITE_CONFIG = {
  title: "ReView",
  subtitle: "読む・見る・遊ぶ、すべてのレビュー",
  categories: [
    { id: "manga",  label: "漫画", emoji: "📚", color: "#e84393" },
    { id: "game",   label: "ゲーム", emoji: "🎮", color: "#7c3aed" },
  ]
};

// =============================================
//  レビューデータ - 記事を追加する場合はここに
// =============================================
const REVIEWS = [
  {
    id: 1,
    category: "manga",
    title: "鬼滅の刃",
    subtitle: "吾峠呼世晴 著",
    score: 4.8,
    date: "2025-03-10",
    tags: ["少年", "アクション", "和風"],
    thumbnail: "https://placehold.co/400x560/1a1a2e/e84393?text=鬼滅の刃",
    summary: "大正時代を舞台にした鬼殺の物語。圧倒的な画力と感情を揺さぶるストーリーで全世界を魅了。主人公・炭治郎の成長と仲間との絆が胸を打つ不朽の名作。",
  },
  {
    id: 2,
    category: "manga",
    title: "チェンソーマン",
    subtitle: "藤本タツキ 著",
    score: 4.7,
    date: "2025-02-28",
    tags: ["青年", "ダーク", "アクション"],
    thumbnail: "https://placehold.co/400x560/1a1a2e/e84393?text=チェンソーマン",
    summary: "悪魔と融合した少年・デンジの波乱の物語。独特のコマ割りと予測不能な展開が読者を翻弄する。現代漫画の最高峰の一つ。",
  },
  {
    id: 3,
    category: "manga",
    title: "葬送のフリーレン",
    subtitle: "山田鐘人 原作 / アベツカサ 作画",
    score: 4.9,
    date: "2025-01-15",
    tags: ["ファンタジー", "冒険", "叙事詩"],
    thumbnail: "https://placehold.co/400x560/1a1a2e/e84393?text=フリーレン",
    summary: "勇者パーティの魔法使い・フリーレンが紡ぐ「旅の後日談」。時間の流れ方が異なるエルフの視点から描かれる、人の命と記憶についての深遠な物語。",
  },
  {
    id: 4,
    category: "manga",
    title: "BLUE GIANT",
    subtitle: "石塚真一 著",
    score: 4.6,
    date: "2024-12-20",
    tags: ["音楽", "青春", "ジャズ"],
    thumbnail: "https://placehold.co/400x560/1a1a2e/e84393?text=BLUE+GIANT",
    summary: "ジャズに魂を捧げた少年・大の成長譚。「世界一のジャズプレイヤーになる」という夢に向かってひたむきに突き進む姿は、読む者すべての背中を押してくれる。",
  },
  {
    id: 5,
    category: "game",
    title: "エルデンリング",
    subtitle: "FromSoftware / バンダイナムコ",
    score: 4.9,
    date: "2025-03-05",
    tags: ["RPG", "アクション", "オープンワールド"],
    thumbnail: "https://placehold.co/400x560/0f0f23/7c3aed?text=ELDEN+RING",
    summary: "ジョージ・R・R・マーティン原案。広大な狭間の地を冒険するオープンワールドアクションRPG。理不尽とも思えるほどの難しさと、探索の自由度が唯一無二の体験を生む。",
  },
  {
    id: 6,
    category: "game",
    title: "ゼルダの伝説 ティアーズ オブ ザ キングダム",
    subtitle: "Nintendo",
    score: 4.8,
    date: "2025-02-10",
    tags: ["アクション", "アドベンチャー", "パズル"],
    thumbnail: "https://placehold.co/400x560/0f0f23/7c3aed?text=TOTK",
    summary: "前作を超えた革新的な物理演算と建築システム。ハイラルの空・地上・地底の三層を舞台に繰り広げられる冒険は、プレイヤーの想像力を無限に刺激する。",
  },
  {
    id: 7,
    category: "game",
    title: "FINAL FANTASY XVI",
    subtitle: "Square Enix",
    score: 4.2,
    date: "2025-01-08",
    tags: ["RPG", "アクション", "ダーク"],
    thumbnail: "https://placehold.co/400x560/0f0f23/7c3aed?text=FF+XVI",
    summary: "シリーズ初の本格アクションRPG。政治劇とクリスタルを巡る壮大なドラマが展開。召喚獣同士の巨大バトルは圧巻の映像体験を提供する。",
  },
  {
    id: 8,
    category: "game",
    title: "Hollow Knight",
    subtitle: "Team Cherry",
    score: 4.7,
    date: "2024-11-30",
    tags: ["メトロイドヴァニア", "インディー", "難関"],
    thumbnail: "https://placehold.co/400x560/0f0f23/7c3aed?text=Hollow+Knight",
    summary: "廃墟となった虫の王国を探索するメトロイドヴァニア。手描きの美麗なアートと絶妙な難易度調整、そして深い世界観がインディーゲームの頂点に君臨する。",
  },
];
