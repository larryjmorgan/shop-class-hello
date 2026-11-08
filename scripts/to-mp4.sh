#!/usr/bin/env bash
# Convert an exported StoryBox video (.webm, or any browser-recorded file) into a universally playable
# H.264/AAC .mp4 (iPad, iPhone, TVs, YouTube). Needs ffmpeg: https://ffmpeg.org
#   ./scripts/to-mp4.sh my-story.webm            -> my-story.mp4
set -euo pipefail
in="${1:?Usage: to-mp4.sh input-video [output.mp4]}"
out="${2:-${in%.*}.mp4}"
ffmpeg -y -i "$in" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -movflags +faststart "$out"
echo "Wrote $out"
