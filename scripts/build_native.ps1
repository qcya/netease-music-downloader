$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'Visual Studio C++ tools are required to build the native blur module.'}
$vc=(Get-ChildItem (Join-Path $vs 'VC/Tools/MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$sdk=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$version=(Get-ChildItem (Join-Path $sdk 'Include') -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'cppwinrt/winrt/Windows.UI.Composition.h')} | Sort-Object Name -Descending | Select-Object -First 1).Name
if(!$version){throw 'Windows SDK with C++/WinRT is required.'}
$env:INCLUDE=(@("$vc/include")+(@('ucrt','shared','um','winrt','cppwinrt')|ForEach-Object{"$sdk/Include/$version/$_"}))-join ';'
$env:LIB=@("$vc/lib/x64","$sdk/Lib/$version/ucrt/x64","$sdk/Lib/$version/um/x64")-join ';'
New-Item -ItemType Directory -Force (Join-Path $root 'build/native'),(Join-Path $root 'backend') | Out-Null
Push-Location (Join-Path $root 'build/native')
try{
 & "$vc/bin/Hostx64/x64/cl.exe" /nologo /utf-8 /std:c++20 /EHsc /MT /LD /O2 (Join-Path $root 'native/neutral_composition.cpp') (Join-Path $root 'native/right_shift.cpp') "/Fe$root/backend/neutral_composition.dll" /link windowsapp.lib CoreMessaging.lib dwmapi.lib user32.lib d2d1.lib dxguid.lib
 if($LASTEXITCODE){throw 'Native blur compilation failed.'}
}finally{Pop-Location}
