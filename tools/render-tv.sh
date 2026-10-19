#!/usr/bin/env bash
# Renders the hero video: an old TV, static first, then the UNLEASHED logo rolling in and pulling into focus on its
# screen with flicker, grain, colour fringing, scanlines and phosphor bloom, the way an MTV-era ident did (Jason,
# 2026-10-19: "100% photo realistic … reminiscent of the original MTV era … the logo coming into focus, flickering").
#
#   tools/render-tv.sh <clip.mov> [logo.png]
#
# The clip: a green-screen stock shot of the set, front-on against pure white, the set itself not moving. The set is
# one still taken from it: the per-pixel darkest value over a few seconds of the green phase (a still set is
# unchanged by that; a lightening overlay such as a watermark, static or noise is not), cut out of its white
# background, its screen cut out too. Everything on the screen is synthesised here, so the clip's own static is
# never used. Writes assets/tv.webm (VP9 with alpha: Chrome, Edge, Firefox), assets/tv.mov (HEVC with alpha:
# Safari, iPhone) and assets/tv-poster.png (the sharp picture, shown until the video plays). Needs ffmpeg.
#
# The numbers below (set crop, screen position) were measured on the Videohive "vintage TV green screen" clip
# recorded at 1904x1128; tools/measure-tv.py measures a different clip or resolution.
set -euo pipefail
cd "$(dirname "$0")/.."
CLIP="${1:?usage: tools/render-tv.sh <clip.mov> [logo.png]}"
LOGO="${2:-assets/logo.png}"
OUT=assets
TMP=/tmp/render-tv; mkdir -p "$TMP" "$OUT"

# the set within the clip, and the screen within the set (pixels of the source clip)
SET_W=1621; SET_H=991; SET_X=166; SET_Y=78
SCR_W=1071; SCR_H=713; SCR_X=118; SCR_Y=94
PANEL_X=1280; PANEL_Y=20; PANEL_W=341; PANEL_H=910   # the control panel: its near-white label is never background
RIM=30; BASE=80   # only this rim of the set (and its base below) is keyed against white; inside it the cabinet is solid
OVER=40   # the picture overfills the screen's cut-out by this much on each side, so no gap can show at its edge
GREEN_FROM=4.0; GREEN_LEN=4.6      # a stretch of the clip where the screen is green
FPS=30; OUT_W=1600; LOOP=7.5       # seconds per loop
# the picture's timing: static until SNOW_END, the picture rolls in and pulls into focus by FOCUS_END, a brief
# burst of static at the end so the loop closes on static
SNOW_END=1.6; FOCUS_END=3.6; BURST_AT=7.2

# ---- 1. the set: one clean still, cut out, screen cut out --------------------------------------------------------
# the screen is wherever green dominates (a watermark tinting the green does not change that); the set never does
GREEN="if(gt(g(X\,Y)\,r(X\,Y)+60)*gt(g(X\,Y)\,b(X\,Y)+60)\,0\,255)"
ffmpeg -v error -y -ss "$GREEN_FROM" -i "$CLIP" -t "$GREEN_LEN" \
  -vf "fps=${FPS},tmedian=radius=60:percentile=0.0,select='eq(n\,8)'" -frames:v 1 "$TMP/set_full.png"
ffmpeg -v error -y -i "$TMP/set_full.png" -filter_complex "
  [0:v]crop=${SET_W}:${SET_H}:${SET_X}:${SET_Y},format=rgba,split=3[s][ka][kb];
  [ka]colorkey=0xFFFFFF:0.18:0.0,format=rgba,alphaextract,
    drawbox=x=${SCR_X}:y=${SCR_Y}:w=${SCR_W}:h=${SCR_H}:color=white:t=fill,
    drawbox=x=${PANEL_X}:y=${PANEL_Y}:w=${PANEL_W}:h=${PANEL_H}:color=white:t=fill,
    drawbox=x=${RIM}:y=${RIM}:w=$((SET_W-2*RIM)):h=$((SET_H-RIM-BASE)):color=white:t=fill,erosion,erosion[ma];
  [kb]format=gbrp,geq=r='${GREEN}':g='${GREEN}':b='${GREEN}',format=gray,median=radius=5,
    gblur=sigma=5,geq=lum='if(lt(lum(X\,Y)\,215)\,0\,255)'[mb];
  [ma][mb]blend=all_mode=darken,gblur=sigma=0.7[m];
  [s][m]alphamerge,format=rgba" "$TMP/set.png"

# ---- 2. the picture's focus pull: blur lifting, colour fringing settling -----------------------------------------
CMDS="$TMP/cmds.txt"
cat > "$CMDS" <<EOF
${SNOW_END}-${FOCUS_END} [expr] gblur@focus sigma 'lerp(30,0,TI*TI)',
                         [expr] gblur@focus sigmaV 'lerp(30,0,TI*TI)',
                         [expr] rgbashift@fringe rh 'lerp(10,2,TI)',
                         [expr] rgbashift@fringe bh 'lerp(-10,-2,TI)';
${FOCUS_END}-999 [enter] gblur@focus sigma 0,
                 [enter] gblur@focus sigmaV 0,
                 [enter] rgbashift@fringe rh 2,
                 [enter] rgbashift@fringe bh -2;
EOF
# the picture rolls up into place as it lands (vertical hold catching), with a little horizontal jitter that dies away
ROLL="if(between(t,${SNOW_END},${SNOW_END}+0.7),H*pow(1-(t-${SNOW_END})/0.7,1.8),0)"
JIT="if(lt(t,${FOCUS_END}),6*sin(t*97)*sin(t*31)*(${FOCUS_END}-t)/2,0)"
# flicker: a shimmer, dips as the picture lands, one hard drop each loop
FLICKER="0.04*sin(t*41)*sin(t*17)+if(between(t,${SNOW_END},${SNOW_END}+0.12),-0.35,0)+if(between(t,${SNOW_END}+0.5,${SNOW_END}+0.56),-0.3,0)+if(between(t,5.0,5.05),-0.45,0)"
# the glass: a soft glare in the upper left and a faint diagonal band
GLASS="clip(70*exp(-(pow(X/W-0.22,2)*3+pow(Y/H-0.18,2)*8))+22*max(0,1-abs(X/W+Y/H*0.6-0.75)*6),0,255)"

# ---- 3. the video ---------------------------------------------------------------------------------------------------
ffmpeg -v error -y \
  -loop 1 -framerate ${FPS} -i "$TMP/set.png" \
  -loop 1 -framerate ${FPS} -i "$LOGO" \
  -f lavfi -i "color=c=white:s=${SCR_W}x${SCR_H}:r=${FPS}" \
  -f lavfi -i "color=c=0x9a9a9a:s=$((SCR_W/2))x$((SCR_H/2)):r=${FPS}" \
  -f lavfi -i "color=c=white:s=${SCR_W}x${SCR_H}:r=${FPS}" \
  -filter_complex "
    [1:v]scale=$((SCR_W*88/100)):-1,format=rgba[logo];
    [2:v][logo]overlay=x='(W-w)/2+${JIT}':y='(H-h)/2+${ROLL}':format=auto,format=rgba,split[p1][p2];
    [p2]gblur=sigma=22[bloom];
    [p1][bloom]blend=all_mode=lighten:all_opacity=0.28,
      sendcmd=f=${CMDS},gblur@focus=sigma=30,rgbashift@fringe=rh=10:bh=-10,
      format=yuv444p,geq=lum='lum(X\,Y)*if(lt(mod(Y+floor(N/8)\,3)\,1)\,0.7\,1)':cb='cb(X\,Y)':cr='cr(X\,Y)',
      eq=eval=frame:brightness='${FLICKER}':contrast=1.05,
      noise=alls=5:allf=t+u,vignette=angle=PI/6,format=rgba[pic];
    [3:v]format=yuv444p,noise=alls=100:allf=t+u,boxblur=1:0,scale=${SCR_W}:${SCR_H},
      geq=lum='lum(X\,Y)*(0.8+0.2*sin((Y+T*500)/35))':cb=128:cr=128,
      eq=eval=frame:brightness='0.1*sin(t*50)*sin(t*13)',vignette=angle=PI/6,format=rgba,split[sn1][sn2];
    [sn1]fade=t=out:st=${SNOW_END}:d=0.6:alpha=1[snowA];
    [sn2]fade=t=in:st=${BURST_AT}:d=0.2:alpha=1[snowB];
    [4:v]format=rgba,geq=r=255:g=255:b=255:a='${GLASS}'[glass];
    [pic][snowA]overlay=0:0:format=auto[s0];
    [s0][snowB]overlay=0:0:format=auto[s1];
    [s1][glass]overlay=0:0:format=auto,format=rgba,
      scale=$((SCR_W+2*OVER)):$((SCR_H+2*OVER)),
      pad=${SET_W}:${SET_H}:$((SCR_X-OVER)):$((SCR_Y-OVER)):color=0x00000000[screen];
    [screen][0:v]overlay=0:0:format=auto:alpha=straight,trim=duration=${LOOP},
      scale=${OUT_W}:-2,format=rgba,split=2[v1][v2]" \
  -map "[v1]" -c:v libvpx-vp9 -pix_fmt yuva420p -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 1 -auto-alt-ref 0 -an "$OUT/tv.webm" \
  -map "[v2]" -c:v hevc_videotoolbox -alpha_quality 0.8 -q:v 48 -tag:v hvc1 -pix_fmt bgra -an "$OUT/tv.mov"

# the poster: the sharp picture, shown until the video plays
ffmpeg -v error -y -c:v libvpx-vp9 -i "$OUT/tv.webm" -ss 5.5 -frames:v 1 -pix_fmt rgba "$OUT/tv-poster.png"
ls -la "$OUT"/tv.webm "$OUT"/tv.mov "$OUT"/tv-poster.png
