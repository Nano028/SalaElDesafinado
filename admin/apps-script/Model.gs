(function (root) {
  "use strict";
  const DAY = 86400000;
  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  function parseDate(value) {
    const input = String(value ?? "").trim();
    let match = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    let parts;
    if (match) parts = [Number(match[1]), Number(match[2]), Number(match[3])];
    else {
      match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      parts = [Number(match[3]), Number(match[2]), Number(match[1])];
    }
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() + 1 !== parts[1] || date.getUTCDate() !== parts[2]) return null;
    return date.toISOString().slice(0, 10);
  }
  function parseTime(value) {
    const input = normalize(value).replace(/[.\s]/g, "");
    const match = input.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(am|pm)?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59) return null;
    if (match[3]) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (match[3] === "pm" ? 12 : 0);
    }
    if (hour > 23) return null;
    return hour * 60 + minute;
  }
  function timeText(minutes) {
    const n = ((minutes % 1440) + 1440) % 1440;
    return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  }
  function addDays(ymd, amount) {
    return new Date(Date.parse(ymd + "T00:00:00Z") + amount * DAY).toISOString().slice(0, 10);
  }
  function monday(ymd) {
    const weekday = new Date(ymd + "T00:00:00Z").getUTCDay();
    return addDays(ymd, -(weekday + 6) % 7);
  }
  function today(timeZone = "America/Montevideo") {
    const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }
  function label(ymd, options) {
    return new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", ...options }).format(new Date(ymd + "T12:00:00Z"));
  }
  function status(value) {
    const text = normalize(value);
    if (text.startsWith("cancel")) return "cancelada";
    if (text.includes("pendiente")) return "pendiente";
    return "reservada";
  }
  function parseRows(rows, options = {}) {
    const slotMinutes = Number(options.slotMinutes || 60);
    if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 720) throw new Error("Duración de turno inválida.");
    if (!Array.isArray(rows) || !rows.length) throw new Error("La planilla no tiene encabezados.");
    const headers = rows[0].map(normalize);
    const column = (...names) => headers.findIndex(h => names.includes(h));
    const cols = { date: column("fecha", "dia"), start: column("horario", "inicio", "hora inicio"), end: column("hasta", "fin", "hora fin"), room: column("sala"), band: column("banda", "cliente"), state: column("estado"), notes: column("notas", "observaciones") };
    for (const key of ["date", "start", "room", "band"]) if (cols[key] < 0) throw new Error("Falta una columna requerida: " + ({date:"Fecha",start:"Horario",room:"Sala",band:"Banda"})[key]);
    const events = [], warnings = [];
    rows.slice(1).forEach((row, index) => {
      const band = String(row[cols.band] ?? "").trim();
      if (!band) return; // En este modelo una banda vacía representa un turno libre.
      const date = parseDate(row[cols.date]);
      const start = parseTime(row[cols.start]);
      const room = String(row[cols.room] ?? "").trim();
      const rowNumber = index + 2;
      if (!date || start === null || !room) { warnings.push({ row: rowNumber, message: "Revisá fecha, horario y sala." }); return; }
      const rawEnd = cols.end >= 0 ? String(row[cols.end] ?? "").trim() : "";
      let end = rawEnd ? parseTime(rawEnd) : start + slotMinutes;
      if (end === null) { warnings.push({ row: rowNumber, message: "El valor de Hasta no es un horario válido." }); return; }
      if (rawEnd && end <= start) end += 1440;
      if (end - start > 720) { warnings.push({ row: rowNumber, message: "La duración supera doce horas; revisá Hasta." }); return; }
      events.push({ id: "fila-" + rowNumber, date, start, end, room, band, status: status(cols.state >= 0 ? row[cols.state] : ""), notes: cols.notes >= 0 ? String(row[cols.notes] ?? "").trim() : "", rows: [rowNumber], inferredEnd: !rawEnd });
    });
    const groups = new Map();
    events.forEach(event => {
      const key = [event.date, normalize(event.room), normalize(event.band), event.status].join("\u0000");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    });
    const merged = [];
    groups.forEach(group => {
      group.sort((a,b) => a.start - b.start || a.end - b.end);
      let last;
      group.forEach(event => {
        if (last && event.start <= last.end) {
          if (event.end > last.end) { last.end = event.end; last.inferredEnd = event.inferredEnd; }
          else if (event.end === last.end) last.inferredEnd = last.inferredEnd && event.inferredEnd;
          last.rows.push(...event.rows);
          if (event.notes && !last.notes.includes(event.notes)) last.notes = [last.notes,event.notes].filter(Boolean).join(" · ");
        } else { last = { ...event, rows: [...event.rows] }; merged.push(last); }
      });
    });
    merged.sort((a,b) => a.date.localeCompare(b.date) || a.start - b.start || a.room.localeCompare(b.room));
    return { events: merged, warnings };
  }
  function segments(events, date) {
    const day = Date.parse(date + "T00:00:00Z");
    return events.flatMap(event => {
      const offset = (Date.parse(event.date + "T00:00:00Z") - day) / DAY * 1440;
      const start = Math.max(0, event.start + offset), end = Math.min(1440, event.end + offset);
      return end > start ? [{ event, start, end }] : [];
    });
  }
  function layout(events, date) {
    const list = segments(events, date).sort((a,b) => a.start - b.start || b.end - a.end);
    let group = [], lanes = [], until = -1;
    const finish = () => { group.forEach(item => { item.lanes = lanes.length; }); group = []; lanes = []; };
    list.forEach(item => {
      if (item.start >= until) { finish(); until = -1; }
      let lane = lanes.findIndex(end => end <= item.start);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = item.end;
      item.lane = lane; group.push(item); until = Math.max(until, item.end);
    });
    finish(); return list;
  }
  function conflicts(events) {
    const active = events.filter(e => e.status !== "cancelada"), ids = new Set();
    active.forEach((a,i) => active.slice(i+1).forEach(b => {
      if (normalize(a.room) !== normalize(b.room)) return;
      const delta = (Date.parse(b.date + "T00:00:00Z") - Date.parse(a.date + "T00:00:00Z")) / DAY * 1440;
      if (a.start < b.end + delta && a.end > b.start + delta) { ids.add(a.id); ids.add(b.id); }
    }));
    return ids;
  }
  const api = { normalize, parseDate, parseTime, timeText, addDays, monday, today, label, parseRows, segments, layout, conflicts };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AgendaModel = Object.freeze(api);
})(typeof window !== "undefined" ? window : globalThis);
