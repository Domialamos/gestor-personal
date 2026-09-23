# Registra la rutina de glosas.
# No necesita permisos de administrador: la tarea corre bajo tu propia sesion.
#
# Disparadores:
#   - Todos los dias 19:00, reintentando cada 30 min hasta las 23:00.
#   - Al iniciar sesion (5 min despues), que recoge el dia anterior si el
#     notebook estuvo apagado o fuera de la red del estudio toda la tarde.
#
# Reintentar es barato y ademas util: registro\procesadas.json evita reescribir
# glosas ya pulidas, asi que una corrida sobre un dia ya listo no toca nada, y
# de paso recoge las horas que hayas cargado despues de las 19:00.

$guion = Join-Path $PSScriptRoot "glosas-dia.cmd"
if (-not (Test-Path $guion)) { Write-Error "No encuentro $guion"; exit 1 }

$nombre = "Glosas TimeBilling"
$accion = New-ScheduledTaskAction -Execute $guion -WorkingDirectory $PSScriptRoot

# Disparador de la tarde, con reintentos cada media hora durante 4 horas.
$tarde = New-ScheduledTaskTrigger -Daily -At 19:00
$patron = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 30) `
  -RepetitionDuration (New-TimeSpan -Hours 4)
$tarde.Repetition = $patron.Repetition

# Disparador al iniciar sesion: la red de seguridad del dia siguiente.
$inicio = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$inicio.Delay = "PT5M"

# IgnoreNew: si una corrida se alarga, la siguiente no se encima.
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $tarde,$inicio `
  -Settings $opciones -Description "Redacta y sube las glosas del dia en TimeBilling." -Force | Out-Null

Write-Host ""
Write-Host "Tarea '$nombre' registrada." -ForegroundColor Green
Write-Host "  Todos los dias 19:00, reintentando cada 30 min hasta las 23:00."
Write-Host "  Y al iniciar sesion, 5 min despues."
Write-Host ""
Write-Host "Para probarla ahora mismo:  Start-ScheduledTask -TaskName '$nombre'"
Write-Host "Para desactivarla:          Disable-ScheduledTask -TaskName '$nombre'"
