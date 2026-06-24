# 初見ユーザー向けオンボーディング ― 実装仕様書

このドキュメントは、初見ユーザーが説明書なしで価値を理解し使い始められるようにするための機能案を、
**別の実装者（人／AI）がそのまま着手できる仕様**として記述したもの。

各仕様は共通スキーマで書く。実装者はコードベースの以下の前提に依存してよい。

### 0. コードベース前提（共有コンテキスト）

- フレームワーク非依存。`<script>` で `js/music-theory.js` → `fretboard.js` → `renderer.js` →
  `audio.js` → `app.js` の順に読み込む。各モジュールは IIFE で `window.TT.*` に公開。
- **状態は単一オブジェクト** `state`（`js/app.js`）。現フィールド：
  `scaleRoot, scaleKey, chordRoot, chordKey, noChord, noScale, fretStart, fretEnd,
  displayMode('name'|'degree'|'name-degree'), palette('color'|'mono'),
  timbreScale, timbreChord, octaveScale, octaveChord`。
- **永続化**：`persist()` が (a) `localStorage['tone-transit:state']` に `state` 全体を JSON 保存、
  (b) URL クエリを `history.replaceState` で更新。
  起動順は `readStorage()` → `readUrl()`（URLが優先）→ `normalizeState()`（不正値を既定へ）。
  URLパラメータ：`root scale chord from to mode pal toneS toneC octS octC nochord noscale`。
  **新フィールドを足すときは必ず** `readUrl/persist/normalizeState/syncControls` の4箇所を更新する。
- **描画**：`fretboard.buildModel(state, data)` が純粋にモデルを返す。各セル（音）の構造：
  `{ fret, pitchClass, name, degree, inScale, isChordTone, isChordRoot, isScaleRoot,
     isGuide, outOfScale, visible }`。
  `renderer.render(model, ariaLabel)` が `<svg>` を返し、音は `<g class="tt-note ...">` で描かれる。
- **音**：`audio.js` の `playScale/playChord/playScaleChord`。`note(timbre, midi, when, dur, vol)` が
  `when`（= `ctx.currentTime + オフセット`）で個別ノートをスケジュール。スケールは `step=0.34` 秒間隔。
- **テスト方針**：追加依存ゼロ。`node --test`。純粋ロジックは `test/*.test.js` に。
  DOM は `test/renderer.test.js` の最小スタブ方式を踏襲（jsdom 不使用）。
- **i18n 方針**：UI文言はまだ集約されていない。文言を増やす仕様では、可能なら定数化して将来の集約に備える。

### 仕様スキーマ（各項目の見出し）

`目的 / ユーザーストーリー / 機能要件 / 状態・データ / UI・DOM / 影響ファイル / 受け入れ条件 / テスト /
エッジケース / 非対象 / 依存`

優先度：着手順は §10 のバックログ表を参照。

---

## SPEC-01 プリセット「例を試す」

**目的**：初見の「最初の一手」を提供する。意味のある盤面にワンクリックで到達させる。

**ユーザーストーリー**：理論が分からない初見が、イントロ直下のチップを1つ押すと、説明付きの
代表的な盤面（例：ドミナントの解決）が即表示される。

**機能要件**
1. イントロ直下に最大6個のプリセットチップを横並びで表示。
2. チップは `label`（短い名前）と `caption`（一行の意味）を持つ。
3. クリックで対応する状態を適用し、`update()` を呼ぶ。URLも更新される（共有可能）。
4. 適用後、現在選択中のプリセットがあればチップを `is-active` 表示にする（完全一致時のみ）。
5. プリセット一覧は `app.js` 内の定数で定義し、データ追加だけで増減できる。

**状態・データ**
- 新規 `state` フィールドは不要。プリセット適用＝既存フィールドへの代入。
- プリセット定義（例。値は既存キーに準拠）：
  ```js
  var PRESETS = [
    { label: 'ドミナントの解決', caption: 'G7 上の C メジャー（B=3rd, F=♭7）',
      patch: { scaleRoot:'C', scaleKey:'major', chordRoot:'G', chordKey:'7', noScale:false, noChord:false } },
    { label: 'ブルース', caption: 'A7 上の A マイナーペンタ',
      patch: { scaleRoot:'A', scaleKey:'minor-pentatonic', chordRoot:'A', chordKey:'7' } },
    { label: 'モーダル', caption: 'Dm7 上の D ドリアン',
      patch: { scaleRoot:'D', scaleKey:'dorian', chordRoot:'D', chordKey:'m7' } },
    { label: 'コードトーンだけ', caption: 'スケールを外して G7 の構成音のみ',
      patch: { noScale:true, chordRoot:'G', chordKey:'7' } }
  ];
  ```
  ※ `scaleKey`/`chordKey` は `data/*.json` に存在するキーのみ使うこと（存在しなければ `normalizeState` が
  既定へ戻すため、プリセットが無効化される）。`minor-pentatonic` 等が無ければ既存キーに差し替える。

**UI・DOM**
- 場所：`index.html` の `.tt-intro` の直後に `<div class="tt-presets" id="presets" aria-label="例を試す">`。
- チップは JS で生成（`<button type="button" class="tt-preset-chip">`、`label` を本文、`caption` を `title`）。
- CSS：`css/app.css` に `.tt-presets`（flex, wrap, gap）と `.tt-preset-chip`（`.tt-reco-chip` を踏襲）。

**影響ファイル**
- `js/app.js`：`PRESETS` 定数、`renderPresets()`（生成＋クリックで `Object.assign(state, patch)` →
  `normalizeState()` → `update()`）、`cacheEls` に `presets` 追加、`boot()` で `renderPresets()` 呼び出し、
  `update()` 末尾でアクティブ状態を再評価。
- `index.html`：`#presets` コンテナ。
- `css/app.css`：チップ用スタイル。

**受け入れ条件**
- 初期表示でチップが見える。クリックすると盤面・タイトル・構成音・URLが切り替わる。
- 適用後にページ再読込しても同じ盤面（URL/localStorage 経由）。
- 存在しない `scaleKey/chordKey` を含むプリセットは適用しても既定に正規化され、クラッシュしない。

**テスト**
- `PRESETS` の各 `patch.scaleKey`/`patch.chordKey` が `data/scales.json`/`chords.json` に存在することを
  `test/data.test.js`（または新規 `test/presets.test.js`）で検証（`PRESETS` を `module.exports` で公開するか、
  app.js を require 可能にできない場合は定数を別ファイル `js/presets.js` に切り出して両者から参照）。

**エッジケース**：チップ多すぎ→折り返し。`noScale && noChord` になる patch は禁止（空盤面）。

**非対象**：プリセットの編集UI、ユーザー定義プリセットの保存。

**依存**：なし。

---

## SPEC-02 ヒーローの3ステップ説明

**目的**：「何が分かるツールか」を3秒で伝え、直帰を減らす。

**機能要件**
1. `.tt-intro` を「① スケールとコードを選ぶ → ② 各音が“今のコードに対して何度か”を色と形で表示 →
   ③ 共有・印刷」の3ステップ表記に置換。
2. 各ステップは短文＋（任意で）絵文字/アイコン。装飾は CSS のみ、JS 不要。

**UI・DOM**：`index.html` の `.tt-intro` を `<ol class="tt-steps">` 等へ。`css/app.css` に `.tt-steps`。

**影響ファイル**：`index.html`, `css/app.css`。

**受け入れ条件**：3ステップが1行〜2行で読め、モバイル幅でも崩れない。

**テスト**：不要（静的）。視認確認のみ。

**非対象**：アニメーション。**依存**：なし。

---

## SPEC-03 用語ツールチップ＋「読み方ガイド」

**目的**：理論用語（ガイドトーン／テンション／スケール外コードトーン）の壁を文脈内で下げる。

**機能要件**
1. 凡例 `.tt-legend-item` の各役割に `title` を付与（1文の定義）。文言定数：
   - ルート(1)：「スケール／コードの基準音」
   - ガイドトーン：「コードの 3rd と 7th。コードの明暗・機能を決める音」
   - コードトーン：「今のコードの構成音」
   - スケール音/テンション：「コードには含まれないがスケール上にある音（緊張色）」
   - スケール外コードトーン：「コード構成音だがスケールに無い＝噛み合っていない音」
2. 凡例の先頭に一文の読み方ガイド（強調なし）：「四角＝ルート、リング付き＝コードの要(3rd/7th)、
   青＝コードの音、薄色＝スケールの音」。
3. （任意拡張）`title` だけでなくクリックで開く軽量ポップオーバー。第一段は `title` のみで可。

**UI・DOM**：`index.html` の `.tt-legend` 内に説明行＋各 `.tt-legend-item` へ `title`。

**影響ファイル**：`index.html`（＋ポップオーバー化するなら `app.js`/`css`）。

**受け入れ条件**：各凡例にホバーで定義が出る。読み方ガイド行が常時見える。

**テスト**：不要（静的）。**非対象**：用語集ページ本体（SPEC-11）。**依存**：なし。

---

## SPEC-04 初回コーチマーク（1回だけのヒント）

**目的**：主要機能（コード変更・試聴・共有）の発見性を、常用者を邪魔せず上げる。

**機能要件**
1. **初回訪問時のみ**、2〜3個の吹き出しを主要コントロール付近に順次表示
   （例：「ここでコードを変える」「▶ で音を確認」「リンクで共有」）。
2. 「閉じる」または最後まで進むと既読を記録し、以後表示しない。
3. ヘルプから手動再表示できる導線（任意）。

**状態・データ**
- 既読フラグは **`state` とは別キー** `localStorage['tone-transit:onboarded'] = '1'`。
  （`state` に混ぜると URL に載って共有先で誤作動するため分離する。）

**UI・DOM**：`app.js` で吹き出し要素を動的生成。対象要素は `#chord`, `#auPlayScale`, `#shareBtn` 付近に
絶対配置。`css/app.css` に `.tt-coach`。

**影響ファイル**：`js/app.js`（初回判定・表示制御）, `css/app.css`。

**受け入れ条件**：初回のみ表示／閉じると再表示されない／localStorage 不可環境でも例外で落ちない
（`try/catch`、既存 `readStorage` と同様）。

**テスト**：表示制御は DOM 依存のため手動確認中心。既読判定の純粋関数（`shouldShowCoach(storageVal)`）に
切り出せば `node:test` で単体化可能。

**エッジケース**：localStorage 無効→「初回扱い」だが落ちない。`prefers-reduced-motion`→アニメ無効。

**非対象**：多段ツアー（SPEC-12）。**依存**：なし。

---

## SPEC-05 自然言語サマリー（今の状態を一文で）

**目的**：図と理論を橋渡しし、「何を見ればいいか」を毎回言語化する。

**機能要件**
1. プレビュー上（盤の直前）に、現在のモデルから生成した1〜2文の説明を表示。
2. 文の構成要素：スケール名×コード名、ガイドトーン（音名+度数）、テンション、
   スケール外コードトーンの有無（噛み合いの良し悪し）。
3. `noScale`/`noChord` の各状態でも破綻しない文面に分岐。

**状態・データ**
- 新規状態なし。入力は `buildModel` の結果（または `state`+`data`）。
- **純粋関数として実装**：`summary(model) -> string`。`js/music-theory.js` か新規 `js/summary.js` に置き、
  `TT.summary` で公開。モデルから guide/tension/outOfScale を集計。

**UI・DOM**：`index.html` の `.tt-sheet--main` 内、`#sheetTitle` の下に `<p class="tt-summary" id="summary">`。
`update()` で `els.summary.textContent = TT.summary(model)`（**textContent で安全に**）。

**影響ファイル**：`js/summary.js`（新規）, `index.html`, `css/app.css`, `js/app.js`（`update()`＋`cacheEls`）。

**受け入れ条件**：代表ケースで意味的に正しい文（下記テスト）。XSSなし（textContent）。

**テスト**（新規 `test/summary.test.js`、純粋関数）
- C major × G7 → ガイドトーンに「B(3rd)」「F(♭7)」を含み、スケール外コードトーンが「なし」。
- C major × E7 → スケール外コードトーン「G♯(3rd)」を含む文。
- `noChord` / `noScale` / 両方なし、で例外なく妥当な文を返す。

**エッジケース**：テンションが多い/ゼロ。重複音名。**非対象**：多言語文面。**依存**：なし。

---

## SPEC-06 再生と図の同期ハイライト

**目的**：耳・目・度数を結びつけ、試聴の学習効果を最大化する（体験の核）。

**機能要件**
1. `playScale`/`playChord`/`playScaleChord` の再生に合わせ、鳴っている音の `<g class="tt-note">` を
   点灯（`is-playing` 付与→消灯）。
2. ミックスではスケール音・コード音の双方を点灯。
3. 新規再生・`stop()` で既存の点灯を全クリア。
4. `prefers-reduced-motion: reduce` 時はアニメーションを抑制（点灯の有無のみ、トランジション無し）。

**状態・データ**
- 各 `<g>` に発見キーを付与：`renderer` で `data-pc`（pitchClass）と `data-fret` を出力。
- スケジュール情報をUIへ渡す：`audio` の各 `playX` が**スケジュール配列**を返す or コールバックを受ける。
  推奨IF：
  ```js
  // 返り値: [{ pitchClass, fret?, when }] (when は ctx.currentTime 基準の絶対秒)
  // もしくは onNote(cb) を受け、cb({pitchClass, when}) を呼ぶ。
  ```
  音側は MIDI から `pitchClass = midi % 12`。`fret` は音側に無いので、UIは**pitchClass一致の全ノート**を
  点灯（同度の音をまとめて光らせる＝学習上もむしろ良い）。
- UIスケジューラ：`when - ctx.currentTime` を遅延に `setTimeout` で点灯／消灯。`audio` が `ctx` を
  公開していないため、`audio` 側にスケジューラを持たせ DOM 非依存のイベントを emit する設計が良い。

**UI・DOM**：`css/app.css` に `.tt-note.is-playing .tt-shape { ... }`（明るい縁取り等）。

**影響ファイル**：`js/audio.js`（イベント/返り値の追加）, `js/renderer.js`（`data-*` 出力）,
`js/app.js`（再生イベント購読→クラス付与/解除）, `css/app.css`。

**受け入れ条件**：スケール再生で音名順にノートが点灯／`stop` で消灯／reduced-motion で過剰演出なし。

**テスト**
- `audio` のスケジュール生成（純粋部分）：`scheduleScale(intervals, base, step)` が
  `[{pitchClass, when}]` を正しい時刻・順で返すことを `test/audio*.test.js` に追加（AudioContextはモック済み）。
- DOM点灯は手動確認。

**エッジケース**：連打（前回タイマー全クリア必須）。タブ非アクティブ時のタイマー遅延は許容。

**非対象**：弦・フレット単位の厳密な発音位置再現。**依存**：なし。

---

## SPEC-07 ノートのホバー/タップで意味表示

**目的**：静的な図を「触れる教材」にする。

**機能要件**
1. ノート（`<g class="tt-note">`）にホバー/タップで、そのセルの意味を提示
   （例：「B — G7 の 3rd（ガイドトーン）／スケール内」）。
2. 同じ `degree`（または pitchClass）を盤上で軽く強調（任意）。
3. SVG内 `<title>` でも同等情報を提供（スクリーンリーダー対応）。

**状態・データ**：新規なし。文面はセル（`name, degree, isGuide, isChordTone, inScale, outOfScale`）から生成。
`describeCell(cell) -> string` を純粋関数で。

**UI・DOM**：`renderer.drawNote` で各 `<g>` に `<title>` を追加（最小実装）。リッチ版は `app.js` で
ホバーイベント→ツールチップ要素。

**影響ファイル**：`js/renderer.js`（`<title>`/`describeCell`）, （リッチ版）`js/app.js`, `css/app.css`。

**受け入れ条件**：各ノートにホバーで説明。SRが `<title>` を読む。

**テスト**：`describeCell` の単体テスト（renderer もしくは theory に置く）。代表セルで期待文字列。

**非対象**：ドラッグ操作。**依存**：なし。

---

## SPEC-08 ビギナー/アドバンスト表示モード

**目的**：初心者の認知負荷を下げる（テンション・スケール外を初期非表示）。

**機能要件**
1. 表示レベル切替 `level: 'beginner' | 'advanced'`。既定 `beginner`。
2. `beginner`：ルート・コードトーン・ガイドのみ強調、スケール音/テンションは控えめ or 非表示、
   ラベルはやさしい語彙。`advanced`：現状フル。
3. 表示ツールバー（`.tt-preview-bar`）にセグメント切替を追加。

**状態・データ**
- `state.level` を新設。**4箇所更新**：`readUrl`（`lvl`）/`persist`/`normalizeState`（許可値以外は `beginner`）/
  `syncControls`。
- 表示への反映：`fretboard.noteVisible` と `renderer` のラベル/クラスに `level` を渡す
  （`buildModel` が `model.level` を出力、`render` が参照）。

**UI・DOM**：`index.html` の `.tt-preview-bar__left` にラジオセグメント（既存 `.tt-segments` 流用）。

**影響ファイル**：`js/app.js`, `js/fretboard.js`, `js/renderer.js`, `index.html`, `css`。

**受け入れ条件**：`beginner` で情報量が減る／URL共有・再読込で保持／不正 `lvl` は既定へ。

**テスト**：`buildModel` で `level:'beginner'` 時に `visible`/強調が期待通り（`test/fretboard.test.js`）。

**エッジケース**：旧共有リンク（`lvl` 無し）→ `beginner` 既定。**依存**：なし。

---

## SPEC-09 ミニクイズ／チャレンジ

**目的**：能動的関与で滞在・再訪を伸ばす。

**機能要件**
1. 現在の盤面から自動出題：「ガイドトーンはどれ？」「G7 の 9th は？」等。
2. 盤上のノードをタップで解答→正誤フィードバック。
3. 出題は既存モデルから生成（追加データ不要）。

**状態・データ**：クイズ状態は一時的（`state`/URLに載せない）。正解集合はモデルから算出
（`quizFor(model) -> {question, correctPitchClasses}`、純粋関数）。

**UI・DOM**：`app.js` のクイズUI、ノードクリックのヒットテスト（`data-pc`/`data-fret` を利用＝SPEC-06と共有）。

**影響ファイル**：`js/quiz.js`（新規, 純粋ロジック）, `js/app.js`, `css`。

**受け入れ条件**：出題と判定が正しい（テスト）／盤を変えると出題も更新。

**テスト**：`quizFor` の単体テスト。代表盤面で正解集合を検証。

**非対象**：スコア保存・ランキング。**依存**：SPEC-06 のノード `data-*`（無くてもクリック実装可）。

---

## SPEC-10 共有時のタイトル動的化

**目的**：共有リンク/タブ/履歴で内容が分かるようにし、初見流入の質を上げる（OGPの軽量版）。

**機能要件**
1. `update()`/`persist()` 時に `document.title` を「C メジャー × G7 — ToneTransit」のように更新。
2. 文面は `titleFor(model)` を再利用（既存関数）＋サフィックス。

**状態・データ**：新規なし。

**影響ファイル**：`js/app.js`（`update()` 末尾で `document.title = titleFor(model) + ' — ToneTransit'`）。

**受け入れ条件**：状態変更でタブ名が変わる／空盤面でも妥当な既定。

**テスト**：`titleFor` は既存ロジック。手動確認で可。**依存**：なし。

---

## SPEC-11 用語集（グロッサリー）

**目的**：体系的に学びたい初見の受け皿。SPEC-03 のツールチップからの深掘り先。

**機能要件**
1. 折りたたみ `<details>` の用語集セクション（度数・ガイドトーン・テンション・ダイアトニック・モード等）。
2. SPEC-03 のツールチップ用語から該当アンカーへリンク（`#glossary-guide-tone` 等）。

**UI・DOM**：`index.html` 下部に静的セクション。JS不要。

**影響ファイル**：`index.html`, `css`。**受け入れ条件**：用語が読め、アンカー遷移する。

**テスト**：不要。**依存**：なし（SPEC-03 と相互リンク）。

---

## SPEC-12 インタラクティブ・ツアー（高コスト・将来）

**目的**：初回離脱を最小化する段階ガイド。

**機能要件**：「スケール→コード→試聴→共有」を実操作させる多段ステップ。SPEC-04 の簡易版で効果検証後に着手。
ライブラリ導入は「追加依存ゼロ」方針と要相談（自前実装を推奨）。

**影響ファイル**：`js/tour.js`（新規）, `css`, `app.js`。**依存**：SPEC-04 の既読フラグ機構を流用。

---

## SPEC-13 画像ダウンロード / 埋め込み（拡散→初見導線）

**目的**：指板図を外部（ブログ/SNS）に出し、初見と出会う面を増やす。

**機能要件**
1. 「画像をダウンロード」ボタンで現在の SVG を PNG 保存。
2. （拡張）SVG をそのままダウンロード／コピー。

**状態・データ**：新規なし。`renderer` が返す `<svg>` を `XMLSerializer` →
`Image`/`canvas` で PNG 化（クライアントのみ、サーバ不要）。

**UI・DOM**：`.tt-preview-bar__right` にボタン追加。

**影響ファイル**：`js/app.js`（エクスポート関数）, `index.html`, `css`。

**受け入れ条件**：押すと現在の盤面の画像が保存される／モノトーン・カラー両対応。

**テスト**：SVG→文字列化の純粋部分を単体化可。画像化は手動確認。

**エッジケース**：フォント埋め込み（PNG化時の文字化け）に注意。**依存**：なし。

---

## SPEC-14 ライト/ダークテーマ

**目的**：明所での視認性・好みに対応し第一印象を上げる。

**機能要件**
1. `prefers-color-scheme` 追従＋手動トグル（`theme: 'auto'|'light'|'dark'`）。
2. 印刷は既に明背景（`print.css`）＝画面テーマと独立に保つ。

**状態・データ**：`state.theme` 新設（4箇所更新）。CSS変数（`:root` のカラートークン）をテーマで切替。

**影響ファイル**：`css/app.css`（変数のテーマ分岐）, `js/app.js`, `index.html`。

**受け入れ条件**：切替が全UI・凡例・指板に反映／再読込で保持／印刷は不変。

**テスト**：手動確認。**依存**：なし。

---

## SPEC-15 多言語対応（i18n・将来）

**目的**：英語話者・海外初見への到達。

**機能要件**
1. UI文言を1モジュール（`js/i18n.js`：`{ ja:{...}, en:{...} }`）に集約。
2. `lang` 切替（既定はブラウザ言語）。コア価値（色・形・度数）は言語非依存。

**状態・データ**：`state.lang` 新設（4箇所更新）。スケール/コードの `description`/`name` は
データ側に `name_en` 等を追加するか、英語キー併記。

**影響ファイル**：全 `index.html` 文言, `js/app.js`, `data/*.json`（任意）, 新規 `js/i18n.js`。

**受け入れ条件**：言語切替で主要文言が切替／未翻訳はフォールバック。

**テスト**：辞書のキー網羅テスト（jaのキー集合 ⊆ en）。**依存**：先に文言集約が必要。

---

## 10. バックログ（着手順の目安）

| ID | 案 | 種別 | コスト | 効果 | 依存 |
|---|---|---|---|---|---|
| SPEC-01 | プリセット「例を試す」 | 導線 | 低 | 高 | なし |
| SPEC-02 | ヒーロー3ステップ | 第一印象 | 低 | 中 | なし |
| SPEC-03 | 用語ツールチップ＋読み方ガイド | 学習 | 低 | 高 | なし |
| SPEC-10 | 共有時タイトル動的化 | 拡散 | 低 | 中 | なし |
| SPEC-05 | 自然言語サマリー | 学習 | 中 | 高 | なし |
| SPEC-04 | 初回コーチマーク | 発見性 | 中 | 中 | なし |
| SPEC-06 | 再生と図の同期 | 学習 | 中 | 高 | なし |
| SPEC-07 | ノートのホバー解説 | 学習 | 中 | 中 | なし |
| SPEC-08 | ビギナー/アドバンスト | 認知負荷 | 中 | 中 | なし |
| SPEC-13 | 画像ダウンロード | 拡散 | 中 | 中 | なし |
| SPEC-09 | ミニクイズ | 関与 | 中 | 中 | SPEC-06(任意) |
| SPEC-11 | 用語集 | 学習 | 低 | 中 | SPEC-03 |
| SPEC-14 | ライト/ダークテーマ | 第一印象 | 中 | 中 | なし |
| SPEC-12 | インタラクティブ・ツアー | 導線 | 高 | 高 | SPEC-04 |
| SPEC-15 | 多言語(i18n) | 到達 | 高 | 中 | 文言集約 |

**推奨スターター**：SPEC-01 / 03 / 02 / 10（いずれも低コスト・新規依存なし）→ 体験を決定づける
SPEC-05・06。各 SPEC は独立して着手可能。新フィールドを足す SPEC（08/14/15）は
「`readUrl`・`persist`・`normalizeState`・`syncControls` の4点同時更新」を必ず守ること。
