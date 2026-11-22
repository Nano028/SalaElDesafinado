# Agenda administrativa · El Desafinado

## Qué está listo

- Menú **Admin** en el sitio público.
- Panel con la identidad de El Desafinado, adaptable a celular.
- Vistas semanal, mensual y lista; filtros por sala, estado y banda.
- Detalle de cada reserva y enlace a sus filas en Google Sheets.
- Lectura de Fecha, Horario, Sala, Banda y Hasta. También admite Estado y Notas si se agregan después.
- Agrupación de turnos consecutivos, aviso de superposiciones y reservas que cruzan medianoche.
- Refresco manual y cada minuto mientras la agenda está abierta.
- Backend privado con control de cuenta en el servidor; la planilla sigue siendo el lugar de edición.
- Backend público separado: publica solamente fecha, horario, sala y disponibilidad.

## Estado de activación

Los archivos están preparados. **No hay una implementación nueva de Apps Script publicada ni un enlace privado configurado todavía.** El sitio conserva la URL de disponibilidad anterior. Subir estos archivos a GitHub activa el menú y el ejemplo, pero la conexión real del panel necesita la implementación de Google de abajo.

El ejemplo `admin/?demo=1` usa bandas ficticias y lleva un aviso visible. No muestra ni almacena las reservas reales. En caso de error de la conexión real, el panel muestra un error y nunca sustituye las reservas por ejemplos.

## 1. Probar el panel

Abrir `admin/index.html?demo=1` desde un servidor estático, o publicar esta rama en un entorno de prueba y entrar a **Admin → Ver ejemplo de la agenda**. El panel no requiere instalar dependencias.

## 2. Activar la agenda privada en Google

Crear un proyecto **nuevo** en Apps Script llamado `El Desafinado · Agenda privada`. Así se conserva la API pública anterior durante la prueba.

1. Copiar los archivos de `admin/apps-script/` al proyecto: `Code.gs`, `Model.gs`, `Index.html` y `appsscript.json`. El manifiesto se hace visible en Configuración del proyecto → Mostrar archivo de manifiesto.
2. En Configuración del proyecto → Propiedades del script, cargar:

| Propiedad | Valor |
| --- | --- |
| `SHEET_ID` | ID de la planilla de reservas, entre `/d/` y `/edit` en su enlace |
| `SHEET_NAME` | `Hoja 1` |
| `ADMIN_EMAILS` | Correos autorizados, separados por coma |
| `SITE_URL` | `https://nano028.github.io/SalaElDesafinado/` |
| `BRAND_NAME` | `El Desafinado` |
| `BRAND_COLOR` | `#ff6b35` |
| `SLOT_MINUTES` | `60` |

3. Implementar → Nueva implementación → Aplicación web. **Ejecutar como: usuario que accede a la aplicación web**. Acceso: usuarios con cuenta de Google (o solo tu cuenta para la primera prueba).
4. Abrir el enlace con una cuenta incluida en `ADMIN_EMAILS`, que además debe tener al menos permiso de lectura en la planilla. Cada usuario autoriza el acceso de Google al entrar. La aplicación solo consulta la planilla; no tiene acciones de edición. La API `SpreadsheetApp.openById` exige el permiso `spreadsheets` que figura en el manifiesto.
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
