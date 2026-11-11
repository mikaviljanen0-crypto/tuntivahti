#requires -Version 5.1
#requires -RunAsAdministrator
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='C:\TJT\Ohjelmat\TJT-Portaali-v1'
$meta=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'update.json') -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath (Join-Path $base 'Yhteiset.ps1') -Algorithm SHA256).Hash -ne $meta.baseline.'Yhteiset.ps1'){throw 'Portaalin versio on muuttunut. Pyydetaan nykyiseen versioon sopiva paketti.'}
. (Join-Path $base 'Yhteiset.ps1')
Assert-Environment
$check=Join-Path $PSScriptRoot 'install-check.cjs'
$settings=Join-Path $TjtSettings 'tuntivahti'
$module=Join-Path $base 'tuntivahti'
function Check([string]$Mode){& $TjtNode $check $Mode;if($LASTEXITCODE -ne 0){throw "Tarkistus epaonnistui: $Mode"}}
Assert-NoLinks $PSScriptRoot;Assert-NoLinks $settings;Assert-NoLinks $module;Assert-NoLinks (Join-Path $base 'manifest.json')
foreach($f in $meta.payload.PSObject.Properties.Name){Assert-NoLinks (Join-Path $base $f);Assert-NoLinks (Join-Path $PSScriptRoot "payload\$f");if($f.EndsWith('.cjs') -or $f -eq 'app/web/portal.js'){& $TjtNode --check (Join-Path $PSScriptRoot "payload\$f");if($LASTEXITCODE -ne 0){throw "JavaScript-tarkistus epaonnistui: $f"}}}
Check 'preflight';Check 'connection'
Invoke-Portal @((Join-Path $base 'operations.cjs'),'verify-package',$base)
if((Read-Config).phase -ne 'active'){throw 'Portaali ei ole aktiivisessa tuotantotilassa.'}
Assert-OwnTask $TjtServerTask (Join-Path $base 'server.cjs') 'TJT Portal server v1' | Out-Null
$bt=Assert-OwnTask $TjtBackupTask (Join-Path $base 'backup\run.cjs') 'TJT Portal backup v1'
if(!$bt.Settings.Enabled){throw 'Varmuuskopiointiajastus on pois kaytosta. Sita ei muutettu.'}
Write-Host 'Varmistetaan paikallinen kopio ja Drive-palautus ennen paivitysta.'
Test-BackupTask | Out-Null
$restore=Join-Path $TjtBackups ('Ennen-Tunnit-SSO-10-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N'))
Assert-NoLinks $restore
New-Item -ItemType Directory -Path (Join-Path $restore 'app\web') -Force | Out-Null
Set-PrivateAcl $restore 'ReadAndExecute'
foreach($f in @('server.cjs','app\web\portal.js','manifest.json')){Copy-Item -LiteralPath (Join-Path $base $f) -Destination (Join-Path $restore $f)}
$disabled=$false;$stopped=$false;$changed=$false;$settingsCreated=$false
try{
 Disable-ScheduledTask -TaskName $TjtBackupTask | Out-Null;$disabled=$true
 if((Get-ScheduledTask -TaskName $TjtBackupTask).State -eq 'Running'){throw 'Varmuuskopiointi ehti kaynnistya. Suorita uudelleen sen valmistuttua.'}
 Check 'preflight'
 Write-Host 'Kaynnistetaan portaali uudelleen. Kaytossa on lyhyt katko.'
 $stopped=$true;Stop-Portal
 $changed=$true
 New-Item -ItemType Directory -Path $settings | Out-Null;$settingsCreated=$true
 Set-PrivateAcl $settings 'Modify'
 Check 'settings'
 foreach($f in $meta.payload.PSObject.Properties.Name){$target=Join-Path $base $f;New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null;Copy-Item -LiteralPath (Join-Path $PSScriptRoot "payload\$f") -Destination $target -Force}
 Set-PrivateAcl $module 'ReadAndExecute'
 Check 'manifest'
 Invoke-Portal @((Join-Path $base 'operations.cjs'),'verify-package',$base)
 Start-ScheduledTask -TaskName $TjtServerTask;Wait-Portal $false
 Check 'probe'
 Enable-ScheduledTask -TaskName $TjtBackupTask | Out-Null;$disabled=$false
 Write-Host 'Tarkistetaan varmuuskopiointi myos paivityksen jalkeen.'
 Test-BackupTask | Out-Null
 Write-Host 'VALMIS: https://tjt-palvelin.tail528926.ts.net/' -ForegroundColor Green
 Write-Host 'Kirjaudu portaaliin Mikan tunnuksella. Avaa Tunnit ja yhdista oma Tuntivahti-tilisi kerran.'
 Write-Host 'Tuntitietokantoja, nykyisia tunnuksia ja Tailscale-asetuksia ei muutettu.'
 Write-Host "Aiemmat ohjelmatiedostot: $restore"
}catch{
 $failure=$_;Write-Warning "Paivitys keskeytyi: $failure"
 if($changed){try{
  Disable-ScheduledTask -TaskName $TjtBackupTask | Out-Null;$disabled=$true
  $until=(Get-Date).AddMinutes(12)
  while((Get-ScheduledTask -TaskName $TjtBackupTask).State -eq 'Running'){if((Get-Date) -gt $until){throw 'Varmuuskopiointi on yha kaynnissa. Automaattista palautusta ei tehty.'};Write-Host 'Odotetaan varmuuskopiointia ennen palautusta...';Start-Sleep -Seconds 30}
  Stop-Portal
  foreach($f in @('server.cjs','app\web\portal.js','manifest.json')){Copy-Item -LiteralPath (Join-Path $restore $f) -Destination (Join-Path $base $f) -Force}
  if(Test-Path -LiteralPath $module){Move-Item -LiteralPath $module -Destination (Join-Path $restore 'Keskeytetty-Tunnit-moduuli')}
  if($settingsCreated -and (Test-Path -LiteralPath $settings)){Move-Item -LiteralPath $settings -Destination (Join-Path $restore 'Keskeytetyt-Tunnit-asetukset')}
  Invoke-Portal @((Join-Path $base 'operations.cjs'),'verify-package',$base)
  Start-ScheduledTask -TaskName $TjtServerTask;Wait-Portal $false
  Write-Host 'Aiemmat ohjelmatiedostot palautettiin. Keskeytetyn asennuksen tiedostot ovat palautuskansiossa.'
 }catch{Write-Warning "AUTOMAATTINEN PALAUTUS EI VALMISTUNUT: $_. Palautuskansio: $restore"}}
 elseif($stopped){Start-ScheduledTask -TaskName $TjtServerTask}
 throw $failure
}finally{if($disabled){Enable-ScheduledTask -TaskName $TjtBackupTask | Out-Null}}
