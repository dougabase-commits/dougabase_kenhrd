# Fable 5.2 — Code-Generated Showreel

54秒・1080p/30fps のデモ映像。映像も音楽も効果音も、撮影素材・ストック素材・DAWを一切使わず、このフォルダのコードだけで生成しています。

完成品: `fable52_showreel.mp4`

| 時間 | シーン | 技術 |
|---|---|---|
| 0:00 | タイトル | 9万粒子の銀河がロゴへ収束(Canvas + HDR加算合成) |
| 0:08 | 01 Raymarching | GLSLレイマーチングによるジャイロイド・トンネル(ポリゴンなし) |
| 0:16 | 02 Attractor | Halvorsenアトラクタ40万点をRK4で積分、被写界深度つき描画 |
| 0:24 | 03 Typography | ビートに同期したキネティック・タイポグラフィ |
| 0:32 | 04 Making of | 実際の合成コードと、実際の楽曲のスペクトラム表示 |
| 0:40 | 05 Finale | 16万粒子のモーフィング(球 → トーラス結び目 → 波 → ロゴ) |

## ビルド

```sh
npm install            # フォント (Noto Sans JP / Inter / JetBrains Mono)
pip install numpy scipy
./build.sh             # 音楽合成 → 全フレーム描画 → MP4エンコード
```

必要なもの: Node.js、Playwright(Chromium)、Python 3、ffmpeg。

- `audio/make_audio.py` — サウンドトラックをnumpyで合成(120BPM)。フレームごとの解析データも出力し、映像が音に反応します。
- `src/` — 各シーン。すべて「フレーム番号 → 画」の純粋関数なので、どのフレームからでも並列レンダリングできます。
- `render.mjs` — ヘッドレスChromiumで1フレームずつPNG化。
