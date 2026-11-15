# Vaultwarden

Supervise su servidor [Vaultwarden](https://github.com/dani-garcia/vaultwarden)
en Gladys: un dispositivo «Vaultwarden» (accesible o no, tiempo de respuesta,
versión, actualización disponible y última versión, y con el token de
administración los usuarios, organizaciones, invitaciones pendientes, cuentas
desactivadas y la última actividad), un widget del panel y disparadores de
escena cuando el servidor deja de estar accesible, vuelve, o cuando sale una
nueva versión.

Vaultwarden es el servidor ligero y autoalojado compatible con las
aplicaciones de Bitwarden. Esta integración **solo supervisa el servidor
desde fuera**: no inicia sesión en ninguna cuenta, no abre ninguna caja fuerte
y no lee ninguna contraseña. Se ha probado contra un Vaultwarden 1.37.5 real
en Docker, con y sin token de administración, con cuentas creadas, invitadas y
desactivadas, y con el servidor detenido. Sus comentarios son bienvenidos en
el [foro de Gladys](https://community.gladysassistant.com) o en las
[issues](https://github.com/guim31/gladys-vaultwarden/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor Vaultwarden accesible desde Gladys: la dirección con la que abre
  la caja fuerte web.
- Opcional: el token de administración del servidor (la variable
  `ADMIN_TOKEN`, la que abre la página `/admin`), para el recuento de cuentas.
- Opcional: acceso a Internet de Gladys a GitHub, para buscar
  actualizaciones.

## Configuración

1. En Gladys, instale la integración y abra su pantalla de **Configuración**.
2. Rellene **Dirección de Vaultwarden**: `https://vault.example.com`, o
   `192.168.1.20:8080` para una dirección http de su red. Si Vaultwarden se
   sirve bajo una subruta (`DOMAIN` termina en `/vault`), escríbala también.
3. Opcional: rellene **Token de administración (opcional)** para obtener el
   recuento de cuentas.
4. Pulse **Probar la conexión**: muestra la versión, si está actualizada, y
   las cuentas.
5. En la pestaña **Descubrir**, añada el dispositivo **Vaultwarden**.

Los demás ajustes:

- **Aceptar un certificado autofirmado**: solo para una dirección https cuyo
  certificado no está firmado por una autoridad conocida.
- **Buscar actualizaciones** (activado por defecto): compara la versión
  instalada con la última publicada en GitHub, leída cada 6 horas (GitHub
  permite 60 solicitudes anónimas por hora).
- **Intervalo de actualización**: frecuencia de comprobación del servidor (de
  30 s a 15 min, 1 min por defecto). Una comprobación son dos pequeñas
  solicitudes: `/alive` y `/api/version`.
- **Idioma de los nombres**: idioma de los nombres de las funciones y de las
  fechas, fijado al añadir el dispositivo.

### El token de administración

Escriba el token **en claro**, el que escribe en la página `/admin`. Si
`ADMIN_TOKEN` contiene un hash Argon2 (`$argon2id$…`), es la contraseña que
usted convirtió en hash, no el hash.

Con el token, Gladys inicia sesión en la página de administración y lee la
lista de cuentas (`/admin/users`) como mucho cada 5 minutos, conservando la
sesión hasta que caduca. Solo cuenta: usuarios, organizaciones, invitaciones
pendientes, cuentas desactivadas, última actividad. **Ningún contenido de la
caja fuerte se puede leer así**: la propia página de administración nunca ve
las contraseñas, cifradas en sus dispositivos.

Un token rechazado no se vuelve a probar hasta que cambie la configuración o
pulse **Probar la conexión**: una herramienta como fail2ban suele vigilar
estos inicios de sesión. Gladys guarda el token como cualquier campo secreto y
nunca lo escribe en los registros. Con una dirección `http://`, y con **Aceptar un certificado autofirmado**, viaja sin protección o hacia un servidor no verificado: prefiera https, o resérvelo a una red de confianza.

## Los dispositivos

Un dispositivo **Vaultwarden**, con:

| Función                  | Tipo   | Cuándo                                                |
| ------------------------ | ------ | ----------------------------------------------------- |
| Accesible                | 0 / 1  | siempre                                               |
| Tiempo de respuesta      | ms     | mientras está accesible                               |
| Versión                  | texto  | una vez leída                                         |
| Actualización disponible | 0 / 1  | con **Buscar actualizaciones**                        |
| Última versión           | texto  | con **Buscar actualizaciones**                        |
| Usuarios                 | número | con el token de administración (sin las invitaciones) |
| Organizaciones           | número | con el token de administración                        |
| Invitaciones pendientes  | número | con el token de administración                        |
| Cuentas desactivadas     | número | con el token de administración                        |
| Última actividad         | texto  | con el token de administración (fecha y hora)         |

La integración lee el servidor con su propio temporizador: los valores se
publican cuando cambian, y cada 12 horas de todos modos. Añadir o quitar el
token de administración, o activar o desactivar la búsqueda de
actualizaciones, cambia las funciones: Gladys propone entonces **Actualizar**
el dispositivo en la pestaña Descubrir.

## Panel

El widget **Vaultwarden** muestra, en una sola lista: el servidor (con el
nombre dado al dispositivo en Gladys) y su tiempo de respuesta, o
**Inaccesible** en rojo; la versión, marcada como actualizada o con la versión
que instalar; y, con el token de administración, las cuentas. Su ajuste
**Mostrar las cuentas** oculta las filas de las cuentas.

## Escenas

### Disparadores

- **Vaultwarden deja de estar accesible**: el servidor deja de responder a su
  control de estado, tras haber respondido. Variables: el nombre del servidor,
  la versión instalada.
- **Vaultwarden vuelve a estar accesible**: el servidor vuelve a responder, tras **Vaultwarden deja de estar accesible** (un servidor ya detenido al iniciarse la integración no activa ninguno de los dos).
  Variables: el nombre del servidor, la versión instalada, el tiempo de
  inactividad en minutos.
- **Hay una actualización de Vaultwarden disponible**: aparece en GitHub una
  versión más reciente que la instalada, una vez por versión. Variables: el
  nombre del servidor, la versión instalada, la nueva versión, el enlace a sus
  notas. Una versión ya publicada al iniciarse la integración se indica con
  **Actualización disponible**, sin el disparador.

### Ideas de escenas

- Enviar un mensaje cuando el servidor de contraseñas deja de responder, y
  otro con el tiempo de inactividad cuando vuelve.
- Recibir en un mensaje el enlace a las notas de versión cuando sale una
  nueva versión.
- Usar **Invitaciones pendientes** en una condición para recordar una
  invitación que nadie ha aceptado.

## Solución de problemas

- **«Vaultwarden no responde»**: compruebe la dirección y el puerto, y que
  Gladys puede alcanzarlos (cortafuegos, `127.0.0.1` desde un contenedor).
- **«No hay ningún servidor Vaultwarden en esta dirección»**: la dirección
  lleva a otro servicio (una página del proxy inverso, otro puerto) o falta la
  subruta.
- **«Certificado rechazado»**: si el certificado es suyo, active **Aceptar un
  certificado autofirmado**.
- **«Token de administración rechazado»**: escriba el token en claro, no su hash Argon2. Con `DISABLE_ADMIN_TOKEN`, el servidor no tiene ningún token que comprobar: deje el campo vacío.
- **«La página de administración de Vaultwarden está desactivada»**: el
  servidor no tiene `ADMIN_TOKEN`: deje el token vacío.
- **«Demasiados inicios de sesión de administración»**: Vaultwarden limita los
  inicios de sesión en la página de administración (`ADMIN_RATELIMIT_*`); la
  integración vuelve a intentarlo 5 minutos después.

## Límites

- Un solo servidor Vaultwarden por instalación de la integración.
- La página de administración no tiene token de solo lectura: el token de
  administración que da a Gladys permitiría gestionar el servidor. Déjelo
  vacío si solo le interesan la disponibilidad y la versión.
- Con `DISABLE_ADMIN_TOKEN` (página de administración protegida por un proxy
  en lugar de un token), el recuento de cuentas no está disponible.
- **Actualización disponible** compara números de versión: una imagen
  `testing` construida después de la última versión publicada se lee como esa
  versión.
- El disparador de actualización no se guarda: una versión publicada mientras
  la integración estaba detenida se indica con **Actualización disponible**,
  sin el disparador.
- Sin relación con el proyecto Vaultwarden ni con Bitwarden Inc. Bitwarden es
  una marca de Bitwarden Inc.
