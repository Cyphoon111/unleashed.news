#!/usr/bin/env bash
# Renders the hero video: the old TV from a green-screen stock clip, static first, then the UNLEASHED logo pulling
# into focus on its screen with flicker, grain, colour fringing and scanlines, the way an MTV-era ident did
# (Jason, 2026-10-19). The set is cut out (white background keyed away) so the page's own glow shows round it.
#
#   tools/render-tv.sh <clip.mov> [logo.png]
#
# Writes assets/tv.webm (VP9 with alpha: Chrome, Edge, Firefox), assets/tv.mov (HEVC with alpha: Safari, iPhone)
# and assets/tv-poster.png (the first frame, shown until the video plays). Needs ffmpeg (brew install ffmpeg).
#
# The clip: the set front-on against pure white, its screen pure green, static at the start and green after.
# The numbers below (set crop, screen position) were measured on the Videohive "vintage TV green screen" clip
# recorded at 1904x1128; re-measure them for a different clip or resolution (see the notes at the end).
set -euo pipefail
cd "$(dirname "$0")/.."
CLIP="${1:?usage: tools/render-tv.sh <clip.mov> [logo.png]}"
LOGO="${2:-assets/logo.png}"
OUT=assets

# the set within the clip, and the screen within the set (pixels of the source clip)
SET_W=1621; SET_H=991; SET_X=166; SET_Y=78
SCR_W=1071; SCR_H=713; SCR_X=118; SCR_Y=94
# the clip's timeline: static first, green after; the moments taken from it (seconds)
STATIC_FROM=0.3; STATIC_LEN=1.5
GREEN_FROM=4.0;  GREEN_LEN=4.6
# the logo's timing on the output timeline: it is seen once the green begins, pulls into focus over FOCUS_LEN
FOCUS_AT=$STATIC_LEN; FOCUS_LEN=1.9
FPS=30; OUT_W=1600

mkdir -p "$OUT" /tmp/render-tv
CMDS=/tmp/render-tv/cmds.txt
# the blur that lifts, and the colour fringing that settles, as the logo comes into focus
F_END=$(python3 -c "print($FOCUS_AT+$FOCUS_LEN)")
cat > "$CMDS" <<EOF
0-${F_END} [expr] gblur sigma 'lerp(26,0,TI*TI)',
           [expr] gblur sigmaV 'lerp(26,0,TI*TI)',
           [expr] rgbashift rh 'lerp(9,2,TI)',
           [expr] rgbashift bh 'lerp(-9,-2,TI)';
${F_END}-999 [enter] gblur sigma 0,
             [enter] gblur sigmaV 0,
             [enter] rgbashift rh 2,
             [enter] rgbashift bh -2;
EOF

# flicker: a fast shimmer, a hard drop every 2.3 s, a deep dip as the picture first lands
FLICKER="0.05*sin(t*41)*sin(t*17)+if(lt(mod(t,2.3),0.05),-0.45,0)+if(between(t,${FOCUS_AT},${FOCUS_AT}+0.12),-0.35,0)+if(between(t,${FOCUS_AT}+0.3,${FOCUS_AT}+0.36),-0.3,0)"

ffmpeg -v error -y \
  -i "$CLIP" -loop 1 -framerate ${FPS} -i "$LOGO" \
  -filter_complex "
    [0:v]trim=start=${STATIC_FROM}:duration=${STATIC_LEN},setpts=PTS-STARTPTS[s0];
    [0:v]trim=start=${GREEN_FROM}:duration=${GREEN_LEN},setpts=PTS-STARTPTS[s1];
    [s0][s1]concat=n=2:v=1:a=0,fps=${FPS},crop=${SET_W}:${SET_H}:${SET_X}:${SET_Y},format=rgba,split=3[setc][ka][kb];
    [ka]colorkey=0xFFFFFF:0.18:0.0,format=rgba,alphaextract,
      drawbox=x=${SCR_X}:y=${SCR_Y}:w=${SCR_W}:h=${SCR_H}:color=white:t=fill[ma];
    [kb]chromakey=0x00FF00:0.35:0.02,format=rgba,alphaextract[mb];
    [ma][mb]blend=all_mode=darken[mask];
    [setc][mask]alphamerge,format=rgba[set];
    [1:v]scale=$((SCR_W*88/100)):-1,pad=${SCR_W}:${SCR_H}:(ow-iw)/2:(oh-ih)/2:color=white,format=rgba,
      sendcmd=f=${CMDS},gblur=sigma=26,rgbashift=rh=9:bh=-9,
      format=yuv444p,geq=lum='lum(X\,Y)*if(lt(mod(Y\,3)\,1)\,0.68\,1)':cb='cb(X\,Y)':cr='cr(X\,Y)',
      eq=eval=frame:brightness='${FLICKER}':contrast=1.06,
      noise=alls=9:allf=t+u,vignette=angle=PI/6,
      format=rgba,pad=${SET_W}:${SET_H}:${SCR_X}:${SCR_Y}:color=0x00000000[screen];
    [screen][set]overlay=0:0:format=auto:alpha=straight:shortest=1,scale=${OUT_W}:-2,format=rgba,split=2[v1][v2]" \
  -map "[v1]" -c:v libvpx-vp9 -pix_fmt yuva420p -crf 30 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -auto-alt-ref 0 -an "$OUT/tv.webm" \
  -map "[v2]" -c:v hevc_videotoolbox -alpha_quality 0.9 -q:v 60 -tag:v hvc1 -pix_fmt bgra -an "$OUT/tv.mov"

# the poster: the first frame (the set with static on), shown until the video plays
ffmpeg -v error -y -c:v libvpx-vp9 -i "$OUT/tv.webm" -frames:v 1 -pix_fmt rgba "$OUT/tv-poster.png"
ls -la "$OUT"/tv.webm "$OUT"/tv.mov "$OUT"/tv-poster.png

# Measuring a new clip: export a frame (ffmpeg -ss 5 -i clip.mov -frames:v 1 frame.png), then the set is the
# bounding box of everything that is not white, and the screen is the bounding box of the green; SCR_X/SCR_Y are the
# screen's offset inside the set. tools/measure-tv.py does this for a frame.
