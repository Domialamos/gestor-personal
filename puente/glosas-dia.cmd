@echo off
REM Rutina diaria de glosas. La corre el Programador de tareas a las 19:00 y
REM la reintenta cada 30 minutos hasta las 23:00, ademas de una pasada al
REM iniciar sesion (ver instalar-tarea.ps1).
REM
REM Repasa AYER y despues HOY. Lo de ayer es la red por si termino de trabajar
REM despues de las 19:00: las horas ya redactadas quedan anotadas en
REM registro\procesadas.json y no se vuelven a tocar. Por eso reintentar es
REM barato y ademas recoge las horas que carga despues de las 19:00.
REM
REM Todo queda registrado en registro\AAAA-MM-DD.txt
REM
REM CUIDADO al editar los bloques de error: hay que escribir set "FALLO=1"
REM con comillas. Sin ellas, el espacio antes del & entra en el valor, FALLO
REM queda como "1 " y la comparacion de mas abajo no calza: eso hacia que la
REM rutina rota terminara diciendo LISTO. Ver README-glosas.md.

cd /d "%~dp0"
if not exist registro mkdir registro

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set "HOY=%%d"
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).AddDays(-1).ToString('yyyy-MM-dd')"') do set "AYER=%%d"
set "LOG=registro\%HOY%.txt"

echo ================================================== >> "%LOG%"
echo Corrida %DATE% %TIME% >> "%LOG%"
echo ================================================== >> "%LOG%"

set "FALLO=0"
set "MOTIVO="
call :undia %AYER% repaso
call :undia %HOY% principal

if "%FALLO%"=="1" goto fallo

echo. >> "%LOG%"
echo LISTO. >> "%LOG%"
call node avisar.mjs --ok >> "%LOG%" 2>&1
exit /b 0

REM ---------------------------------------------------------------
:undia
set "DIA=%1"
set "ETIQUETA=%2"
echo. >> "%LOG%"
echo ----- %DIA% (%ETIQUETA%) ----- >> "%LOG%"

call node glosas-leer.mjs %DIA% >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   fallo al leer %DIA% >> "%LOG%"
  set "FALLO=1"
  set "MOTIVO=fallo al leer %DIA%"
  exit /b 0
)

call node redactar.mjs >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   fallo al redactar %DIA% >> "%LOG%"
  set "FALLO=1"
  set "MOTIVO=fallo al redactar %DIA%"
  exit /b 0
)

call node glosas-escribir.mjs --si >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   fallo al subir %DIA% >> "%LOG%"
  set "FALLO=1"
  set "MOTIVO=fallo al subir %DIA%"
  exit /b 0
)

call node resumen.mjs >> "%LOG%" 2>&1
exit /b 0

REM ---------------------------------------------------------------
:fallo
echo. >> "%LOG%"
echo *** ALGO FALLO EN ESTA CORRIDA: %MOTIVO% *** >> "%LOG%"
call node avisar.mjs "%MOTIVO%" >> "%LOG%" 2>&1
exit /b 1
