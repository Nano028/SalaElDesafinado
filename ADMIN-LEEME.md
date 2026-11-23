# Agenda administrativa · El Desafinado

## Qué está listo

- Acceso por enlace directo a `/admin/`, que abre la demostración sin cuenta de Google. El menú público no muestra ese acceso.
- Panel con la identidad de El Desafinado, adaptable a celular.
- Vistas semanal, mensual y lista; filtros por sala, estado y banda.
- Detalle de cada reserva y enlace a sus filas en Google Sheets.
- Lectura de Fecha, Horario, Sala, Banda y Hasta. También admite Estado y Notas si se agregan después.
- Agrupación de turnos consecutivos, aviso de superposiciones y reservas que cruzan medianoche.
- Refresco manual y cada minuto mientras la agenda está abierta.
- Backend privado con control de cuenta en el servidor; la planilla sigue siendo el lugar de edición.
- Botón discreto al pie de la agenda para abrir la planilla de Google Sheets.
- Backend público separado: la disponibilidad real publica solamente fecha, horario, sala y disponibilidad. La demo usa una planilla ficticia independiente.

## Estado de activación

Este repositorio se publica como **demostración comercial**. El sitio público y `/admin/` leen la misma planilla de ejemplo. Cualquier visitante puede ver la página, consultar la agenda y abrir la planilla sin iniciar sesión. La planilla es de **solo lectura para visitantes**; su propietario puede editar las reservas y pulsar Actualizar en la agenda para mostrar el cambio. Las fechas del ejemplo avanzan con la semana actual mediante fórmulas de Sheets.

La agenda privada original conserva sus controles de Google y su configuración. No se amplió su acceso. Su enlace sigue en `adminUrl`, reservado para una configuración con `demoMode:false`.

Configuración pública en `script/config.js`:

- `demoMode:true` abre la agenda de demostración directamente en `/admin/`; `?demo=1` también sigue funcionando.
- `publicApiUrl` incluye `?demo=1` y devuelve la disponibilidad de la planilla ficticia sin bandas.
- `demoApiUrl` incluye `?demo=1&view=agenda` y devuelve las reservas ficticias y el enlace a su planilla.

Propiedades del backend público: `DEMO_SHEET_ID` y `DEMO_SHEET_NAME=Reservas demo`. El ID debe ser distinto de `SHEET_ID` y el título de esa planilla debe comenzar con `DEMO · `. No se admiten IDs de planillas enviados por visitantes. La ruta normal del backend sigue limitada a cuatro campos y no expone las reservas reales.

Los pasos de instalación de abajo quedan como referencia para el mantenimiento y para adaptar el sistema a otra sala. Los cambios del sitio se publican en GitHub Pages al integrarlos a `main`.

La demostración lleva un aviso visible. Si falla su conexión, muestra un error y no sustituye los turnos de Sheets por ejemplos locales. El ejemplo local sin `demoApiUrl` queda disponible para desarrollo.

## 1. Probar el panel

Abrir `/admin/` sin cuenta de Google, recorrer las vistas y abrir el botón de la planilla al pie. Para mostrar la sincronización, el propietario puede modificar una reserva ficticia en Sheets y pulsar Actualizar. Al volver a cargar el sitio público, la disponibilidad debe reflejar el mismo cambio. No hace falta instalar dependencias.

## Pasar de la demostración a un cliente

1. Crear una instalación y planilla propias para el negocio, con su identidad y datos reales.
2. En la copia del sitio, usar `demoMode:false`, quitar `demoApiUrl` y configurar `publicApiUrl` sin `?demo=1` con la API de disponibilidad del cliente.
3. Implementar la agenda privada con la configuración de abajo y cargar su URL en `adminUrl`.
4. Autorizar las cuentas de Google del cliente en `ADMIN_EMAILS` y darles acceso a su planilla. Cada persona inicia sesión con su propia cuenta; no se comparten ni se guardan contraseñas de Google en el sitio.
5. Restringir la planilla del negocio a las cuentas autorizadas. La demo comercial conserva únicamente datos ficticios y sigue abierta para prospectos.

## 2. Activar la agenda privada en Google

Crear un proyecto **nuevo** en Apps Script llamado `El Desafinado · Agenda privada`. Así se conserva la API pública anterior durante la prueba.

1. Copiar los archivos de `admin/apps-script/` al proyecto: `Code.gs`, `Model.gs`, `Index.html` y `appsscript.json`. El manifiesto se hace visible en Configuración del proyecto → Mostrar archivo de manifiesto.
2. En Configuración del proyecto → Propiedades del script, cargar:

| Propiedad      | Valor                                                             |
| -------------- | ----------------------------------------------------------------- |
| `SHEET_ID`     | ID de la planilla de reservas, entre `/d/` y `/edit` en su enlace |
| `SHEET_NAME`   | `Hoja 1`                                                          |
| `ADMIN_EMAILS` | Correos autorizados, separados por coma                           |
| `SITE_URL`     | `https://nano028.github.io/SalaElDesafinado/`                     |
| `BRAND_NAME`   | `El Desafinado`                                                   |
| `BRAND_COLOR`  | `#ff6b35`                                                         |
| `SLOT_MINUTES` | `60`                                                              |

3. Implementar → Nueva implementación → Aplicación web. **Ejecutar como: usuario que accede a la aplicación web**. Acceso: usuarios con cuenta de Google (o solo tu cuenta para la primera prueba).
4. Abrir el enlace con una cuenta incluida en `ADMIN_EMAILS`, que además debe tener al menos permiso de lectura en la planilla. Cada usuario autoriza el acceso de Google al entrar. El manifiesto usa el servicio avanzado Sheets v4 y el permiso `spreadsheets.readonly`: **Google concede solo lectura, sin edición**. Este permiso permite consultar hojas de la cuenta; el código limita sus consultas al `SHEET_ID` configurado. El servicio se habilita desde el manifiesto; si se usa un proyecto Cloud estándar, activar además Google Sheets API en ese proyecto.
5. Copiar el enlace terminado en `/exec` a `adminUrl` en `script/config.js` y publicar esa modificación del sitio.

**Privacidad:** no incluir correos autorizados, credenciales ni reservas en JavaScript público. No implementar la agenda privada como el propietario para visitantes. Los controles rechazan usuarios desconocidos, anónimos o ejecutados con una identidad distinta. El código no agrega acceso público a la planilla. Si la planilla permite actualmente “cualquier persona con el enlace”, restringir esa opción cuando se confirme que la API pública funciona como su propietario; de otro modo se puede leer la planilla directamente, aunque la agenda tenga acceso privado.

## 3. Actualizar la disponibilidad pública para usar Hasta

La API anterior no se modifica automáticamente. **Antes de usar Hasta para reservar varias horas**, implementar `backend/public/` en un segundo proyecto nuevo de Apps Script:

1. Copiar `Code.gs`, `Model.gs` y `appsscript.json`.
2. Cargar `SHEET_ID`, `SHEET_NAME=Hoja 1` y `SLOT_MINUTES=60` como propiedades del script.
3. Implementar como aplicación web, **ejecutar como el propietario**, acceso **cualquier persona**. Este proyecto solo tiene una respuesta de disponibilidad, sin el panel ni datos de bandas.
4. Probar el enlace `/exec`: debe devolver `success:true` y datos con cuatro campos: `fecha`, `horario`, `sala`, `disponible`.
5. Reemplazar `publicApiUrl` en `script/config.js`. Mantener la URL anterior hasta que esta prueba pase.

Ejemplo de prueba: reservar Sala A de 18:00 a 20:00. La web debe mostrar ocupados tanto el turno de 18:00 como el de 19:00, y libre el de 20:00 si no hay otra reserva. En el JSON no deben aparecer nombres de bandas ni notas.

## Cómo cargar reservas

- Se mantiene una fila por turno de la grilla. **Banda vacía = libre**. No borrar las filas de horarios libres si se quieren ofrecer en la web.
- Escribir la banda y, opcionalmente, **Hasta**. Si Hasta está vacío, el turno se calcula en 60 minutos. No se presuponen ensayos de dos horas.
- Los turnos contiguos de la misma banda y sala se reúnen en una reserva. Para otra duración, completar Hasta, por ejemplo `20:00`.
- Dos horas contiguas pueden estar marcadas en dos filas, o una sola fila indicar el intervalo con Hasta; la nueva API pública contempla ambas formas.
- Si hay fórmulas en Banda, conservarlas. El panel lee su resultado visible, no modifica las celdas.
- Si después se agrega **Estado**, admite Reservada, Pendiente y Cancelada. Sin columna Estado, toda banda cargada se considera reservada. Las pendientes ocupan el horario; las canceladas lo liberan.
- Las consultas por WhatsApp siguen requiriendo confirmación de la sala.
- Para ofrecer fechas nuevas, agregar sus filas de fecha, horario y sala a la planilla; ampliar el filtro si corresponde. El panel lee toda el área con datos.

## Verificación antes de usar con un cliente

1. Cuenta autorizada entra y ve los mismos turnos que Sheets.
2. Cuenta no autorizada no obtiene la agenda ni llama a `getCalendarData`.
3. Cambio en Sheets → Actualizar en la agenda → coincide fecha, sala, banda y duración.
4. Turno de varias horas bloquea toda su duración en la web pública.
5. Probar celular, filtros, semana siguiente, detalle y enlace a la planilla.
6. Confirmar contacto, dirección, redes y datos comerciales propios de cada sala antes de publicar una adaptación del modelo.

## Mantenimiento del código

`admin/index.html`, `style.css`, `model.js` y `app.js` son las fuentes. Después de modificarlas, ejecutar:

```sh
node --test admin/test-admin.cjs
node admin/build-admin.mjs
```

El segundo comando regenera `admin/apps-script/Index.html`, `admin/apps-script/Model.gs` y `backend/public/Model.gs`. Subir los archivos actualizados a cada proyecto y publicar una nueva versión de su implementación.

No hay cuotas mensuales de software adicionales definidas por este código. Las implementaciones siguen sujetas a los permisos y cuotas de Google Apps Script.
