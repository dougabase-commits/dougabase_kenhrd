#!/bin/sh
# Full build: synthesize soundtrack -> render 1,620 frames -> encode MP4
set -e; cd "$(dirname "$0")"; mkdir -p build
python3 audio/make_audio.py build/music.wav build/audio.json
node render.mjs --workers "${WORKERS:-4}"
ffmpeg -y -v error -framerate 30 -i build/frames/f_%05d.png -i build/music.wav -c:v libx264 -preset slow -crf 17 -maxrate 9M -bufsize 18M \
  -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 256k -movflags +faststart fable52_showreel.mp4
echo "-> fable52_showreel.mp4"
