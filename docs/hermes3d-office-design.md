# Hermes3D オフィス画面 基本デザイン（v1）

Goal: [[Projects/Goals/2026-09-30-hermes3dで自分のai会社が見えるようにする]] の Step 1。
決定日 2026-10-01。検証: `node scripts/check-office-design.mjs`（部屋の割り当てが実在の会社グループと地図の部屋に一致するかを機械的に確認する）。

## 前提（FACT: 2026-10-01 に読んだもの）

- Hermes3D (`/Users/yuma/Documents/Hermes/Hermes3D`) には 56×42 タイルの 2D ピクセルオフィス (`src/features/pixel-office/map/hermesHqMap.ts`) と、3D/2D 切り替えがすでにある。
- `src/lib/office/worldMap.ts` の `buildWorldMap` は、エージェント・部署・タスク・成果物を部屋に割り当てる純関数。仕様は `docs/world-map.md`。
- 画面に使われているのはエージェントの机の位置だけ (`PixelOffice2D.tsx` → `preferredZoneIdByAgentId`)。`buildWorldMap` が返すタスクと成果物は、まだ画面に出ていない。
- `DEFAULT_DEPARTMENTS` は機能別（Video, Music, Writing …）。実際の会社は **グループ別**（SYSTEMS.md「Company groups」、2026-09-29 の Owner decision）で、Kanban のカードもグループのチームに付く。
- Hermes3D の AGENTS.md: リポジトリには実名・私的パスを入れず、運用者固有の割り当ては実行時に渡す。

## 決定 1: 部屋 = 会社グループ

1 グループに 1 部屋を割り当てる。机・タスク・成果物はすべて、その部屋の中に置く。
地図は作り直さず、今ある部屋 (zone id) の表示名だけを変える。

| Group | Zone | 今の表示名 → 新しい表示名 | 座る人（例） |
|---|---|---|---|
| HQ (Bigkiji) | z-meeting | Exec Office → HQ | Bigkiji, miro, Router, Jev |
| AppPro | z-web | Web Lab → AppPro | MiMo, Space Bunny, Tora |
| MoviePro | z-product | Video Edit → MoviePro | Steve, HideoKojima, Shimajiro, Ame, Risa |
| BlogPro | z-text | Text Edit → BlogPro | Sora, Coco |
| ClassPro | z-cx | Classroom Ops → ClassPro | hs-school-ops のエージェント |
| AccountPro | z-reading | Research Lab → AccountPro | AccountingGroup のエージェント |
| InvestPro | z-game | Game Studio → InvestPro | VirtualInvestmentTrusts のエージェント |
| RentPro | z-3d | 3D Studio → RentPro | igataya-web のエージェント |
| MarketPro | z-phone | LINE Booths → MarketPro | WEB_MARKETING のエージェント |

## 決定 2: グループをまたぐ役割は共有の部屋に置く

どのグループにも属さない、または全グループの仕事をする役割は、専用の部屋に座る。
作った人と確認する人が別の部屋にいることが、画面で見えるようにするため（「作った人だけで合格にしない」ルール）。

| Shared room | Zone | 表示名 | 座る人 |
|---|---|---|---|
| QA | z-server | Server Room → QA | Claude Code, Kuro, shiro, Auto QA, Vision, Hana, Blog QA, Tech Blog QA, Pi |
| GPU | z-ops | GPU Control（そのまま） | Maru, ComfyUI, Qwen (local) |
| Audio | z-music | Music Edit（そのまま） | RyūichiSakamoto（MoviePro の音声部門） |
| Skills | z-gym | DNA Dojo（そのまま） | tama |
| Idle | z-lounge | Lounge（そのまま） | どこにも割り当てのないエージェント |

z-kitchen, z-image は空けておく（休憩の動き・画像スタジオ用。v1 では誰も座らない）。z-phone は MarketPro の部屋にする（下の決定 1）。

## 決定 3: タスクは部屋のホワイトボードと、エージェントの頭の上に出す

- 部屋ごとに 1 枚のホワイトボード（`docs/bulletin-board-spec.md` の掲示板を使う）。列は 3 つ:
  - **待ち**: `inbox` / `todo` / `scheduled`
  - **作業中**: `running` / `working`
  - **止まっている**: `blocked` / `needs_attention`（赤。Yuma の判断待ちならそう書く）
- 作業中のエージェントの頭の上に、カードの題名を 1 行だけ出す。色は 作業中 = 緑、止まっている = 赤、待ち・何もしていない = 灰色。
- 担当者がいないカードは HQ の受付箱に置く（今の `buildWorldMap` の規則 2 のまま。Bigkiji が振り分けるため）。
- GPU の夜間枠を待つカード（`scheduled` の GPU 仕事）は、GPU 室のボードにも出す。
- **Yuma の判断待ち**（止まっているカード、公開承認待ちの下書き）は、全部屋分を HQ の「Yuma の机」にまとめる。部屋を回らなくても、入った瞬間に分かるようにする。

## 決定 4: 成果物は部屋の棚に並べる

- `done` のカードが成果物。その部屋の棚に、直近 7 日のうち新しい 5 件を出す。
- 棚の札は `Result:` ノートの 1 行目（今の `buildWorldMap` の規則 3）。クリックすると、成果物のファイルやページへのリンクを開く。
- 5 件より古いものは「すべて見る」でグループの一覧へ。

## 決定 5: クリックしたときに出るもの

| クリックする物 | 出るパネル |
|---|---|
| 部屋 | グループ名、メンバー、ボード 3 列の件数、棚の成果物 |
| エージェント | 名前、担当（BrainBook `src/agentRoster.ts` と同じ文）、使っているモデル、今のカード |
| カード | Kanban カードの題名・状態・最後のコメント |
| 成果物 | `Result:` の要約と、ファイルやページへのリンク |

v1 は **見るだけ**。指示は今の入口（Telegram / ターミナル / BrainBook）から Bigkiji へ出す。オフィスは第二の司令塔にならない（Registry §3「duplicate coordinator を作らない」）。音声の指示は Step 3 で、同じ Bigkiji の入口へつなぐ。

## 決定 6: 実名はリポジトリの外から渡す

Hermes3D のリポジトリには、機能別の汎用 `DEFAULT_DEPARTMENTS` をそのまま残す。
BKU のグループ一覧・部屋の表示名・`overrides`（プロフィール名 → グループ）は、リポジトリ外のローカル設定から実行時に `buildWorldMap({ departments, overrides })` へ渡す。
こうすれば、公開してよいデモの範囲（Registry §3）を守ったまま、本物の会社を映せる。

## 次の Step へ渡すこと（Step 2: 本物の Hermes につなぐ）

1. 上の 2 つの表を、ローカル設定（departments + overrides + 部屋の表示名）にする。
2. `buildWorldMap` の `tasks` に Hermes Kanban の全ボードのカードを入れ、タスクと成果物を画面に描く（今は机の位置にしか使っていない）。
3. 受け入れ条件: 実際に動いているカードが、担当グループの部屋のボードに出ること。スクリーンショットで確認する。

## Step 2 で作ったもの（2026-10-01）

本物の Hermes のデータを、上の部屋に置いて画面に出す。読むだけで、Kanban には何も書かない。

- `office-map.json` — 決定 1・2 の表をデータにしたローカル設定（部屋、team lane → 部屋、board → 部屋、プロフィール名 → 表示名）。Hermes3D リポジトリの外に置く（決定 6）。`node scripts/check-office-design.mjs` が、この設定とこのノートの表が一致することも確かめる。
- `agent-feed.py <hermes_home> cards [days]` — 全ボードの開いているカードと、直近 days 日に done になったカード、Hermes プロフィール一覧を JSON で出す（SQLite は読み取り専用で開く）。
- `office.mjs` の `buildOffice` — カードを部屋に置く純関数。順番は team lane（本文の `team:`）→ 担当者の部屋 → ボードの部屋 → HQ の受付箱。止まっているカードは全部「Yuma の机」にも出す。`scheduled` は GPU 室のボードにも出す（件数は 1 回だけ数える）。
- `GET /api/office` — 上の 3 つをつないだ JSON。Hermes3D が後で同じ JSON を読める。
- BrainBook の「Office」パネル（`src/OfficeView.tsx`）— 部屋ごとにメンバー（H = 本物の Hermes プロフィール）、頭の上の今のカード、3 列のボード、成果物の棚。20 秒ごとに読み直す。
- 検証: `node scripts/test-office.mjs`（固定データで配置の規則を確認）、`node scripts/test-office.mjs --real`（本物のボードを読む）、スクリーンショット `evidence/office-real-hermes-2026-10-01.png`。

まだやっていないこと: Hermes3D の 2D/3D 画面そのものに描くこと（Hermes3D リポジトリの変更になる）。`buildWorldMap` に `/api/office` の部屋割りを渡す形で、次の Step か別カードで行う。

## Step 3 で作ったもの（2026-10-01）: 音声で指示を出す

話した言葉は文字として欄に入るだけ。Yuma が読んで直し、Send を押したときだけ送る（聞き間違いがそのままカードにならない）。

- `src/voice.ts` の `useVoiceInput` — ブラウザの SpeechRecognition（Safari / Chrome / WKWebView）。話し終わった部分を欄に足し、話している途中の言葉はマイク横に薄く出す。日本語（既定）と英語を切り替えられる。エンジンが端末内の認識（Chrome の `processLocally`）を持つときはそれを使い、無いときはブラウザ提供元の音声サービスを使う。どちらかはマイク横に表示する。
- `src/VoiceInput.tsx` — `VoiceRow`（マイクボタン・JA/EN・状態表示）と、Office パネル上部の「Tell Bigkiji」欄（`VoiceCommand`）。Send は既存の入口をそのまま使う: `POST /api/tasks` でタスクを保存し、`POST /api/tasks/:id/run` で Hermes Kanban に渡す（チームの lane / Bigkiji / 夜の GPU 枠は `queueTaskRun` が決める）。サーバーの変更は無い。
- チームのシートの「Tell a member directly」欄（`src/TeamRail.tsx`）にも同じマイクを付けた。
- macOS アプリ: `macos/build-app.sh` の Info.plist にマイクと音声認識の説明文を追加、`macos/main.swift` でローカルの BrainBook 画面だけにマイクを許可する。説明文の無い古いアプリでは、macOS がアプリを止めるのを避けるためマイクを開かず、「Fn を 2 回押す macOS の音声入力」を案内する。
- 検証: `npm run test:voice`（= `node scripts/test-voice.mjs`。Chrome で、偽の音声認識エンジンと偽の `/api/tasks`・`/api/agents/instruct` を使う。録音もカード作成もしない）。Office の「Tell Bigkiji」欄と、チーム画面の「Tell a member directly」欄の両方のマイクを確かめる（12 項目）。`playwright-core` は devDependency（1.61.0 固定）なので `npm install` だけで動く。別に Google Chrome が要る。スクリーンショット `evidence/voice-input-2026-10-01.png`。

## Step 4 で作ったもの（2026-10-01）: Bigkiji のチーム振り分けに合わせて自動で変わる

Bigkiji がカードをチームに振り分けると（`queueTaskRun` → `team-run --which`、正本は `AI/router/config/teams.yaml`）、オフィスの中身がそのとおりに変わる。人が `office-map.json` を書き直さなくてよい。

- `GET /api/office` は、リクエストのたびに `teams.yaml` を読んで `buildOffice` に `teams` として渡す。読めないときは `office-map.json` の team lane だけで動き、ヘッダーに `routing: office-map.json (teams.yaml not read: …)` と出す。
- `office.mjs`: `teams.yaml` にあって `office-map.json` の `teams` に無いチームには、自動で部屋（`team-<id>`、名前はチームの label、Hermes3D の zone はまだ無い）を作り、そのチームのカードをそこに置く。チームの Hermes プロフィール（`teams.yaml` の `profiles`）は、`office-map.json` で席が決まっていなければチームの部屋に座る（Lounge に行かない）。`office-map.json` の席が優先（例: Hana は QA から見る）。消えたチームのカードは HQ の受付箱（Bigkiji）に戻る。
- 部屋ごとに、どのチームが Bigkiji からそこへ振り分けられるか（`teams`）を出す。応答の `routing` は `{ source, teams, auto }`。
- team lane のカードは、今作業しているメンバー（`agent-feed.py cards` の `member` = そのカードに最後にコメントした人。`flow` と同じ判定）の頭の上に出て、ボードには `app-dev team · Pi` のように出る。
- 画面: 20 秒ごとの読み直しに加えて、ウィンドウに戻ったときと、「Tell Bigkiji」で送った直後にも読み直す（`brainbook:office-refresh`）。送った後の表示に、振り分け先のチーム名も出す。
- 検証: `node scripts/test-office.mjs`（新しいチーム → 自動の部屋、チームのプロフィールの席、作業中メンバーの頭、消えたチーム → HQ、teams.yaml が無いときの代わりの動き）、`node scripts/test-office.mjs --real`（本物の teams.yaml と本物のボード）、`--smoke` のサーバーで本物の `/api/office` を 1 回呼ぶ（`routing.source = teams.yaml`）。

## Step 5 で作ったもの（2026-10-01）: 3D と VR ヘッドセットで見る

Office パネルの「3D / VR」から `/vr` を開くと、同じ `/api/office`（本物の Hermes、読むだけ）が three.js の 3D オフィスになる。VR ヘッドセットのブラウザでは「Enter VR」で WebXR（`immersive-vr`）に入れる。

- 配置（`src/officeLayout.ts`）: 2D パネルと同じ部屋を、5 m 四方の床として格子に並べる（中身の無い共有の部屋は出さない。2D と同じ規則）。見る人は原点に立って -z を向き、すぐ前（z = -2 m）に「Yuma の机」（止まっているカード全部）がある。部屋はその奥。
- 部屋（`src/OfficeVR.tsx`）: 奥の壁にホワイトボード（作業中 / 止まっている / 待ち、各 5 件）と部屋名・チーム名、右奥に成果物の棚（箱 1 つ = 直近の成果物 1 件、上に要約）。エージェントはボードの前に 1 列に立ち、名前と今のカードを頭の上に出す。作業中は弾み、止まっている人は足元が赤い輪。床の色: 作業中 = 緑、止まっている = 赤。
- ブラウザ: ドラッグで見回す。部屋をクリックするとその部屋の前へ移動し、右に詳細（メンバー、ボード 3 列、止まっている理由、棚）が出る。「Back to desk」で戻る。
- VR: コントローラーから光線が出る。部屋の床に向けてトリガー = その部屋の前へテレポート（行き先に輪が出る）。グリップ（squeeze）= 机に戻る。床の高さは `local-floor`。
- 見るだけ（決定 5 のまま）。指示は今までどおり BrainBook の「Tell Bigkiji」から。データは 20 秒ごと（とウィンドウに戻ったとき）に読み直す。
- ボタンは状況を言う: `Enter VR` / `No VR headset found`（WebXR はあるがヘッドセットが無い。つなぐと自動で有効）/ `This browser has no WebXR` / `VR needs https:// (or localhost)`。どの場合も 3D 表示は動く。VR が始まらなかったときは理由を出し、もう一度押せる。
- Mac アプリの中では `target="_blank"` なので既定のブラウザで開く。`/vr` は別ファイルに分けて読み込む（本体の JS は増えない）。
- Yuma の机の一覧（止まったカード、8 件以上で高さ約 1.6 m）は机にいるときだけ出す。部屋を選ぶと隠し、Back to desk / VR の squeeze で戻す。手前の列の部屋へ行くカメラが机を通り抜け、一覧が部屋と詳細パネルに被さっていたため（QA 2026-10-01 で指摘）。
- 検証: `node scripts/test-office-vr.mjs` → OFFICE_VR_OK（8 項目。Chrome のソフトウェア描画で WebGL、`/api/office` と `navigator.xr` は偽物）。実データ規模の項目（9 部屋・止まり 18 件）では、手前 3 部屋それぞれへ移動する間、毎フレーム机の一覧が視野に入らないこと（視錐台判定）、部屋が詳細パネルより左に見えること、戻ると机が見えることを確かめる。修正を外すとこの項目は失敗する（67 フレーム中 16 フレームで一覧が視野に入った）。`--real` で本物のボード（読むだけ）: 13 部屋・31 人・描画 219 回。画面は `evidence/office-vr-3d-2026-10-01.png`（全体）と `evidence/office-vr-room-2026-10-01.png`（AppPro に移動。カメラが止まってから撮る）。

まだ（UNKNOWN）:
- 本物のヘッドセットで VR に入ったことはない。テストは `requestSession('immersive-vr')` を呼ぶところまで。three.js の WebXR 描画・テレポート・コントローラーは、実機（または WebXR エミュレーター）で一度見る必要がある。
- ヘッドセットから BrainBook を開く道が無い。WebXR は https:// か localhost でしか動かない（ブラウザの規則）。今の電話用アクセスは Tailscale の `http://100.x.x.x:port/` で、ヘッドセットでは 3D は見られても「Enter VR」は押せない。使うには https の入口（例: Tailscale の HTTPS 証明書 / `tailscale serve`）が要る。これはネットワークと証明書の設定なので Yuma の判断。https にする場合、`server.mjs` の `remoteRequestAllowed`（Host と Origin を `http://<Tailscale IP>:<port>` に固定）も合わせて変える必要がある。

## 未確定（UNKNOWN / Yuma が後で変えてよい）

- 部屋の表示名の変更は、2026-09 に「BKU のスタジオ名」を付けた部屋（Game Studio, 3D Studio, Research Lab）の名前を上書きする。スタジオ名を残したい場合は、AccountPro / InvestPro / RentPro の部屋を別の場所にする。
- AccountPro / InvestPro / RentPro / ClassPro の各エージェント名は Hermes のプロフィールに無いものがある。Step 2 で実際のプロフィール一覧から `overrides` を作るときに確定する。
- VR 用のレイアウト（Step 5）は、この 2D の配置をそのまま 3D の部屋に置いた（格子）。ブラウザの 3D では確かめた。ヘッドセットの中での見やすさ（文字の大きさ、机の高さ）は未確認。
