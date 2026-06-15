# ToneTransit

スケールとコードの関係を指板上で可視化するツール。
「今弾いている音が、現在のコードに対してどんな意味を持つのか」を表示する。

## 起動

データ (`data/*.json`) を `fetch` で読み込むため、ローカルサーバー経由で開く必要がある。

```bash
cd tone-transit
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

`index.html` をファイルとして直接開くと、ブラウザの CORS 制限で JSON が読めない点に注意。

## 使い方

- **ルート / スケール** — 表示するスケールを選ぶ
- **コード** — そのスケールを「どのコードから見るか」を選ぶ（ルートとは独立）
- **フレット範囲** — 0–24 の任意の範囲
- **表示モード** — 音名 / 度数 / 音名＋度数 / コードトーンのみ / ガイドトーン
- **コード進行** — `Dm7 | G7 | Cmaj7` のように入力するとチップが出る。クリックで現在のコードを切り替え、度数表示が追従する
- **印刷 / PDF** — そのまま `Ctrl/Cmd + P` で PDF 化できる
- **共有リンク** — 現在の状態を URL（`?root=C&scale=major&chord=G7...`）にしてコピー

状態は URL パラメータと `localStorage` に保存される（URL が優先）。

## 白黒印刷

色だけでなく形・塗り・枠線で区別する。

- ルート (1) … 黒い**四角**
- ガイドトーン (3rd / 7th) … 黒丸＋**二重リング**
- コードトーン … 黒丸（白文字）
- スケール音 / テンション … 白丸（黒枠・黒文字）

## 構成

```
index.html
css/   app.css（画面）, print.css（印刷）
js/    music-theory.js（純粋な楽典）, fretboard.js（モデル生成）,
       renderer.js（SVG 描画）, app.js（状態・配線）
data/  scales.json, chords.json
```

## テスト

追加依存ゼロ。Node 標準の `node:test` だけで動く。

```bash
npm test        # = node --test
```

`test/` の内容:
- `music-theory.test.js` — 度数計算・音名綴り・スケール度数など純粋な楽典
- `fretboard.test.js` — コード記号/進行のパース、モデル生成、スケールなし/コードなし/進行の優先など
- `renderer.test.js` — 最小 DOM スタブで SVG 構造（マーカー数・ナット・ルートの四角・ガイドのリング）を検証
- `data.test.js` — `scales.json` / `chords.json` の妥当性（音程の昇順・重複なし・度数の対応など）

## スケール / コードの追加

プログラムを変更せず、`data/scales.json` / `data/chords.json` に定義を足すだけで増やせる。

```json
// scales.json
"harmonic_minor": { "name": "Harmonic Minor", "intervals": [0,2,3,5,7,8,11] }
```

```json
// chords.json — intervals と degrees は同じ並び順で対応させる
"maj9": {
  "name": "Major 9", "symbol": "maj9",
  "intervals": [0,4,7,11,14], "degrees": ["1","3","5","7","9"],
  "aliases": ["maj9","M9"]
}
```

`degrees` はそのコード固有の度数表記。コードに含まれない音は、ドミナント基準の
汎用テンション表（`♭9 / 9 / ♯9 / 11 / ♯11 / ♭13 / 13` …）で自動的にラベル付けされる。
