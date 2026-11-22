const API_URL = window.SALA_CONFIG.publicApiUrl;
const WHATSAPP_NUMBER = window.SALA_CONFIG.whatsapp;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

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
  return AgendaModel.today(window.SALA_CONFIG.timeZone);
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
  initParallax();
  cargarDisponibilidad();
  window.setInterval(() => { if (!document.hidden) cargarDisponibilidad(); }, 120000);
});

function initParallax() {
  const sections = document.querySelectorAll(".parallax-section");

  if (!sections.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  if (isTouchDevice) return;

  let ticking = false;

  const updateParallax = () => {
    const scrollY = window.scrollY;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const offset = (scrollY - sectionTop) * 0.25;
      section.style.backgroundPosition = `center calc(50% + ${offset}px)`;
    });

    ticking = false;
  };

  const requestParallaxUpdate = () => {
    if (!ticking) {
      window.requestAnimationFrame(updateParallax);
      ticking = true;
    }
  };

  updateParallax();
  window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
  window.addEventListener("resize", updateParallax);
}

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
    toggle.setAttribute("aria-expanded", String(navbar.classList.contains("nav-open")));
  });

  links.forEach((link) => {
    link.addEventListener("click", () => {
      if (navbar.classList.contains("nav-open")) {
        navbar.classList.remove("nav-open");
        toggle.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
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
    const res = await fetch(API_URL, {cache:"no-store", signal:AbortSignal.timeout(20000)});
    if (!res.ok) throw new Error("Error HTTP " + res.status);
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

    if (errorContainer) errorContainer.style.display = "none";
    renderDias();
  } catch (err) {
    console.error("ERROR CARGA:", err);
    disponibilidad = [];
    if (calendarContainer) calendarContainer.innerHTML = "";
    if (scheduleContainer) scheduleContainer.innerHTML = "";
    mostrarError("No se pudo actualizar la disponibilidad. Consultá los horarios por WhatsApp o recargá la página.");
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
    calendarContainer.innerHTML = "<p>No hay turnos cargados. Consultá la disponibilidad por WhatsApp.</p>";
    if (scheduleContainer) scheduleContainer.innerHTML = "";
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
      const weekday = dateObj.toLocaleDateString("es-UY", { weekday: "short" });
      const dayNum = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("es-UY", { month: "short" });
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
function buildWhatsAppLink(dia, horario, sala) {
  const text = `Hola, quiero consultar una reserva el ${formatDateDisplay(dia)} a las ${horario} en la sala ${sala}.`;
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
      const libre = item.disponible === true || String(item.disponible).toLowerCase() === "true";
      const disponibleButton = libre
        ? `<a class="reserve-button" href="${escapeHtml(buildWhatsAppLink(selectedDay, horarioFormateado, item.sala))}" target="_blank" rel="noopener">Consultar</a>`
        : `<div class="slot-status occupied">Ocupada</div>`;

      return `
    <div class="schedule-slot">
      <div class="slot-info">
        <div class="slot-time">${escapeHtml(horarioFormateado)}</div>
        <div class="occupied-label">Sala ${escapeHtml(item.sala)}</div>
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
  const canonical = AgendaModel.parseDate(fecha);
  if (canonical) return canonical;
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
  const minutes = AgendaModel.parseTime(hora);
  if (minutes !== null) return AgendaModel.timeText(minutes);
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
