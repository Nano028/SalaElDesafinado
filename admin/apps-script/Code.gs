/** Agenda privada. Las funciones terminadas en _ no se exponen a google.script.run. */
function settings_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const slotMinutes = Number(p.SLOT_MINUTES || 60);
  if (!p.SHEET_ID || !p.ADMIN_EMAILS) throw new Error('Configurá SHEET_ID y ADMIN_EMAILS en Propiedades del script.');
  return {
    sheetId: p.SHEET_ID,
    sheetName: p.SHEET_NAME || 'Hoja 1',
    emails: p.ADMIN_EMAILS.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean),
    name: p.BRAND_NAME || 'El Desafinado',
    primary: /^#[a-f0-9]{6}$/i.test(p.BRAND_COLOR || '') ? p.BRAND_COLOR : '#ff6b35',
    siteUrl: /^https:\/\//.test(p.SITE_URL || '') ? p.SITE_URL : '',
    slotMinutes: slotMinutes,
    timeZone: 'America/Montevideo'
  };
}

function assertAccess_(config) {
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  // Exige ejecución como el visitante: una implementación pública como propietario no da acceso a terceros.
  if (!active || active !== effective || config.emails.indexOf(active) < 0) {
    throw new Error('Acceso no autorizado. Usá la cuenta de Google habilitada por la sala.');
  }
}

function doGet() {
  try {
    const config = settings_();
    assertAccess_(config);
    const template = HtmlService.createTemplateFromFile('Index');
    const client = {name:config.name,primary:config.primary,siteUrl:config.siteUrl,slotMinutes:config.slotMinutes,timeZone:config.timeZone};
    template.configJson = JSON.stringify(client).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return template.evaluate().setTitle('Agenda · ' + config.name).addMetaTag('viewport', 'width=device-width,initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso a la agenda</title><body style="font:16px/1.6 system-ui;background:#111419;color:#fff;padding:40px;max-width:600px;margin:auto"><h1>Agenda privada</h1><p>Ingresá con la cuenta de Google autorizada por la sala. Si el acceso aún no está activo, contactá a quien administra el sitio.</p></body></html>');
  }
}

function getCalendarData() {
  const config = settings_();
  assertAccess_(config); // Se controla en cada actualización, además de doGet.
  const book = SpreadsheetApp.openById(config.sheetId);
  const sheet = book.getSheetByName(config.sheetName);
  if (!sheet) throw new Error('No existe la pestaña configurada.');
  const rows = sheet.getDataRange().getDisplayValues();
  const parsed = AgendaModel.parseRows(rows, {slotMinutes:config.slotMinutes});
  return {events:parsed.events,warnings:parsed.warnings,sheetUrl:book.getUrl(),sheetId:sheet.getSheetId(),updatedAt:new Date().toISOString()};
}
