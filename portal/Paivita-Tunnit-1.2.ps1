#requires -Version 5.1
#requires -RunAsAdministrator
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base='C:\TJT\Ohjelmat\TJT-Portaali-v1'
$meta=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'update.json') -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath (Join-Path $base 'Yhteiset.ps1') -Algorithm SHA256).Hash -ne $meta.baseline.'Yhteiset.ps1'){throw 'Portaalin versio on muuttunut. Pyydetaan nykyiseen versioon sopiva paketti.'}
. (Join-Path $base 'Yhteiset.ps1')
Assert-Environment
$settings=Join-Path $TjtSettings 'tuntivahti'
$check=Join-Path $PSScriptRoot 'install-ui-update.cjs'
function Check([string]$Mode){& $TjtNode $check $Mode;if($LASTEXITCODE -ne 0){throw "Tarkistus epaonnistui: $Mode"}}
Assert-NoLinks $PSScriptRoot;Assert-NoLinks $settings;Assert-NoLinks (Join-Path $settings 'config.json');Assert-NoLinks (Join-Path $base 'manifest.json')
foreach($f in $meta.payload.PSObject.Properties.Name){Assert-NoLinks (Join-Path $base $f);Assert-NoLinks (Join-Path $PSScriptRoot "payload\$f")}
Check 'preflight'
Invoke-Portal @((Join-Path $base 'operations.cjs'),'verify-package',$base)
if((Read-Config).phase -ne 'active'){throw 'Portaali ei ole aktiivisessa tuotantotilassa.'}
Assert-OwnTask $TjtServerTask (Join-Path $base 'server.cjs') 'TJT Portal server v1' | Out-Null
$bt=Assert-OwnTask $TjtBackupTask (Join-Path $base 'backup\run.cjs') 'TJT Portal backup v1'
if(!$bt.Settings.Enabled){throw 'Varmuuskopiointiajastus on pois kaytosta. Sita ei muutettu.'}
Write-Host 'Varmistetaan paikallinen kopio ja Drive-palautus ennen paivitysta.'
Test-BackupTask | Out-Null
$restore=Join-Path $TjtBackups ('Ennen-Tunnit-12-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N'))
Assert-NoLinks $restore
New-Item -ItemType Directory -Path $restore | Out-Null
Set-PrivateAcl $restore 'ReadAndExecute'
$overwritten=@();$added=@()
foreach($f in $meta.payload.PSObject.Properties.Name){if($meta.baseline.PSObject.Properties.Name -contains $f){$overwritten+=,$f;$dest=Join-Path $restore "payload\$f";New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null;Copy-Item -LiteralPath (Join-Path $base $f) -Destination $dest}else{$added+=,$f}}
Copy-Item -LiteralPath (Join-Path $base 'manifest.json') -Destination (Join-Path $restore 'manifest.json')
$disabled=$false;$stopped=$false;$changed=$false
try{
 Disable-ScheduledTask -TaskName $TjtBackupTask | Out-Null;$disabled=$true
 if((Get-ScheduledTask -TaskName $TjtBackupTask).State -eq 'Running'){throw 'Varmuuskopiointi ehti kaynnistya. Suorita uudelleen sen valmistuttua.'}
 Check 'preflight'
 Write-Host 'Kaynnistetaan portaali uudelleen. Kaytossa on lyhyt katko.'
 $stopped=$true;Stop-Portal;$changed=$true
 foreach($f in $meta.payload.PSObject.Properties.Name){$target=Join-Path $base $f;New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null;Copy-Item -LiteralPath (Join-Path $PSScriptRoot "payload\$f") -Destination $target -Force}
 Check 'manifest'
 Invoke-Portal @((Join-Path $base 'operations.cjs'),'verify-package',$base)
 Start-ScheduledTask -TaskName $TjtServerTask;Wait-Portal $false
 Check 'probe'
 Enable-ScheduledTask -TaskName $TjtBackupTask | Out-Null;$disabled=$false
 Write-Host 'Tarkistetaan varmuuskopiointi myos paivityksen jalkeen.'
 Test-BackupTask | Out-Null
 Write-Host 'VALMIS: Tunnit 1.2 - tyomaakohtaiset litterat ja kuukausinakyma.' -ForegroundColor Green
 Write-Host 'Paivita selaimessa Ctrl+F5. Tarkista Tyomaat > Valitse litterat ja Tuntien tarkistus > Tama kuukausi.'
 Write-Host 'Kirjautumisyhdistyksia, tunnuksia, tietokantoja ja Tailscale-asetuksia ei muutettu tassa asennuksessa.'
 Write-Host "Palautuskansio: $restore"
}catch{
 $failure=$_;Write-Warning "Paivitys keskeytyi: $failure"
 if($changed){try{
  Disable-ScheduledTask -TaskName $TjtBackupTask | Out-Null;$disabled=$true
  $until=(Get-Date).AddMinutes(12)
  while((Get-ScheduledTask -TaskName $TjtBackupTask).State -eq 'Running'){if((Get-Date) -gt $until){throw 'Varmuuskopiointi on yha kaynnissa. Automaattista palautusta ei tehty.'};Write-Host 'Odotetaan varmuuskopiointia ennen palautusta...';Start-Sleep -Seconds 30}
  Stop-Portal
  foreach($f in $overwritten){Copy-Item -LiteralPath (Join-Path $restore "payload\$f") -Destination (Join-Path $base $f) -Force}
  Copy-Item -LiteralPath (Join-Path $restore 'manifest.json') -Destination (Join-Path $base 'manifest.json') -Force
  foreach($f in $added){$target=Join-Path $base $f;if(Test-Path -LiteralPath $target){$dest=Join-Path $restore "Uudet-ohjelmatiedostot\$f";New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null;Move-Item -LiteralPath $target -Destination $dest}}
  Invoke-Portal @((Join-Path $base 'operations.cjs'),'verify-package',$base)
  Start-ScheduledTask -TaskName $TjtServerTask;Wait-Portal $false
  Write-Host 'Aiempi selainversio palautettiin. Tuntitietoja ja salattuja kirjautumisyhdistyksia ei muutettu.'
 }catch{Write-Warning "AUTOMAATTINEN PALAUTUS EI VALMISTUNUT: $_. Palautuskansio: $restore"}}
 elseif($stopped){Start-ScheduledTask -TaskName $TjtServerTask}
 throw $failure
}finally{if($disabled){Enable-ScheduledTask -TaskName $TjtBackupTask | Out-Null}}
