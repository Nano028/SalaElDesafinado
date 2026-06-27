const API_URL =
  "https://script.google.com/macros/s/AKfycbxTSj74nVu76qFYJl8Vr4_-XWtmlwWRDfXQhZl3_o1tuWdXpfiCbLeQkUjZi6MijgCVXg/exec";

const WHATSAPP_NUMBER = "59800000000";

let disponibilidad = [];
let selectedDay = null;
let calendarContainer = null;
let scheduleContainer = null;
let errorContainer = null;

function buildLocalDateFromYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateDisplay(ymd) {
  const date = buildLocalDateFromYMD(ymd);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function getTodayYMD() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  calendarContainer = document.getElementById("calendar-days");
  scheduleContainer = document.getElementById("schedule");
  errorContainer = document.getElementById("error");
  attachFaqToggle();
  attachNavToggle();
  cargarDisponibilidad();
});

/* =========================
   NAV TOGGLE
========================= */
function attachNavToggle() {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelectorAll(".nav-links a");

  if (!toggle || !navbar) return;

  toggle.addEventListener("click", () => {
    navbar.classList.toggle("nav-open");
    toggle.classList.toggle("open");
  });

  links.forEach((link) => {
    link.addEventListener("click", () => {
      if (navbar.classList.contains("nav-open")) {
        navbar.classList.remove("nav-open");
        toggle.classList.remove("open");
      }
    });
  });
}

/* =========================
   FAQ TOGGLE
========================= */
function attachFaqToggle() {
  const faqButtons = Array.from(document.querySelectorAll(".faq-question"));

  if (!faqButtons.length) return;

  faqButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      if (!item) return;
      item.classList.toggle("active");
    });
  });
}

/* =========================
   FETCH
========================= */
function parseDateValue(value) {
  if (!value) return new Date(NaN);

  if (typeof value === "string") {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      const [dd, mm, yyyy] = value.split("/");
      return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
    }

    return new Date(value);
  }

  return new Date(value);
}

async function cargarDisponibilidad() {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();

    if (json && typeof json.success === "boolean" && !json.success) {
      throw new Error(json.error || "API returned failure");
    }

    const data = Array.isArray(json.data) ? json.data : json;

    if (!Array.isArray(data)) {
      throw new Error("API sin data");
    }

    disponibilidad = data.filter((item) => {
      if (!item || !item.fecha) return false;
      if (item.fecha === "fecha") return false;

      const d = parseDateValue(item.fecha);
      return !isNaN(d.getTime());
    });

    renderDias();
  } catch (err) {
    console.error("ERROR CARGA:", err);
    mostrarError("No se pudo cargar la disponibilidad");
  }
}

/* =========================
   RENDER DÍAS
========================= */
function renderDias() {
  if (!calendarContainer) {
    console.error("No existe #calendar-days en HTML");
    return;
  }

  if (!disponibilidad.length) {
    contenedor.innerHTML = "<p>No hay datos disponibles</p>";
    return;
  }

  const todayYMD = getTodayYMD();
  const startDate = buildLocalDateFromYMD(todayYMD);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 13);

  const diasUnicos = [...new Set(disponibilidad.map((d) => formatDate(d.fecha)).filter(Boolean))]
    .map((dia) => ({ dia, date: buildLocalDateFromYMD(dia) }))
    .filter(({ date }) => date >= startDate && date <= endDate)
    .sort((a, b) => a.date - b.date)
    .map(({ dia }) => dia);

  if (!diasUnicos.length) {
    calendarContainer.innerHTML = "<p>No hay días disponibles en los próximos 14 días</p>";
    if (scheduleContainer) scheduleContainer.innerHTML = "";
    return;
  }

  if (!selectedDay || !diasUnicos.includes(selectedDay)) {
    selectedDay = diasUnicos[0];
  }

  calendarContainer.innerHTML = diasUnicos
    .map((dia) => {
      const dateObj = buildLocalDateFromYMD(dia);
      const weekday = dateObj.toLocaleDateString(undefined, { weekday: "short" });
      const dayNum = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString(undefined, { month: "short" });
      const activeClass = dia === selectedDay ? " active" : "";

      return `
      <button class="calendar-day${activeClass}" onclick="seleccionarDia('${dia}')">
        <div class="calendar-weekday">${weekday}</div>
        <div class="calendar-number">${dayNum}</div>
        <div class="calendar-month">${month}</div>
      </button>
    `;
    })
    .join("");

  renderDetalle(disponibilidad.filter((item) => formatDate(item.fecha) === selectedDay));
}

/* =========================
   CLICK DÍA
========================= */
function seleccionarDia(fecha) {
  selectedDay = fecha;
  renderDias();
}

/* =========================
   RENDER DETALLE
========================= */
function buildWhatsAppLink(dia, horario) {
  const text = `quiero reservar el día ${formatDateDisplay(dia)} en la hora ${horario}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function renderDetalle(items) {
  if (!scheduleContainer) {
    console.error("No existe #schedule");
    return;
  }

  if (!items.length) {
    scheduleContainer.innerHTML = "<p>Sin horarios</p>";
    return;
  }

  scheduleContainer.innerHTML = items
    .map((item) => {
      const horarioFormateado = formatHora(item.horario);
      const disponibleButton = item.disponible
        ? `<a class="reserve-button" href="${buildWhatsAppLink(selectedDay, horarioFormateado)}" target="_blank" rel="noopener">Agendar</a>`
        : `<div class="slot-status occupied">Ocupada</div>`;

      return `
    <div class="schedule-slot">
      <div class="slot-info">
        <div class="slot-time">${horarioFormateado}</div>
        <div class="occupied-label">Sala ${item.sala}</div>
      </div>
      ${disponibleButton}
    </div>
  `;
    })
    .join("");
}

/* =========================
   FORMATO FECHA SEGURO
========================= */
function formatDate(fecha) {
  const d = parseDateValue(fecha);
  if (isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

/* =========================
   FORMATO HORA SEGURO
========================= */
function formatHora(hora) {
  if (typeof hora === "string") {
    if (/^\d{1,2}:\d{2}$/.test(hora)) {
      return hora;
    }

    const d = new Date(hora);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  const d = parseDateValue(hora);
  if (isNaN(d.getTime())) return "--:--";

  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* =========================
   ERROR UI
========================= */
function mostrarError(msg) {
  const el = document.getElementById("error");

  if (el) {
    el.innerText = msg;
    el.style.display = "block";
  } else {
    alert(msg);
  }
}
