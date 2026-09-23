@echo off
REM Lanza el agente de glosas. La tarea de Windows "Glosas TimeBilling" lo corre
REM todos los dias a las 19:00, reintentando cada 30 min por 4 horas, mas una
REM pasada al iniciar sesion.
REM
REM El agente repasa AYER y despues HOY, y escribe el mismo la nota del dia.
REM Si el agente MUERE, la nota la escribe este archivo: esa es la garantia de
REM que una corrida rota igual deje rastro en la boveda.
REM
REM CUIDADO: el prompt va a claude por stdin (<), nunca como argumento. Como
REM argumento, cmd.exe destroza las comillas y los saltos de linea.
REM
REM --allowed-tools incluye Write ademas de Bash y Read: el agente arma un
REM JSON temporal y se lo pasa a "tb.mjs nota" leyendo ese archivo, y sin
REM Write no puede escribirlo. Sin este permiso la nota nunca se escribiria.
REM
REM CUIDADO: si "glosas-agente.md" no existe, la redireccion "< glosas-agente.md"
REM falla ANTES de lanzar claude, y cmd.exe deja el errorlevel tal cual estaba
REM (comprobado: no lo pone en 1). Sin este chequeo previo, esa corrida
REM terminaria diciendo LISTO. sin haber escrito nota, tal como paso en agosto
REM de 2026 pero por otra causa. Por eso se revisa antes de invocar a claude.
REM
REM CUIDADO: sin tildes a proposito en el texto que va como argumento a un
REM proceso (en estos comentarios da lo mismo, REM no los ejecuta). Probado:
REM con tilde, cmd.exe entrega el argumento con la letra acentuada corrupta
REM en la nota real de la boveda, porque el codepage de la consola no
REM coincide con el UTF-8 del archivo. Mas simple evitarlas aqui que meter
REM chcp sin probarlo a fondo.

cd /d "%~dp0"
if not exist registro mkdir registro

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set "HOY=%%d"
set "LOG=registro\%HOY%.txt"

echo ================================================== >> "%LOG%"
echo Corrida %DATE% %TIME% >> "%LOG%"
echo ================================================== >> "%LOG%"

if not exist glosas-agente.md (
  echo. >> "%LOG%"
  echo *** NO SE ENCUENTRA glosas-agente.md *** >> "%LOG%"
  goto fallo
)

call claude.cmd -p --allowed-tools "Bash(node tb.mjs *)" "Read" "Write" < glosas-agente.md >> "%LOG%" 2>&1

if errorlevel 1 goto fallo

echo. >> "%LOG%"
echo LISTO. >> "%LOG%"
exit /b 0

:fallo
echo. >> "%LOG%"
echo *** EL AGENTE TERMINO CON ERROR *** >> "%LOG%"
call node tb.mjs nota --fallo "El agente termino con error y no alcanzo a escribir la nota" >> "%LOG%" 2>&1
exit /b 1
