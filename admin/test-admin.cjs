const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./model.js');
const headers = ['Fecha','Horario','Sala','Banda','Hasta','Estado'];
const parse = rows => M.parseRows([headers,...rows]);
test('Fechas uruguayas, días inválidos y horarios AM/PM de Sheets',()=>{
  assert.equal(M.parseDate('22/11/2026'),'2026-11-22');
  assert.equal(M.parseDate('31/02/2026'),null);
  assert.equal(M.parseTime('6:00:00 p.m.'),1080);
  assert.equal(M.parseTime('12:00:00 a.m.'),0);
  assert.equal(M.parseTime('12:00:00 p.m.'),720);
  assert.equal(M.parseTime('25:00'),null);
  assert.equal(M.monday('2026-11-22'),'2026-11-16');
});
test('Agrupa turnos consecutivos, respeta Hasta y omite Banda vacía',()=>{
  const {events,warnings}=parse([
    ['22/11/2026','18:00','A','Prueba','20:00'],
    ['22/11/2026','19:00','A','Prueba','20:00'],
    ['22/11/2026','20:00','A',''],
    ['22/11/2026','21:00','A','Otra','']
  ]);
  assert.equal(events.length,2); assert.deepEqual(events[0].rows,[2,3]);
  assert.equal(events[0].end,1200); assert.equal(events[0].inferredEnd,false);
  assert.equal(events[1].end,1320); assert.equal(events[1].inferredEnd,true);
  assert.equal(warnings.length,0);
});
test('Detecta cruces en la misma sala incluyendo medianoche; excluye canceladas',()=>{
  const {events}=parse([
    ['22/11/2026','23:00','A','Trasnoche','01:00'],
    ['23/11/2026','00:30','a','Cruce','02:00'],
    ['23/11/2026','00:30','B','Otra sala','02:00'],
    ['22/11/2026','23:30','A','Cancelada','01:00','Cancelada']
  ]);
  assert.equal(M.segments(events,'2026-11-23')[0].start,0);
  assert.deepEqual([...M.conflicts(events)].sort(),['fila-2','fila-3']);
});
test('Dos salas simultáneas usan carriles y una reserva contigua reutiliza el suyo',()=>{
  const {events}=parse([
    ['22/11/2026','18:00','A','Primera','20:00'],
    ['22/11/2026','19:00','B','Segunda','21:00'],
    ['22/11/2026','20:00','A','Tercera','22:00']
  ]);
  const parts=M.layout(events,'2026-11-22');
  assert.equal(parts[0].lanes,2); assert.equal(parts[0].lane,parts[2].lane);
});
test('Una reserva inválida se informa con su fila; no desaparece sin aviso',()=>{
  const {events,warnings}=parse([['31/02/2026','18:00','A','Inválida','20:00']]);
  assert.equal(events.length,0); assert.equal(warnings[0].row,2);
});
const source = file => fs.readFileSync(path.join(__dirname,file),'utf8');
test('El servidor comprueba identidad y autorización antes de leer la planilla',()=>{
  let active='admin@example.com',effective=active,reads=0;
  const context=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},PropertiesService:{getScriptProperties:()=>({getProperties:()=>({SHEET_ID:'sheet',ADMIN_EMAILS:'admin@example.com'})})},Sheets:{Spreadsheets:{get:()=>{reads++;return {spreadsheetUrl:'https://docs.google.com/spreadsheets/d/sheet/edit',sheets:[{properties:{title:'Hoja 1',sheetId:0,gridProperties:{rowCount:12,columnCount:7}}}]};},Values:{get:(id,range)=>{assert.equal(range,"'Hoja 1'!A1:G12");return {values:[headers,['22/11/2026','18:00','A','Privada','20:00']]};}}}}});
  vm.runInContext(source('model.js')+'\n'+source('apps-script/Code.gs'),context);
  assert.equal(context.getCalendarData().events.length,1); assert.equal(reads,1);
  for(const pair of [['','admin@example.com'],['other@example.com','other@example.com'],['admin@example.com','owner@example.com']]){
    [active,effective]=pair; assert.throws(()=>context.getCalendarData(),/Acceso no autorizado/);
  }
  assert.equal(reads,1,'No lee la planilla si falla el control de acceso.');
});
test('La API pública bloquea toda la duración y nunca devuelve bandas o notas',()=>{
  const context=vm.createContext({});
  vm.runInContext(source('model.js')+'\n'+source('../backend/public/Code.gs'),context);
  const result=context.buildAvailability_([headers,
    ['22/11/2026','18:00','A','Nombre privado','20:00'],
    ['22/11/2026','19:00','A',''],['22/11/2026','20:00','A','']
  ],60);
  assert.deepEqual(Array.from(result,r=>r.disponible),[false,false,true]);
  assert.deepEqual(Object.keys(result[0]),['fecha','horario','sala','disponible']);
  assert.ok(!JSON.stringify(result).includes('Nombre privado'));
  assert.throws(()=>context.buildAvailability_([headers,['bad','18:00','A','Inválida']],60));
});

test('Ambos manifiestos piden solo lectura de Sheets, sin edición',()=>{
  for(const file of ['apps-script/appsscript.json','../backend/public/appsscript.json']){
    const manifest=JSON.parse(source(file));
    assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly'));
    assert.ok(!manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
    assert.equal(manifest.dependencies.enabledAdvancedServices[0].serviceId,'sheets');
  }
});

test('La demo pública solo lee su planilla independiente; view=agenda nunca expone la real',()=>{
  const properties={SHEET_ID:'private-sheet',DEMO_SHEET_ID:'demo-sheet'};
  const reads=[];
  let title='DEMO · Reservas ficticias';
  const context=vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperties:()=>properties})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    Sheets:{Spreadsheets:{get:id=>{reads.push(id);return {properties:{title},spreadsheetUrl:'https://docs.google.com/spreadsheets/d/'+id+'/edit',sheets:[{properties:{title:id==='demo-sheet'?'Reservas demo':'Hoja 1',sheetId:0,gridProperties:{rowCount:4,columnCount:6}}}]};},Values:{get:id=>({values:[headers,['22/11/2026','18:00','A',id==='demo-sheet'?'Banda ficticia':'Banda privada','20:00']]})}}}
  });
  vm.runInContext(source('model.js')+'\n'+source('../backend/public/Code.gs'),context);
  const publicResult=context.doGet({parameter:{view:'agenda'}});
  assert.equal(publicResult.success,true);
  assert.deepEqual(Object.keys(publicResult.data[0]),['fecha','horario','sala','disponible']);
  assert.ok(!JSON.stringify(publicResult).includes('Banda privada'));
  const demoResult=context.doGet({parameter:{demo:'1',view:'agenda',sheetId:'private-sheet'}});
  assert.equal(demoResult.demo,true);
  assert.equal(demoResult.events[0].band,'Banda ficticia');
  assert.equal(demoResult.sheetUrl,'https://docs.google.com/spreadsheets/d/demo-sheet/edit');
  assert.deepEqual(reads,['private-sheet','demo-sheet']);
  const availability=context.doGet({parameter:{demo:'1'}});
  assert.equal(availability.demo,true);
  assert.deepEqual(Object.keys(availability.data[0]),['fecha','horario','sala','disponible']);
  assert.ok(!JSON.stringify(availability).includes('Banda ficticia'));
  title='Reservas reales';
  assert.equal(context.doGet({parameter:{demo:'1',view:'agenda'}}).success,false);
  properties.DEMO_SHEET_ID=properties.SHEET_ID;
  const previousReads=reads.length;
  assert.equal(context.doGet({parameter:{demo:'1',view:'agenda'}}).success,false);
  delete properties.DEMO_SHEET_ID;
  assert.equal(context.doGet({parameter:{demo:'1',view:'agenda'}}).success,false);
  assert.equal(reads.length,previousReads,'No usa la planilla real como alternativa si la demo no está configurada.');
});
