# SONOTA_WEBVIEW_INSTALLER_V300
param([string]$InstallRoot='')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if([string]::IsNullOrWhiteSpace($InstallRoot)){$InstallRoot=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)}

function Test-WebView2 {
  $registry=@(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F1E7D7C8-AE1D-4DCE-9A5C-1F6F17ED7C3D}',
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1E7D7C8-AE1D-4DCE-9A5C-1F6F17ED7C3D}',
    'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F1E7D7C8-AE1D-4DCE-9A5C-1F6F17ED7C3D}'
  )
  foreach($key in $registry){if(Test-Path $key){return $true}}
  $roots=@(
    "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application",
    "$env:ProgramFiles\Microsoft\EdgeWebView\Application",
    "$env:LOCALAPPDATA\Microsoft\EdgeWebView\Application"
  )
  foreach($root in $roots){
    if($root -and (Test-Path $root)){
      $exe=Get-ChildItem (Join-Path $root '*\msedgewebview2.exe') -File -ErrorAction SilentlyContinue | Select-Object -First 1
      if($exe){return $true}
    }
  }
  return $false
}

if(Test-WebView2){exit 0}
$installer=Join-Path $InstallRoot 'tools\MicrosoftEdgeWebview2Setup.exe'
if(-not(Test-Path -LiteralPath $installer)){
  $installer=Join-Path $env:TEMP 'MicrosoftEdgeWebview2Setup.exe'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $installer
}
$signature=Get-AuthenticodeSignature -FilePath $installer
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft'){exit 41}
$p=Start-Process -FilePath $installer -ArgumentList '/silent','/install' -PassThru -Wait
if($p.ExitCode -ne 0){exit $p.ExitCode}
if(-not(Test-WebView2)){exit 42}
exit 0
