(function () {
  "use strict";
  const M = window.AgendaModel, config = window.SALA_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const demo = new URLSearchParams(location.search).get("demo") === "1";
  const live = Boolean(window.google && google.script && google.script.run);
  const state = { events: [], warnings: [], date: M.today(config.timeZone), view: matchMedia("(max-width:760px)").matches ? "list" : "week", room: "", status: "active", search: "", sheetUrl: "", sheetId: 0, loaded: false, loading: false };
  const states = { reservada: "Reservada", pendiente: "Pendiente", cancelada: "Cancelada" };
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === "https:" ? u.href : ""; } catch (_) { return ""; } };
  const rangeText = e => M.timeText(e.start) + "–" + M.timeText(e.end) + (e.end > 1440 ? " (+1 día)" : "");
  const roomClass = room => "room-" + (Math.max(0, [...new Set(state.events.map(e => e.room))].sort().indexOf(room)) % 3);
  function dateRange() {
    if (state.view === "month") { const start = state.date.slice(0,7) + "-01"; return [start, M.addDays(nextMonth(start, 1), -1)]; }
    const start = M.monday(state.date); return [start, M.addDays(start, 6)];
  }
  function nextMonth(date, amount) {
    const d = new Date(date.slice(0,7) + "-01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + amount); return d.toISOString().slice(0,10);
  }
  function filtered() {
    return state.events.filter(e => (!state.room || e.room === state.room) && (state.status === "all" || (state.status === "active" ? e.status !== "cancelada" : e.status === state.status)) && (!state.search || M.normalize(e.band).includes(state.search)));
  }
  function inRange(events, start, end) { return events.filter(e => e.date <= end && (e.date >= start || (e.end > 1440 && M.addDays(e.date,1) >= start))); }
  function fixtures() {
    const start = M.monday(M.today(config.timeZone));
    const row = (day, hour, room, band, end, status = "Reservada", notes = "") => [M.addDays(start, day), hour, room, band, end, status, notes];
    return M.parseRows([
      ["Fecha","Horario","Sala","Banda","Hasta","Estado","Notas"],
      row(0,"18:00","A","Los Satélites","20:00"), row(0,"20:00","B","Patio Lunar","22:00"),
      row(1,"19:00","A","Ruido Sur","21:00"), row(2,"18:00","A","Los Satélites","20:00"),
      row(2,"18:30","B","Patio Lunar","20:30","Pendiente","Esperando confirmación de la sala."),
      row(3,"20:00","A","La Frecuencia","22:00"), row(4,"19:00","B","Ruido Sur","21:00"),
      row(4,"21:00","A","Los Satélites","23:00"), row(5,"18:00","A","Patio Lunar","20:00"),
      row(5,"21:00","B","La Frecuencia","23:00","Cancelada"),
      row(6,"18:00","A","Ruido Sur","20:00"), row(6,"20:00","B","Los Satélites","22:00"),
      row(7,"19:00","A","La Frecuencia","21:00"), row(8,"18:00","B","Patio Lunar","20:00")
    ], {slotMinutes:60});
  }
  function applyData(data) {
    if (!data || !Array.isArray(data.events)) throw new Error("La agenda recibió una respuesta inválida.");
    state.events = data.events; state.warnings = data.warnings || []; state.loaded = true;
    state.sheetUrl = safeUrl(data.sheetUrl); state.sheetId = Number(data.sheetId || 0);
    const room = state.room;
    $("room-filter").innerHTML = '<option value="">Todas las salas</option>' + [...new Set(state.events.map(e => e.room))].sort().map(r => '<option value="' + esc(r) + '">Sala ' + esc(r) + '</option>').join("");
    if ([...$("room-filter").options].some(o => o.value === room)) $("room-filter").value = room;
    else state.room = "";
    if (state.sheetUrl) ["sheet-link","sheet-link-mobile","sheet-footer-link"].forEach(id=>{ $(id).href=state.sheetUrl; $(id).hidden=false; });
    $("sheet-footer-note").hidden=Boolean(state.sheetUrl);
    $("error").hidden = true;
    const warnings = [];
    if (state.warnings.length) warnings.push(state.warnings.length + " fila(s) necesitan revisión: " + state.warnings.map(w => w.row).join(", ") + ".");
    const conflicts = M.conflicts(state.events);
    if (conflicts.size) warnings.push("Hay reservas superpuestas en una misma sala. Revisalas en la planilla.");
    $("warnings").textContent = warnings.join(" "); $("warnings").hidden = !warnings.length;
    $("sync-time").textContent = demo && !live ? "Datos de ejemplo" : "Actualizada " + new Intl.DateTimeFormat("es-UY", {timeZone:config.timeZone || "America/Montevideo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
    render();
  }
  function load() {
    if (state.loading) return;
    state.loading = true; $("refresh").disabled = true; $("calendar").setAttribute("aria-busy","true");
    $("sync-time").textContent = "Cargando…";
    let finished = false;
    const timeout = setTimeout(() => fail(), 20000);
    const finish = () => { finished=true; clearTimeout(timeout); state.loading = false; $("refresh").disabled = false; $("calendar").setAttribute("aria-busy","false"); };
    const fail = () => {
      if (finished) return;
      finish(); $("error").textContent = "No se pudo actualizar la agenda. Revisá tu acceso y probá Actualizar."; $("error").hidden = false;
      $("sync-time").textContent = state.loaded ? "Sin actualizar · datos anteriores" : "Sin conexión";
      if (!state.loaded) $("calendar").innerHTML = '<div class="empty"><strong>No pudimos leer las reservas</strong>El acceso debe estar habilitado para tu cuenta de Google.</div>';
    };
    if (live) {
      google.script.run.withSuccessHandler(data => { if(finished)return; try { applyData(data); finish(); } catch (_) { fail(); } }).withFailureHandler(fail).getCalendarData();
    } else { try { applyData(fixtures()); finish(); } catch (_) { fail(); } }
  }
  function renderSummary() {
    const monday = M.monday(state.date), end = M.addDays(monday,6);
    const active = filtered().filter(e => e.status !== "cancelada");
    const week = inRange(active, monday, end);
    const minutes = Array.from({length:7},(_,i) => M.segments(active,M.addDays(monday,i)).reduce((sum,e) => sum + e.end - e.start,0)).reduce((a,b) => a+b,0);
    $("count").textContent = week.length;
    $("hours").textContent = new Intl.NumberFormat("es-UY",{maximumFractionDigits:1}).format(minutes/60) + " h";
    $("rooms-count").textContent = new Set(week.map(e => e.room)).size;
    const today = M.today(config.timeZone);
    const clock = new Intl.DateTimeFormat("en-GB",{timeZone:config.timeZone || "America/Montevideo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
    const next = active.find(e => e.date > today || (e.date === today && e.start >= M.parseTime(clock)));
    $("next-booking").textContent = next ? M.label(next.date,{weekday:"short",day:"numeric"}) + " · " + M.timeText(next.start) : "Sin próximos turnos";
  }
  function render() {
    if (!state.loaded) return;
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed",String(b.dataset.view === state.view)));
    const [start,end] = dateRange(), events = filtered(), period = inRange(events,start,end);
    $("period-title").textContent = state.view === "month" ? M.label(start,{month:"long",year:"numeric"}) : M.label(start,{day:"numeric",month:"short"}) + " — " + M.label(end,{day:"numeric",month:"short",year:"numeric"});
    $("result-count").textContent = period.length + (period.length === 1 ? " reserva en este período" : " reservas en este período");
    renderSummary();
    if (state.view === "week") renderWeek(events,start);
    else if (state.view === "month") renderMonth(events,start);
    else renderList(period,start,end);
  }
  function renderWeek(events,start) {
    const days = Array.from({length:7},(_,i) => M.addDays(start,i));
    const pieces = days.flatMap(day => M.segments(events,day));
    const from = pieces.length ? Math.max(0, Math.floor(Math.min(...pieces.map(p => p.start))/60)-1) : 16;
    const to = pieces.length ? Math.min(24, Math.max(from+4,Math.ceil(Math.max(...pieces.map(p => p.end))/60))) : 24;
    const height = (to-from)*64, conflicts = M.conflicts(state.events), today = M.today(config.timeZone);
    const headers = '<div class="hour-heading"></div>' + days.map(day => '<div class="day-heading '+(day===today?'is-today':'')+'"><span>'+esc(M.label(day,{weekday:"short"}))+'</span><strong>'+Number(day.slice(-2))+'</strong></div>').join("");
    const ticks = Array.from({length:to-from},(_,i) => '<span class="hour-mark" style="top:'+(i*64)+'px">'+String(from+i).padStart(2,"0")+':00</span>').join("");
    const columns = days.map(day => '<div class="day-column '+(day===today?'is-today':'')+'" style="height:'+height+'px">' + M.layout(events,day).map(p => {
      const e=p.event, css=roomClass(e.room)+(e.status==='pendiente'?' pending':'')+(e.status==='cancelada'?' cancelled':'')+(conflicts.has(e.id)?' conflict':'');
      return '<button class="event '+css+'" type="button" data-event="'+esc(e.id)+'" aria-label="'+esc(e.band+', Sala '+e.room+', '+rangeText(e))+'" style="top:'+((p.start-from*60)/60*64+2)+'px;height:'+Math.max(25,(p.end-p.start)/60*64-4)+'px;left:calc('+p.lane*100/p.lanes+'% + 3px);width:calc('+100/p.lanes+'% - 6px)"><strong>'+esc(e.band)+'</strong><span>'+esc(M.timeText(p.start)+'–'+M.timeText(p.end))+'</span><span>Sala '+esc(e.room)+(e.status==='pendiente'?' · Pendiente':'')+'</span></button>';
    }).join("")+'</div>').join("");
    $("calendar").innerHTML = (pieces.length?'':'<div class="empty compact"><strong>Sin reservas con estos filtros</strong>Podés cambiar la semana, sala o banda.</div>') + '<div class="calendar-scroll"><div class="week-grid">'+headers+'<div class="time-column" style="height:'+height+'px">'+ticks+'</div>'+columns+'</div></div>';
  }
  function renderMonth(events,start) {
    const first = M.monday(start), next = nextMonth(start,1), last = M.addDays(next,-1), count = Math.ceil(((Date.parse(last)-Date.parse(first))/86400000+1)/7)*7;
    const labels = Array.from({length:7},(_,i) => '<div class="month-weekday">'+esc(M.label(M.addDays(first,i),{weekday:"short"}))+'</div>').join("");
    const today=M.today(config.timeZone);
    const days=Array.from({length:count},(_,i) => {
      const day=M.addDays(first,i), slots=M.segments(events,day);
      return '<button class="month-day '+(day.slice(0,7)!==start.slice(0,7)?'outside ':'')+(day===today?'today':'')+'" data-day="'+day+'" aria-label="'+esc(M.label(day,{day:"numeric",month:"long"})+', '+slots.length+' reservas')+'"><strong>'+Number(day.slice(-2))+'</strong>'+slots.slice(0,2).map(p => '<span>'+esc(M.timeText(p.start)+' '+p.event.band)+'</span>').join("")+(slots.length>2?'<small>+'+(slots.length-2)+' más</small>':'')+'</button>';
    }).join("");
    $("calendar").innerHTML='<div class="month-grid">'+labels+days+'</div>';
  }
  function renderList(events,start,end) {
    if (!events.length) { $("calendar").innerHTML='<div class="empty"><strong>Sin reservas con estos filtros</strong>Podés cambiar el período, sala o banda.</div>'; return; }
    let last="";
    $("calendar").innerHTML='<div class="agenda-list">'+events.map(e => {
      const day = e.date<start?start:e.date;
      const heading=last!==day?'<div class="agenda-day">'+esc(M.label(day,{weekday:"long",day:"numeric",month:"long"}))+'</div>':''; last=day;
      return heading+'<button type="button" class="agenda-row" data-event="'+esc(e.id)+'"><span>'+esc(rangeText(e))+'</span><span class="band">'+esc(e.band)+'</span><span class="room">Sala '+esc(e.room)+'</span><span class="tag '+e.status+'">'+states[e.status]+'</span></button>';
    }).join("")+'</div>';
  }
  function openEvent(id) {
    const e=state.events.find(event => event.id===id); if(!e) return;
    $("booking-title").textContent=e.band;
    const rows=[["Fecha",M.label(e.date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})],["Horario",rangeText(e)],["Sala",e.room],["Estado",states[e.status]]];
    if(e.notes) rows.push(["Notas",e.notes]);
    if(e.inferredEnd) rows.push(["Duración","Hasta no está indicado. Se calculan turnos de "+(config.slotMinutes||60)+" minutos; completá Hasta en la planilla para otra duración."]);
    if(live) rows.push(["Filas de origen",e.rows.join(", ")]);
    $("booking-detail").innerHTML=rows.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join("");
    $("booking-row").hidden=!state.sheetUrl;
    if(state.sheetUrl) $("booking-row").href=state.sheetUrl.split("#")[0]+"#gid="+state.sheetId+"&range=A"+Math.min(...e.rows)+":E"+Math.max(...e.rows);
    $("booking-dialog").showModal();
  }
  if (!live && !demo) {
    const url=safeUrl(config.adminUrl);
    if(url && new URL(url).hostname==="script.google.com") { window.location.replace(url); return; }
    $("access").hidden=false;
    $("setup-message").hidden=false;
    return;
  }
  $("dashboard").hidden=false; $("demo-banner").hidden=live;
  if(/^#[\da-f]{6}$/i.test(config.primary||"")) document.documentElement.style.setProperty("--primary",config.primary);
  $("brand-name").textContent=String(config.name||"El Desafinado").toUpperCase();
  const site=safeUrl(config.siteUrl);
  if(site) ["public-link","public-link-mobile","brand-link"].forEach(id=>{ $(id).href=site; $(id).target="_top"; });
  $("refresh").addEventListener("click",load);
  ["previous","next"].forEach(id=>$(id).addEventListener("click",()=>{const n=id==="next"?1:-1;state.date=state.view==="month"?nextMonth(state.date,n):M.addDays(state.date,n*7);render();}));
  $("today").addEventListener("click",()=>{state.date=M.today(config.timeZone);render();});
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render();}));
  $("room-filter").addEventListener("change",e=>{state.room=e.target.value;render();});
  $("status-filter").addEventListener("change",e=>{state.status=e.target.value;render();});
  $("search").addEventListener("input",e=>{state.search=M.normalize(e.target.value);render();});
  $("calendar").addEventListener("click",e=>{const event=e.target.closest("[data-event]"),day=e.target.closest("[data-day]");if(event)openEvent(event.dataset.event);if(day){state.date=day.dataset.day;state.view="list";render();}});
  $("close-dialog").addEventListener("click",()=>$("booking-dialog").close());
  load();
  if(live) setInterval(()=>{if(!document.hidden)load();},60000);
})();
