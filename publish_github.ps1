#Requires -Version 5.1
param(
    [string]$RepositoryName = 'netease-music-downloader',
    [ValidateSet('private','public')][string]$Visibility = 'private'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Stop-WithMessage([string]$Message) {
    Write-Host "`n[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Find-Tool([string]$ToolName, [string[]]$Paths) {
    $item = Get-Command $ToolName -ErrorAction SilentlyContinue
    if ($item) { return $item.Source }
    foreach ($path in $Paths) { if ($path -and (Test-Path -LiteralPath $path)) { return $path } }
    return $null
}

$git = Find-Tool 'git.exe' @("$env:ProgramFiles\Git\cmd\git.exe", "$env:ProgramFiles\Git\bin\git.exe")
$gh = Find-Tool 'gh.exe' @("$env:ProgramFiles\GitHub CLI\gh.exe", "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")

if (-not $git) {
    Write-Host '[MISSING] Git is not installed or not found.' -ForegroundColor Yellow
    Write-Host 'Install once: winget install --id Git.Git --exact'
    Stop-WithMessage '请安装 Git 后重新双击本脚本。'
}
if (-not $gh) {
    Write-Host '[MISSING] GitHub CLI (gh) is not installed or not found.' -ForegroundColor Yellow
    Write-Host 'Install once: winget install --id GitHub.cli --exact'
    Stop-WithMessage '请安装 GitHub CLI 后重新双击本脚本。'
}

Write-Host '[1/4] Check GitHub login...' -ForegroundColor Cyan
& $gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Please log in to GitHub. A browser may be opened.' -ForegroundColor Yellow
    & $gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'GitHub 登录失败。' }
}
$owner = (& $gh api user --jq .login 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $owner) { Stop-WithMessage '无法读取当前 GitHub 登录帐号。' }
if ($owner -ne 'qcya') { Stop-WithMessage "目前 GitHub CLI 登录的是 $owner，而本工程预定上传到 qcya。请先运行 gh auth switch 或重新登录。" }
$repo = "$owner/$RepositoryName"
Write-Host "Authenticated as $owner. Target: $repo ($Visibility)"

Write-Host '[2/4] Check repository and local Git...' -ForegroundColor Cyan
& $gh repo view $repo --json name --jq .name *> $null
if ($LASTEXITCODE -eq 0) { Stop-WithMessage "仓库 $repo 已存在。为避免覆盖，脚本停止。" }
if (Test-Path -LiteralPath '.git') { Stop-WithMessage '当前目录已经存在 .git，不能当作全新仓库直接上传。' }
& $git init -b main
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'git init 失败，请检查 Git 版本。' }
& $git add --all
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'git add 失败。' }
$uid = (& $gh api user --jq .id | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $uid) { Stop-WithMessage '无法获取 GitHub 用户 ID。' }
& $git -c "user.name=$owner" -c "user.email=$uid+$owner@users.noreply.github.com" commit -m 'Initial import: Electron music downloader v5.1'
if ($LASTEXITCODE -ne 0) { Stop-WithMessage '本地 Git 提交失败。' }

Write-Host '[3/4] Configure GitHub authentication...' -ForegroundColor Cyan
& $gh auth setup-git
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'gh auth setup-git 失败。' }

Write-Host '[4/4] Create and upload GitHub repository...' -ForegroundColor Cyan
& $gh repo create $repo "--$Visibility" --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "GitHub 仓库创建或上传失败。可检查错误后重试；若仓库已创建但 push 未完成，请使用 git push -u origin main。" }
Write-Host "`n[SUCCESS] https://github.com/$repo" -ForegroundColor Green
Write-Host 'Note: node_modules, dist, audio cache and downloaded songs were excluded via .gitignore.'
