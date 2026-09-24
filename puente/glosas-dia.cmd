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
REM JSON temporal y se lo pasa a "tb.mjs nota" leyendo ese archivo, y sin Write
REM no puede escribirlo. Sin este permiso la nota nunca se escribiria.
REM
REM Va ACOTADO a "Write(registro/nota-*.json)" y no como Write suelto. Con Write
REM suelto, registro/procesadas.json (el registro de lo ya verificado, la pieza
REM que impide reescribir cada noche las glosas ya pulidas) quedaba a un Write de
REM distancia, y la proteccion dependia de que el prompt no lo mencionara. El
REM patron no lo alcanza, asi que ya no depende del silencio del prompt. La forma
REM Tool(patron) con comodines es la que documenta esta version del CLI
REM (claude.cmd --help: ejemplos "Bash(npm run build)", "Edit(docs/**)").
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

REM CUIDADO: mismo problema que la redireccion de entrada, pero con la de
REM salida. Si "registro" no quedo disponible (el mkdir de arriba fallo por
REM permisos o disco lleno, hay un archivo suelto llamado "registro", o una
REM carpeta sincronizada que se pone rara), entonces ">> archivo" en una
REM carpeta que no admite escritura falla EN SILENCIO y deja el errorlevel
REM intacto: el "if errorlevel 1" de mas abajo nunca dispara, todo cae al
REM bloque de LISTO. y el script sale 0 sin haber lanzado al agente y sin
REM ninguna nota, ni buena ni de fallo. Por eso se prueba la escritura de
REM verdad ANTES de apoyarse en el errorlevel para el resto de la logica: un
REM nombre con %RANDOM% para no confundir un archivo viejo con una escritura
REM que si funciono ahora mismo.
set "SONDA=registro\.sonda-%RANDOM%.tmp"
echo x > "%SONDA%" 2>nul
if not exist "%SONDA%" (
  call node tb.mjs nota --fallo "No se pudo escribir en registro\ (revisar permisos, disco o que sea una carpeta)"
  exit /b 1
)
del "%SONDA%" >nul 2>&1

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

call claude.cmd -p --allowed-tools "Bash(node tb.mjs *)" "Read" "Write(registro/nota-*.json)" < glosas-agente.md >> "%LOG%" 2>&1

REM CUIDADO: el errorlevel de claude se guarda AQUI, en la primera linea
REM despues del call. Cualquier comando intermedio (un echo, un if not exist,
REM un for) lo pisa y la deteccion del fallo del agente se pierde: eso ya fue
REM un bug y ya se arreglo una vez. El %ERRORLEVEL% se expande ANTES de que
REM corra el set, asi que en SALIDA queda el codigo de claude aunque el propio
REM set deje el errorlevel en cero.
set "SALIDA=%ERRORLEVEL%"

REM Se compara como texto en vez de "if errorlevel 1" porque asi tambien cae un
REM codigo negativo: un crash de claude devuelve -1073741819, y "if errorlevel 1"
REM solo mira mayor o igual que 1, asi que un crash pasaba por bueno.
if not "%SALIDA%"=="0" goto fallo

REM CUIDADO (Critical 3 de la revision final): que el agente salga 0 NO significa
REM que haya escrito la nota. Las corridas del 22-09-2026 a las 21:58 y 22:01
REM salieron 0 sin dejar nota y este archivo escribio LISTO.: la garantia de "la
REM nota se escribe siempre" no existia, y esa es la firma exacta del fallo mudo
REM de agosto de 2026 que costo dos dias de glosas.
REM
REM "nota --asegurar" comprueba la nota del dia y solo escribe la de fallo si
REM falta; la ruta de la boveda y el dia en horario de Chile los sabe tb.mjs, no
REM este archivo. Sale 1 si tuvo que escribirla, y entonces esta corrida es una
REM corrida fallida: sale 1 para que la tarea de Windows reintente.
REM Mismo cuidado que con claude: el codigo se guarda en la linea INMEDIATAMENTE
REM siguiente al call, sin nada entremedio, y se compara como texto. Con
REM "if errorlevel 1" un crash de node con codigo negativo se colaba como exito
REM y la corrida decia LISTO. sin haber dejado nota.
call node tb.mjs nota --asegurar "El agente termino sin error pero no dejo la nota del dia" >> "%LOG%" 2>&1
set "SALIDA_NOTA=%ERRORLEVEL%"
if not "%SALIDA_NOTA%"=="0" (
  echo. >> "%LOG%"
  echo *** EL AGENTE SALIO 0 SIN DEJAR NOTA - se escribio la nota de fallo *** >> "%LOG%"
  exit /b 1
)

echo. >> "%LOG%"
echo LISTO. >> "%LOG%"
exit /b 0

:fallo
echo. >> "%LOG%"
echo *** EL AGENTE TERMINO CON ERROR *** >> "%LOG%"
REM El motivo no afirma nada sobre la nota: puede que el agente la haya escrito
REM antes de morir. Si ya hay nota del dia, --fallo la conserva y le agrega el
REM aviso arriba; si no hay, escribe la nota minima de fallo.
call node tb.mjs nota --fallo "El agente termino con error" >> "%LOG%" 2>&1
exit /b 1
