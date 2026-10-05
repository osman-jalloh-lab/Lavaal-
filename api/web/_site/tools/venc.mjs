import { execFileSync } from 'child_process';
import fs from 'fs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['dm','social','leads','seo','inbox','money','watch','hiring'];
const ROOT = 'C:/Users/osman/OneDrive/Desktop/web building bz/sections/capabilities/video/';
const TMP = 'C:/Users/osman/AppData/Local/Temp/claude/c--Users-osman-OneDrive-Desktop-web-building-bz/7e41f36f-56fe-4629-a2b0-e59b32b01ab9/scratchpad/rec/';
const FF='C:/Users/osman/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe';
const ff=(a)=>execFileSync(FF,['-hide_banner','-loglevel','error','-y',...a],{encoding:'utf8',maxBuffer:1e8});
const report=[];
for (const id of ids) {
  const src = fs.readFileSync(TMP+id+'.src','utf8').trim();
  const o = execFileSync(FF,['-hide_banner','-i',src,'-t','6','-vf','crop=200:200:540:260,signalstats,metadata=print:key=lavfi.signalstats.SATAVG:file=-','-f','null','-'],{encoding:'utf8',maxBuffer:1e8});
  const frames=[...o.matchAll(/pts_time:([\d.]+)\nlavfi.signalstats.SATAVG=([\d.]+)/g)].map(m=>[+m[1],+m[2]]);
  const mi = frames.findIndex(f=>f[1]>=40); const first = frames.slice(mi).find(f=>f[1]<40);
  const start = first[0] + 9.0;   // use the second pass of the loop
  const common=['-ss',start.toFixed(3),'-t','9','-i',src,'-an'];
  const mp4=ROOT+id+'.mp4', webm=ROOT+id+'.webm', jpg=ROOT+id+'.jpg';
  let w=1280, fps=24;
  let ok=false;
  for (const crf of [30,33,36,39]) {
    ff([...common,'-vf',`fps=${fps},scale=${w}:-2,format=yuv420p`,'-c:v','libx264','-preset','veryslow','-crf',String(crf),'-movflags','+faststart',mp4]);
    if (fs.statSync(mp4).size < 380000) { ok=true; break; }
  }
  for (const crf of [38,42,46,50]) {
    ff([...common,'-vf',`fps=${fps},scale=${w}:-2`,'-c:v','libvpx-vp9','-b:v','0','-crf',String(crf),'-row-mt','1','-cpu-used','1','-deadline','good',webm]);
    if (fs.statSync(webm).size < 380000) break;
  }
  ff(['-ss',(start+6.8).toFixed(3),'-i',src,'-frames:v','1','-vf','scale=960:-2','-q:v','6',jpg]);
  report.push(`${id}: start ${start.toFixed(2)} mp4 ${fs.statSync(mp4).size} webm ${fs.statSync(webm).size} jpg ${fs.statSync(jpg).size}`);
  console.log(report.at(-1));
}
