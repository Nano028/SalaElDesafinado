/** Disponibilidad real limitada a cuatro campos; demo conectada a una planilla separada. */
function doGet(e) {
  try {
    const p = PropertiesService.getScriptProperties().getProperties();
    const query = e && e.parameter || {};
    if (query.demo === '1') return demoResponse_(p, query.view === 'agenda');
    if (!p.SHEET_ID) throw new Error('Falta configurar SHEET_ID.');
    const source = readSheet_(p.SHEET_ID,p.SHEET_NAME || 'Hoja 1');
    const data = buildAvailability_(source.rows, Number(p.SLOT_MINUTES || 60));
    return json_({success:true,data:data});
  } catch (error) {
    // No publicar nombres de bandas, filas, IDs ni errores internos.
    return json_({success:false,error:'No se pudo leer la disponibilidad.'});
  }
}
function readSheet_(id, name) {
  const book = Sheets.Spreadsheets.get(id, {fields:'spreadsheetUrl,properties(title),sheets(properties)'});
  const sheet = book.sheets.map(function(s){return s.properties;}).find(function(s){return s.title===name;});
  if (!sheet) throw new Error('No existe la pestaña configurada.');
  let column = '', n = sheet.gridProperties.columnCount;
  while (n > 0) { n--; column = String.fromCharCode(65+n%26)+column; n=Math.floor(n/26); }
  const range = "'"+name.replace(/'/g,"''")+"'!A1:"+column+sheet.gridProperties.rowCount;
  const values = Sheets.Spreadsheets.Values.get(id,range,{valueRenderOption:'FORMATTED_VALUE',majorDimension:'ROWS'});
  return {rows:values.values||[],url:book.spreadsheetUrl,sheetId:sheet.sheetId,title:book.properties && book.properties.title || ''};
}
function demoResponse_(p, agenda) {
  // Nunca reutilizar SHEET_ID ni admitir IDs enviados por el visitante.
  if (!p.DEMO_SHEET_ID || p.DEMO_SHEET_ID === p.SHEET_ID) throw new Error('Falta una planilla de demostración independiente.');
  const source = readSheet_(p.DEMO_SHEET_ID, p.DEMO_SHEET_NAME || 'Reservas demo');
  if (source.title.indexOf('DEMO · ') !== 0) throw new Error('La planilla no está identificada como demostración.');
  const slotMinutes = Number(p.SLOT_MINUTES || 60);
  if (!agenda) return json_({success:true,demo:true,data:buildAvailability_(source.rows,slotMinutes)});
  const parsed = AgendaModel.parseRows(source.rows,{slotMinutes:slotMinutes});
  return json_({success:true,demo:true,events:parsed.events,warnings:parsed.warnings,sheetUrl:source.url,sheetId:source.sheetId,updatedAt:new Date().toISOString()});
}
function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
function buildAvailability_(rows, slotMinutes) {
  const model = AgendaModel;
  const parsed = model.parseRows(rows,{slotMinutes:slotMinutes});
  if (parsed.warnings.length) throw new Error('Revisá las filas inválidas antes de publicar disponibilidad.');
  const headings = rows[0].map(model.normalize);
  const dateCol=headings.indexOf('fecha'), timeCol=headings.indexOf('horario'), roomCol=headings.indexOf('sala');
  const active=parsed.events.filter(function(e){return e.status!=='cancelada';});
  const seen={};
  return rows.slice(1).reduce(function(list,row){
    const date=model.parseDate(row[dateCol]), start=model.parseTime(row[timeCol]), room=String(row[roomCol]||'').trim();
    if (!date || start===null || !room) return list;
    const key=[date,start,model.normalize(room)].join('|'); if(seen[key]) return list; seen[key]=true;
    // Incluye reservas que arrancaron el día anterior y cruzaron medianoche.
    const occupied=model.segments(active,date).some(function(p){return model.normalize(p.event.room)===model.normalize(room) && p.start<start+slotMinutes && p.end>start;});
    list.push({fecha:date,horario:model.timeText(start),sala:room,disponible:!occupied});
    return list;
  },[]).sort(function(a,b){return a.fecha.localeCompare(b.fecha)||a.horario.localeCompare(b.horario)||a.sala.localeCompare(b.sala);});
}
