const apiUrl = window.SALA_CONFIG.publicApiUrl;
const whatsappNumber = window.SALA_CONFIG.whatsapp;

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

let availability = [];
let selectedDay = null;
let calendarContainer = null;
let scheduleContainer = null;
let errorContainer = null;

function buildLocalDateFromYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateDisplay(ymd) {
  const date = buildLocalDateFromYmd(ymd);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function getTodayYmd() {
  return AgendaModel.today(window.SALA_CONFIG.timeZone);
}

document.addEventListener("DOMContentLoaded", () => {
  calendarContainer = document.getElementById("calendar-days");
  scheduleContainer = document.getElementById("schedule");
  errorContainer = document.getElementById("error");

  attachFaqToggle();
  attachNavToggle();
  attachCalendarSelection();
  initParallax();
  loadAvailability();

  window.setInterval(() => {
    if (!document.hidden) loadAvailability();
  }, 120000);
});

function initParallax() {
  const sections = document.querySelectorAll(".parallax-section");

  if (!sections.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const isTouchDevice = window.matchMedia(
    "(hover: none), (pointer: coarse)",
  ).matches;
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

function attachNavToggle() {
  const navbar = document.querySelector(".navbar");
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelectorAll(".nav-links a");

  if (!toggle || !navbar) return;

  toggle.addEventListener("click", () => {
    navbar.classList.toggle("nav-open");
    toggle.classList.toggle("open");
    toggle.setAttribute(
      "aria-expanded",
      String(navbar.classList.contains("nav-open")),
    );
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

async function loadAvailability() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(apiUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Error HTTP " + response.status);

    const json = await response.json();

    if (json && typeof json.success === "boolean" && !json.success) {
      throw new Error(json.error || "API returned failure");
    }

    const data = Array.isArray(json.data) ? json.data : json;

    if (!Array.isArray(data)) {
      throw new Error("API sin data");
    }

    availability = data.filter((item) => {
      if (!item || !item.fecha) return false;
      if (item.fecha === "fecha") return false;

      const d = parseDateValue(item.fecha);
      return !isNaN(d.getTime());
    });

    if (errorContainer) errorContainer.style.display = "none";
    renderDays();
  } catch (err) {
    console.error("Error al cargar disponibilidad:", err);
    availability = [];
    if (calendarContainer) calendarContainer.innerHTML = "";
    if (scheduleContainer) scheduleContainer.innerHTML = "";
    showError(
      "No se pudo actualizar la disponibilidad. Consultá los horarios por WhatsApp o recargá la página.",
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function attachCalendarSelection() {
  if (!calendarContainer) return;

  calendarContainer.addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-day]");
    if (!dayButton) return;

    selectedDay = dayButton.dataset.day;
    renderDays();
  });
}

function renderDays() {
  if (!calendarContainer) {
    console.error("No existe #calendar-days en el documento.");
    return;
  }

  if (!availability.length) {
    calendarContainer.innerHTML =
      "<p>No hay turnos cargados. Consultá la disponibilidad por WhatsApp.</p>";
    if (scheduleContainer) scheduleContainer.innerHTML = "";
    return;
  }

  const todayYMD = getTodayYmd();
  const startDate = buildLocalDateFromYmd(todayYMD);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 13);

  const uniqueDays = [
    ...new Set(
      availability.map((item) => formatDate(item.fecha)).filter(Boolean),
    ),
  ]
    .map((day) => ({ day, date: buildLocalDateFromYmd(day) }))
    .filter(({ date }) => date >= startDate && date <= endDate)
    .sort((a, b) => a.date - b.date)
    .map(({ day }) => day);

  if (!uniqueDays.length) {
    calendarContainer.innerHTML =
      "<p>No hay días disponibles en los próximos 14 días</p>";
    if (scheduleContainer) scheduleContainer.innerHTML = "";
    return;
  }

  if (!selectedDay || !uniqueDays.includes(selectedDay)) {
    selectedDay = uniqueDays[0];
  }

  calendarContainer.innerHTML = uniqueDays
    .map((day) => {
      const dateObj = buildLocalDateFromYmd(day);
      const weekday = dateObj.toLocaleDateString("es-UY", { weekday: "short" });
      const dayNum = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("es-UY", { month: "short" });
      const activeClass = day === selectedDay ? " active" : "";

      return `
      <button class="calendar-day${activeClass}" type="button" data-day="${day}">
        <div class="calendar-weekday">${weekday}</div>
        <div class="calendar-number">${dayNum}</div>
        <div class="calendar-month">${month}</div>
      </button>
    `;
    })
    .join("");

  renderDetail(
    availability.filter((item) => formatDate(item.fecha) === selectedDay),
  );
}

function buildWhatsAppLink(day, time, room) {
  const text = `Hola, quiero consultar una reserva el ${formatDateDisplay(day)} a las ${time} en la sala ${room}.`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
}

function renderDetail(items) {
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
      const formattedTime = formatTime(item.horario);
      const isAvailable =
        item.disponible === true ||
        String(item.disponible).toLowerCase() === "true";
      const action = isAvailable
        ? `<a class="reserve-button" href="${escapeHtml(buildWhatsAppLink(selectedDay, formattedTime, item.sala))}" target="_blank" rel="noopener">Consultar</a>`
        : `<div class="slot-status occupied">Ocupada</div>`;

      return `
    <div class="schedule-slot">
      <div class="slot-info">
        <div class="slot-time">${escapeHtml(formattedTime)}</div>
        <div class="occupied-label">Sala ${escapeHtml(item.sala)}</div>
      </div>
      ${action}
    </div>
  `;
    })
    .join("");
}

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

function formatTime(hora) {
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

function showError(message) {
  const el = document.getElementById("error");

  if (el) {
    el.innerText = message;
    el.style.display = "block";
  } else {
    alert(message);
  }
}
