'use strict';
// Windows-only test helper. Process.MainWindowHandle may select the lyric overlay.
const {execFileSync}=require('node:child_process');
function setWindowState(processName,state){
 if(!['electron','MusicDownloader'].includes(processName)||![6,9,16].includes(state))throw Error('Invalid test window selector');
 const script=`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class MusicWindowTest {
  public delegate bool Callback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint process);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int state);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  public static IntPtr Find(int[] ids, string prefix) {
    var allowed=new HashSet<int>(ids); var result=IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      uint owner; GetWindowThreadProcessId(h, out owner);
      if(!allowed.Contains((int)owner)) return true;
      var text=new StringBuilder(512); GetWindowText(h,text,text.Capacity);
      if(text.ToString().StartsWith(prefix,StringComparison.Ordinal)){result=h;return false;}
      return true;
    },IntPtr.Zero);
    return result;
  }
}
'@
$ids=[int[]]@(Get-Process -Name ${processName} -ErrorAction Stop | ForEach-Object {$_.Id})
$h=[MusicWindowTest]::Find($ids,'音乐下载器')
if($h -eq [IntPtr]::Zero){throw 'Native player window not found among process windows'}
if(${state} -eq 16){
  if(![MusicWindowTest]::PostMessage($h,16,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'WM_CLOSE failed'}
  @{handle=$h.ToString();closed=$true} | ConvertTo-Json -Compress
  exit
}
[void][MusicWindowTest]::ShowWindowAsync($h,${state})
$wanted=${state===6?'$true':'$false'}
for($i=0;$i -lt 60;$i++){
  if([MusicWindowTest]::IsIconic($h) -eq $wanted){break}
  Start-Sleep -Milliseconds 30
}
if([MusicWindowTest]::IsIconic($h) -ne $wanted){throw 'Native window state did not change'}
@{handle=$h.ToString();minimized=[MusicWindowTest]::IsIconic($h)} | ConvertTo-Json -Compress
`;
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:15000,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const result=JSON.parse(output.trim());console.log('NATIVE WINDOW STATE',result);return result;
}
module.exports={setWindowState};
