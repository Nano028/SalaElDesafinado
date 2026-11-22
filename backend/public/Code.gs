/** API pública: expone únicamente fecha, horario, sala y disponible. */
function doGet() {
  try {
    const p = PropertiesService.getScriptProperties().getProperties();
    if (!p.SHEET_ID) throw new Error('Falta configurar SHEET_ID.');
    const sheet = SpreadsheetApp.openById(p.SHEET_ID).getSheetByName(p.SHEET_NAME || 'Hoja 1');
    if (!sheet) throw new Error('No existe la pestaña configurada.');
    const data = buildAvailability_(sheet.getDataRange().getDisplayValues(), Number(p.SLOT_MINUTES || 60));
    return json_({success:true,data:data});
  } catch (error) {
    // No publicar nombres de bandas, filas, IDs ni errores internos.
    return json_({success:false,error:'No se pudo leer la disponibilidad.'});
  }
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
