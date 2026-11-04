'use strict';
// Optional live UI smoke test, using an isolated profile and no user credentials.
const {connect,pages}=require('./cdp_client'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const port=Number(process.argv[2]||19393),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,attempts=150){for(let i=0;i<attempts;i++){try{const v=await fn();if(v)return v}catch{}await sleep(100)}throw Error(label)}
function nativeWindows(){
 if(process.platform!=='win32')return null;
 const script=`$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Text;using System.Runtime.InteropServices;
public static class LoginWindows { public delegate bool Callback(IntPtr h,IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c,IntPtr l); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p); public static string[] Get(uint target){var a=new List<string>();EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==target){var s=new StringBuilder(512);GetWindowText(h,s,512);if(s.Length>0)a.Add((IsWindowVisible(h)?"visible:":"hidden:")+s.ToString());}return true;},IntPtr.Zero);return a.ToArray();}}
'@
$ids=Get-CimInstance Win32_Process | Where-Object {($_.Name -eq 'electron.exe' -or $_.Name -eq 'MusicDownloader.exe') -and $_.CommandLine -match '--remote-debugging-port=${port}(?:\\s|$)' -and $_.CommandLine -notmatch '--type='} | Select-Object -ExpandProperty ProcessId
foreach($id in $ids){[LoginWindows]::Get([uint32]$id)}`;
 return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:15000}).split(/\r?\n/).filter(Boolean);
}
(async()=>{
 const panel=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/panel.html')),'播放器未就绪'));let qq;
 try{
  await wait(()=>panel.run("typeof document.getElementById('settings-button')?.onclick==='function'"),'设置未就绪');
  await panel.run("document.getElementById('settings-button').click()");
  await wait(()=>panel.run("!document.getElementById('settings-view').hidden"),'设置未打开');
  await wait(()=>panel.run("!!document.getElementById('account-qq-login')&&!document.getElementById('account-qq-login').hidden"),'QQ 登录入口不存在');
  await panel.run("document.getElementById('account-qq-login').click()");
  let target;try{target=await wait(async()=>(await pages(port)).find(p=>/^https:\/\/graph\.qq\.com\//.test(p.url)),'点击 QQ 登录后未直接进入 QQ 官方授权');}
  catch(error){const state=await panel.run("({status:document.getElementById('status').textContent,disabled:document.getElementById('account-qq-login').disabled})");const urls=(await pages(port)).map(p=>{try{const u=new URL(p.url);return u.protocol+'//'+u.host+u.pathname}catch{return 'other'}});console.error(JSON.stringify({state,urls}));throw error;}
  qq=await connect(target);
  await wait(()=>qq.run("document.visibilityState==='visible'"),'QQ 授权窗口不可见');
  const homeTarget=await wait(async()=>(await pages(port)).find(p=>p.type==='page'&&/^https:\/\/music\.163\.com\/?(?:[?#].*)?$/.test(p.url)),'后台网易云页面未就绪');
  const home=await connect(homeTarget);try{await wait(()=>home.run("typeof window.g_cbLogin==='function'"),'后台登录回调未就绪');}finally{home.close();}
  // Chromium reports visibilityState=visible on hidden Electron windows when
  // paintWhenInitiallyHidden is enabled. Check actual Windows visibility instead.
  const windows=nativeWindows();if(windows){assert.ok(windows.some(x=>/^hidden:网易云音乐(?:官方登录)?$/.test(x)),'网易云首页没有隐藏');assert.ok(!windows.some(x=>/^visible:网易云音乐(?:官方登录)?$/.test(x)),'网易云首页不能显示在用户面前');assert.ok(windows.some(x=>/^visible:QQ/.test(x)),'QQ 授权窗口未显示');}
  assert.equal((await panel.run('musicBridge.accountStatus()')).loggedIn,false,'匿名测试不能自动登录');
  await qq.send('Page.close');qq.close();qq=null;
  await wait(async()=>!(await pages(port)).some(p=>p.id===target.id),'关闭 QQ 授权窗口失败');
  assert.equal((await panel.run('musicBridge.accountStatus()')).loggedIn,false,'关闭窗口不能产生账号登录');
  console.log(JSON.stringify({ok:true,checks:['QQ button opens visible official QQ authorization','NetEase home remains hidden','closing leaves user signed out']}));
 }finally{try{await qq?.send('Page.close')}catch{}qq?.close();try{await panel.run("musicBridge.windowAction('quit')")}catch{}panel.close()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
