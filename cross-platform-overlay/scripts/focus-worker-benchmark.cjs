'use strict';
// Safe native Windows compilation/IPC benchmark. Dry run never enumerates game
// windows, activates a window, or injects keys, even if Fallout is running.
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { WindowsFocusWorker, buildFocusScript } = require('../windows-focus-worker');
if (process.platform !== 'win32') throw new Error('Native Windows required');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(count) {
  const times=[]; let ready=false, completed=0;
  const start=performance.now();
  const worker=new WindowsFocusWorker({spawn:(...args)=>{const child=spawn(...args);child.stderr.on('data',d=>console.error(d.toString()));return child;}, ownerPid:process.pid,script:buildFocusScript(process.pid,true),log:line=>{
    if(line.includes('ready startupMs='))ready=true;
    if(line.includes('result=dry-run')){completed++;times.push(Number(/roundTripMs=(\d+)/.exec(line)[1]));}
  }});
  try {
    worker.start();
    const deadline=Date.now()+6000;
    while(!ready&&Date.now()<deadline)await sleep(10);
    if(!ready)throw new Error('Worker startup failed');
    const startupMs=performance.now()-start;
    for(let i=0;i<count;i++){
      if(!worker.request())throw new Error('Request rejected');
      const deadline=Date.now()+3500;
      while(completed<=i&&Date.now()<deadline)await sleep(1);
      if(completed<=i)throw new Error('Request timed out');
    }
    times.sort((a,b)=>a-b);
    return {startupMs:Math.round(startupMs),requests:count,p50Ms:times[Math.floor(count*.5)],p95Ms:times[Math.min(count-1,Math.floor(count*.95))],maxMs:times[count-1]};
  } finally {worker.dispose();}
}
(async()=>{console.log(JSON.stringify({cold:await run(1),warm:await run(100),scope:'dry-run compilation/IPC; no game input or native activation'}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
