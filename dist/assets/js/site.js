/* SETTINGS: words, prices, hours and the form address. Edit src/data/*.json and rebuild. */
window.SETTINGS = {
  "facts": {
    "name": "Simply Risen Sourdough Company",
    "phone": {
      "display": "740-447-4280",
      "tel": "+17404474280"
    },
    "email": "simplyrisenkp@outlook.com",
    "site_url": "https://simply-risen.example",
    "social": {
      "facebook": "https://www.facebook.com/share/12KDfJ4ymtS/"
    }
  },
  "prices": {
    "_status": "No prices, sizes, allergens, fees or deposits are confirmed. Item names are product types from the Athens Farmers Market listing only. See CONFIRM.md. Set price to a number (dollars) when the baker confirms. price_note is the line shown for any item whose price is null; the page shows it without JS. When a price is set, rebuild: the static rows then need the price typed here too (JS shows the number).",
    "currency": "USD",
    "lead_time": "",
    "fees": [],
    "deposit": null,
    "cancel_terms": "",
    "loaves": [
      {
        "name": "Sourdough bread",
        "price": null,
        "weight": "",
        "allergens": [],
        "days": []
      },
      {
        "name": "Bagels",
        "price": null,
        "weight": "",
        "allergens": [],
        "days": []
      },
      {
        "name": "English muffins",
        "price": null,
        "weight": "",
        "allergens": [],
        "days": []
      },
      {
        "name": "Cookies",
        "price": null,
        "weight": "",
        "allergens": [],
        "days": []
      },
      {
        "name": "Muffins",
        "price": null,
        "weight": "",
        "allergens": [],
        "days": []
      }
    ],
    "price_note": "Price to come"
  },
  "flows": {
    "status": "not_connected",
    "form_endpoint": "",
    "checkout_tool": "",
    "pickup_days": [],
    "cutoff_time": "",
    "max_qty": 12,
    "notes_max": 300
  }
};
/* ---- scene.js ---- */
/* scene.js : hero scene "the turn-out" (DIRECTION.md section 4). Owner: motion-engineer.
   Hand-rolled from scroll-scene-craft's scene-starter: one progress value, one rAF loop, no library.
   Reads only window.SETTINGS (flows.pickup_days). Writes data-p (rendered progress, 3 decimals) for QA.
   Frame 0 is armed in motion.css before this runs; data-live hands control to the inline styles here,
   data-rest (reduced motion, short screens) shows the finished frame. No days posted: the rule keeps
   copy.pickup.days_pending set into it (see .m-days__pending).

   0    to 0.3   the Cane basket, seen from above, twists a little as the view pulls back
   0.3  to 0.6   the basket lifts past the camera and fades; flour rings draw on the loaf from the centre out
   0.6  to 0.86  the wordmark, carried up with the basket, settles onto the loaf (one small overshoot)
   0.84 to 1     the strand's outer end runs off the dome and lies flat as the pickup-day rule;
                 one mark per pickup day, the next open day filled Cane with its order-by time
   Never more than three things move at once. Transform, opacity and stroke-dashoffset only. */
(() => {
  const scene = document.querySelector(".m-hero");
  if (!scene) return;

  const SET = {
    tau: 90,                       // smoothing, ms (frame-rate independent)
    cam: [0, 0.3], camFrom: 1.06,  // gentle pull-back while the basket shows
    twist: [0, 0.6], twistDeg: [-10, 6],
    lift: [0.3, 0.6], liftScale: 2.3,
    fade: [0.34, 0.5],             // basket opacity
    ink: [0.36, 0.48],             // Char wordmark on the basket gives way to flour
    rings: [0.32, 0.78],
    settle: [0.6, 0.8], stagger: 0.06, wordLift: 0.14, wordScale: 0.05,
    tail: [0.84, 0.92], line: [0.9, 0.97], marks: [0.92, 0.97], markStagger: 0.012, note: [0.93, 1],
    ringPx: 2.25,                  // on-screen stroke width of the flour rings
  };

  const $ = (s) => scene.querySelector(s);
  const svg = $(".m-hero__svg"), cam = $(".m-hero__cam"), basket = $(".m-hero__basket");
  const rings = $(".m-hero__rings"), ghost = $(".m-hero__ghost"), tail = $(".m-hero__tail");
  const word = $(".m-word"), days = $(".m-days"), line = $(".m-days__line"), list = $(".m-days__list"), note = $(".m-days__note");
  const calm = matchMedia("(prefers-reduced-motion: reduce), (max-height: 34rem)");

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const span = (p, [a, b]) => clamp((p - a) / (b - a));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);   // small overshoot, display type only

  /* ---------- pickup days: "first day whose cut-off is still ahead of now" ----------
     Reads SETTINGS.flows.pickup_days[] = { day, cutoff?, place?, window? }
       day:    weekday name ("Saturday", "Sat") or a date "2026-11-14"
       cutoff: "Thursday 18:00" / "Thu 6 PM" (latest such weekday on or before pickup),
               "18:00" (the day before pickup), an ISO date-time, { day, time } or { days_before, time },
               or a number of hours before the pickup day starts.
     Falls back to SETTINGS.flows.cutoff_time / cutoff. No cut-off: open until the pickup day begins.
     The same rule runs in flows.js (flows-engineer) so the hero and the order form never disagree. */
  const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekday = (s) => WD.indexOf(String(s).trim().slice(0, 3).toLowerCase());
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function clock(s) {
    const m = String(s).match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i);
    if (!m) return null;
    let h = +m[1];
    if (m[3]) h = (h % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
    return h > 23 ? null : [h, +(m[2] || 0)];
  }
  const atTime = (d, hm) => { const x = midnight(d); x.setHours(hm[0], hm[1]); return x; };
  function dateOf(day, from) {
    if (ISO_DAY.test(day)) { const [y, mo, da] = day.split("-").map(Number); return new Date(y, mo - 1, da); }
    const w = weekday(day);
    if (w < 0) return null;
    return addDays(midnight(from), (w - from.getDay() + 7) % 7);
  }
  function cutoffOf(c, pickup) {
    if (c == null || c === "") return { at: pickup, shown: false };
    if (typeof c === "number") return { at: new Date(pickup.getTime() - c * 3600e3), shown: true };
    if (typeof c === "object") {
      const hm = clock(c.time || "0:00");
      if (!hm) return null;
      if (c.day != null) return cutoffOf(`${c.day} ${c.time || "0:00"}`, pickup);
      return { at: atTime(addDays(pickup, -(+c.days_before || 0)), hm), shown: true };
    }
    const s = String(c).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : { at: d, shown: true }; }
    const hm = clock(s);
    if (!hm) return null;
    const w = weekday(s);
    if (/^[a-z]/i.test(s) && w >= 0) return { at: atTime(addDays(pickup, -((pickup.getDay() - w + 7) % 7)), hm), shown: true };
    return { at: atTime(addDays(pickup, -1), hm), shown: true };
  }
  function pickupWeek(now = new Date()) {
    const flows = (window.SETTINGS && window.SETTINGS.flows) || {};
    const list = Array.isArray(flows.pickup_days) ? flows.pickup_days : [];
    const out = [];
    for (const entry of list) {
      const day = typeof entry === "string" ? entry : entry && entry.day;
      if (!day) continue;
      const fallback = flows.cutoff_time != null ? flows.cutoff_time : flows.cutoff;
      const raw = typeof entry === "object" && entry.cutoff != null ? entry.cutoff : fallback;
      for (const week of ISO_DAY.test(day) ? [0] : [0, 7]) {
        const base = dateOf(day, addDays(now, week));
        if (!base || base < midnight(now)) continue;
        const cut = cutoffOf(raw, base);
        if (!cut) continue;
        out.push({ date: base, cutoff: cut.at, showCutoff: cut.shown, open: cut.at > now });
      }
    }
    out.sort((a, b) => a.date - b.date);
    const next = out.find((d) => d.open) || null;
    const horizon = addDays(midnight(now), 7);
    const shown = out.filter((d) => d.date < horizon || d === next).slice(0, 7);
    return { shown, next };
  }

  const fmt = (d, o) => new Intl.DateTimeFormat("en-US", o).format(d);
  const timeOf = (d) => fmt(d, { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  function buildDays() {
    const { shown, next } = pickupWeek();
    if (!next) return;   // keep the pending line from copy.pickup.days_pending
    const L = days.dataset;
    list.textContent = "";
    for (const d of shown) {
      const li = document.createElement("li");
      li.className = "m-days__item" + (d === next ? " m-days__item--next" : d.open ? "" : " m-days__item--closed");
      const mark = document.createElement("span");
      mark.className = "m-days__mark";
      mark.setAttribute("aria-hidden", "true");
      const label = document.createElement("time");
      label.dateTime = d.date.toISOString().slice(0, 10);
      label.textContent = `${fmt(d.date, { weekday: "short" })} ${d.date.getDate()}`;
      li.append(mark, label);
      if (!d.open && L.closedLabel) {
        const st = document.createElement("span");
        st.className = "m-days__state";
        st.textContent = L.closedLabel;
        li.append(st);
      }
      list.append(li);
    }
    list.hidden = false;
    const when = fmt(next.date, { weekday: "long", month: "short", day: "numeric" });
    note.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = `${L.nextLabel}: ${when}.`;
    note.append(strong);
    if (next.showCutoff && L.orderByLabel) {
      const same = midnight(next.cutoff).getTime() === next.date.getTime();
      note.append(` ${L.orderByLabel} ${same ? "" : fmt(next.cutoff, { weekday: "long" }) + ", "}${timeOf(next.cutoff)}.`);
    }
  }

  /* ---------- wordmark: words as inline-blocks so each line can settle on its own ---------- */
  const words = [];
  (function splitWords() {
    const parts = word.textContent.trim().split(/\s+/);
    word.textContent = "";
    parts.forEach((w, i) => {
      const s = document.createElement("span");
      s.className = "m-word__w";
      s.textContent = w;
      word.append(s);
      if (i < parts.length - 1) word.append(" ");
      words.push(s);
    });
  })();
  const items = () => [...list.querySelectorAll(".m-days__item")];
  let marks = [];

  function layout() {
    const px = svg.getBoundingClientRect().width / 1000 || 1;   // px per scene unit
    const w = String(SET.ringPx / px);
    rings.style.strokeWidth = w; tail.style.strokeWidth = w; ghost.style.strokeWidth = String((SET.ringPx * 0.7) / px);
  }

  const C = "translate(500 470) ", U = " translate(-500 -470)";
  function render(p) {
    const s = lerp(SET.camFrom, 1, easeOut(span(p, SET.cam)));
    cam.setAttribute("transform", s === 1 ? "" : `${C}scale(${s.toFixed(4)})${U}`);

    const lift = easeInOut(span(p, SET.lift)), bo = 1 - easeInOut(span(p, SET.fade));
    const tw = lerp(SET.twistDeg[0], SET.twistDeg[1], easeInOut(span(p, SET.twist)));
    basket.style.opacity = bo.toFixed(3);
    basket.style.visibility = bo < 0.002 ? "hidden" : "visible";
    basket.setAttribute("transform", `${C}rotate(${tw.toFixed(2)}) scale(${(1 + (SET.liftScale - 1) * lift).toFixed(4)})${U}`);
    word.style.setProperty("--m-ink", (1 - easeInOut(span(p, SET.ink))).toFixed(3));

    const r = easeInOut(span(p, SET.rings));
    rings.style.strokeDashoffset = (1 - r).toFixed(4);
    rings.style.opacity = r > 0 ? "1" : "0";

    // Wordmark: lifted with the basket, then each line lands with a stagger and one small overshoot.
    const e = words.map((_, i) => { const t = span(p, [SET.settle[0] + i * SET.stagger, SET.settle[1] + i * SET.stagger]); return [easeBack(t), t]; });
    const up = lift * (1 - e[0][0]);
    word.style.transform = Math.abs(up) < 1e-4 ? "" : `translateY(${(-SET.wordLift * up).toFixed(4)}em) scale(${(1 + SET.wordScale * up).toFixed(4)})`;
    words.forEach((el, i) => {
      const rel = i === 0 ? 0 : lift * (e[0][0] - e[i][0]), rot = Math.sin(Math.PI * e[i][1]) * (i % 2 ? 2.5 : -2.5);
      el.style.transform = Math.abs(rel) < 1e-4 && Math.abs(rot) < 0.01 ? "" : `translateY(${(-SET.wordLift * rel).toFixed(4)}em) rotate(${rot.toFixed(2)}deg)`;
    });

    const t = easeInOut(span(p, SET.tail));
    tail.style.strokeDashoffset = (1 - t).toFixed(4);
    tail.style.opacity = t > 0 ? "1" : "0";
    const l = easeInOut(span(p, SET.line));
    line.style.transform = l >= 1 ? "none" : `scaleX(${l.toFixed(4)})`;   // "none", not "": the armed CSS holds scaleX(0)
    marks.forEach((el, i) => {
      const m = easeOut(span(p, [SET.marks[0] + i * SET.markStagger, SET.marks[1] + i * SET.markStagger]));
      el.style.opacity = m.toFixed(3);
      el.style.transform = m >= 1 ? "" : `translateY(${((1 - m) * 0.4).toFixed(3)}rem)`;
    });
    note.style.opacity = easeOut(span(p, SET.note)).toFixed(3);
    scene.dataset.p = p.toFixed(3);
  }

  // Same formula as hero_frames.py: (scrollY - sectionTop) / (sectionHeight - innerHeight).
  const progress = () => clamp(-scene.getBoundingClientRect().top / Math.max(1, scene.offsetHeight - innerHeight));
  let cur = 0, last = 0, drawn = -1, running = false, visible = true;
  function tick(now) {
    if (!visible) { running = false; return; }
    const target = progress(), k = 1 - Math.exp(-(now - last) / SET.tau);
    last = now;
    cur = Math.abs(target - cur) < 0.0005 ? target : cur + (target - cur) * k;
    if (cur !== drawn) { render(cur); drawn = cur; }
    requestAnimationFrame(tick);
  }
  function run() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } }

  function rest() {   // the final composition: clear everything JS set, CSS default is the finished frame
    for (const el of [basket, rings, tail, line, note, word, ...words, ...marks]) el.removeAttribute("style");
    cam.removeAttribute("transform"); basket.removeAttribute("transform");
    scene.dataset.p = "1"; scene.dataset.rest = "true";
  }

  function start() {
    buildDays();
    marks = items();
    scene.dataset.live = "1";
    if (calm.matches) { rest(); layout(); addEventListener("resize", layout, { passive: true }); return; }
    layout();
    cur = progress(); render(cur); drawn = cur;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) run(); }).observe(scene);
    addEventListener("resize", () => { layout(); drawn = -1; }, { passive: true });
    run();
  }
  calm.addEventListener("change", () => location.reload());
  start();
})();

/* ---- flows.js ---- */
/* flows.js: the order form (items, pickup day, name, phone, email).
   Reads window.SETTINGS (flows, prices) and data-* attributes the build fills from copy.json.
   Day rule matches scene.js: the first day whose cut-off is still ahead of now is open. */
(() => {
  const root = document.querySelector("[data-f-order]");
  if (!root) return;
  const form = root.querySelector("[data-f-form]");
  const D = form.dataset;
  const S = window.SETTINGS || {};
  const flows = S.flows || {};
  const $ = (s, r = root) => r.querySelector(s);
  const maxQty = +D.maxQty || 12;
  const notesMax = +D.notesMax || 300;
  const baseTitle = document.title;

  /* ---------- pickup days (same rule as scene.js) ---------- */
  const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekday = (s) => WD.indexOf(String(s).trim().slice(0, 3).toLowerCase());
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function clock(s) {
    const m = String(s).match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i);
    if (!m) return null;
    let h = +m[1];
    if (m[3]) h = (h % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
    return h > 23 ? null : [h, +(m[2] || 0)];
  }
  const atTime = (d, hm) => { const x = midnight(d); x.setHours(hm[0], hm[1]); return x; };
  function dateOf(day, from) {
    if (ISO_DAY.test(day)) { const [y, mo, da] = day.split("-").map(Number); return new Date(y, mo - 1, da); }
    const w = weekday(day);
    return w < 0 ? null : addDays(midnight(from), (w - from.getDay() + 7) % 7);
  }
  function cutoffOf(c, pickup) {
    if (c == null || c === "") return { at: pickup, shown: false };
    if (typeof c === "number") return { at: new Date(pickup.getTime() - c * 3600e3), shown: true };
    if (typeof c === "object") {
      const hm = clock(c.time || "0:00");
      if (!hm) return null;
      if (c.day != null) return cutoffOf(`${c.day} ${c.time || "0:00"}`, pickup);
      return { at: atTime(addDays(pickup, -(+c.days_before || 0)), hm), shown: true };
    }
    const s = String(c).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : { at: d, shown: true }; }
    const hm = clock(s);
    if (!hm) return null;
    const w = weekday(s);
    if (/^[a-z]/i.test(s) && w >= 0) return { at: atTime(addDays(pickup, -((pickup.getDay() - w + 7) % 7)), hm), shown: true };
    return { at: atTime(addDays(pickup, -1), hm), shown: true };
  }
  function pickupWeek(now = new Date()) {
    const list = Array.isArray(flows.pickup_days) ? flows.pickup_days : [];
    const fallback = flows.cutoff_time ? flows.cutoff_time : flows.cutoff;
    const out = [];
    for (const entry of list) {
      const day = typeof entry === "string" ? entry : entry && entry.day;
      if (!day) continue;
      const raw = typeof entry === "object" && entry.cutoff != null ? entry.cutoff : fallback;
      for (const week of ISO_DAY.test(day) ? [0] : [0, 7]) {
        const base = dateOf(day, addDays(now, week));
        if (!base || base < midnight(now)) continue;
        const cut = cutoffOf(raw, base);
        if (!cut) continue;
        out.push({ date: base, cutoff: cut.at, showCutoff: cut.shown, open: cut.at > now,
          window: typeof entry === "object" ? entry.window : "", place: typeof entry === "object" ? entry.place : "" });
      }
    }
    out.sort((a, b) => a.date - b.date);
    const next = out.find((d) => d.open) || null;
    const horizon = addDays(midnight(now), 14);
    return out.filter((d) => d.date < horizon || d === next).slice(0, 8);
  }
  const fmt = (d, o) => new Intl.DateTimeFormat("en-US", o).format(d);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const longDay = (d) => fmt(d, { weekday: "long", month: "short", day: "numeric" });

  /* ---------- items ---------- */
  const loaves = (S.prices && Array.isArray(S.prices.loaves) ? S.prices.loaves : []).filter((l) => l && l.name);
  const priceOf = (l) => { const n = parseFloat(String(l.price == null ? "" : l.price).replace(/[^0-9.]/g, "")); return isFinite(n) && l.price !== "" && l.price != null ? n : null; };
  const money = (n) => "$" + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0);
  const itemsBox = $("[data-f-items]");
  const itemInputs = [];
  if (loaves.length) {
    loaves.forEach((l, i) => {
      const row = document.createElement("div");
      row.className = "f-item";
      const lab = document.createElement("label");
      lab.htmlFor = `f-qty-${i}`;
      lab.className = "f-item__name";
      lab.textContent = l.name;
      const p = priceOf(l);
      if (p !== null) { const s = document.createElement("span"); s.className = "f-item__price"; s.textContent = money(p); lab.append(" ", s); }
      const inp = document.createElement("input");
      Object.assign(inp, { id: `f-qty-${i}`, type: "number", min: 0, max: maxQty, step: 1, value: 0, inputMode: "numeric" });
      inp.name = `qty_${i}`;
      inp.setAttribute("aria-describedby", "f-items-hint");
      inp.dataset.name = l.name;
      inp.dataset.price = p === null ? "" : p;
      row.append(lab, inp);
      itemsBox.append(row);
      itemInputs.push(inp);
    });
  } else {
    /* menu not loaded from prices yet: one free-text field so the order can still be written down */
    const ta = document.createElement("textarea");
    Object.assign(ta, { id: "f-items-free", name: "items_free", rows: 3 });
    ta.setAttribute("aria-label", D.tFreeLabel);
    ta.setAttribute("aria-describedby", "f-items-hint");
    itemsBox.append(ta);
    itemInputs.push(ta);
  }

  /* ---------- day chips ---------- */
  const daysBox = $("[data-f-days]");
  const region = $("[data-f-days-region]");
  const week = pickupWeek();
  week.forEach((d, i) => {
    const id = `f-day-${i}`;
    const wrap = document.createElement("div");
    wrap.className = "f-day" + (d.open ? "" : " f-day--closed");
    const inp = document.createElement("input");
    Object.assign(inp, { type: "radio", name: "day", id, value: iso(d.date) });
    inp.dataset.open = d.open ? "1" : "0";
    inp.dataset.label = longDay(d.date);
    if (!d.open) inp.disabled = true;
    inp.setAttribute("aria-describedby", "f-day-err");
    const lab = document.createElement("label");
    lab.htmlFor = id;
    const t = document.createElement("span");
    t.className = "f-day__name";
    t.textContent = longDay(d.date);
    lab.append(t);
    const sub = [];
    if (d.window) sub.push(d.window);
    if (!d.open) sub.push(D.tClosed);
    else if (d.showCutoff) sub.push(`${D.tOrderBy} ${fmt(d.cutoff, { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(":00", "")}`);
    if (sub.length) { const s = document.createElement("span"); s.className = "f-day__sub"; s.textContent = sub.join(" · "); lab.append(s); }
    wrap.append(inp, lab);
    daysBox.append(wrap);
  });
  region.hidden = true;
  region.setAttribute("aria-busy", "false");
  if (week.some((d) => d.open)) daysBox.hidden = false;
  else { $("[data-f-days-none]").hidden = false; const rq = $("[data-f-day-req]"); if (rq) rq.hidden = true; }

  /* ---------- summary ---------- */
  const list = $("[data-f-summary-list]"), empty = $("[data-f-summary-empty]");
  const totalEl = $("[data-f-total]"), dayEl = $("[data-f-summary-day]");
  let shownTotal = null, raf = 0;
  function lines() {
    if (!loaves.length) return [];
    return itemInputs.map((i) => ({ name: i.dataset.name, qty: Math.floor(+i.value) || 0, price: i.dataset.price === "" ? null : +i.dataset.price }))
      .filter((l) => l.qty > 0 && l.qty <= maxQty);
  }
  function tween(to) {
    cancelAnimationFrame(raf);
    const from = shownTotal == null ? to : shownTotal;
    shownTotal = to;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === to) { totalEl.textContent = money(to); return; }
    const t0 = performance.now(), dur = 550;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      totalEl.textContent = money(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function renderSummary() {
    const ls = lines();
    list.textContent = "";
    for (const l of ls) {
      const li = document.createElement("li");
      li.textContent = `${l.qty} × ${l.name}`;
      if (l.price !== null) { const s = document.createElement("span"); s.textContent = money(l.price * l.qty); li.append(s); }
      list.append(li);
    }
    empty.hidden = ls.length > 0;
    if (ls.length && ls.every((l) => l.price !== null)) tween(ls.reduce((a, l) => a + l.price * l.qty, 0));
    else { shownTotal = null; totalEl.textContent = D.tTotalPending; }
    const picked = form.querySelector('input[name="day"]:checked');
    dayEl.textContent = picked ? picked.dataset.label : "";
  }
  form.addEventListener("input", renderSummary);
  form.addEventListener("change", renderSummary);
  renderSummary();

  /* ---------- validation ---------- */
  const phoneOk = (v) => { const n = v.replace(/\D/g, ""); return n.length === 10 || (n.length === 11 && n[0] === "1"); };
  const emailOk = (v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
  const rules = {
    items() {
      if (!loaves.length) return itemInputs[0].value.trim() ? "" : D.eItems;
      const bad = itemInputs.find((i) => i.value !== "" && (!/^\d+$/.test(i.value) || +i.value > maxQty));
      if (bad) return { msg: D.eQty, el: bad };
      return lines().length ? "" : D.eItems;
    },
    day() {
      if (!week.some((d) => d.open)) return "";
      const p = form.querySelector('input[name="day"]:checked');
      if (!p) return D.eDay;
      return p.dataset.open === "1" ? "" : D.eDayClosed;
    },
    name: () => (form.name.value.trim().length >= 2 ? "" : D.eName),
    phone: () => (phoneOk(form.phone.value) ? "" : D.ePhone),
    email: () => (!form.email.value.trim() || emailOk(form.email.value.trim()) ? "" : D.eEmail),
  };
  const order = ["items", "day", "name", "phone", "email"];
  const focusEl = (k) => k === "items" ? itemInputs[0] : k === "day" ? (form.querySelector('input[name="day"]:checked') || form.querySelector('input[name="day"]:not(:disabled)') || $('[data-f-field="day"] legend')) : form[k];
  const errs = {};

  function show(k, r) {
    const msg = typeof r === "object" ? r.msg : r;
    const el = typeof r === "object" ? r.el : focusEl(k);
    const field = $(`[data-f-field="${k}"]`), p = $(`[data-f-msg="${k}"]`);
    if (msg) {
      errs[k] = { msg, el };
      p.textContent = msg; p.hidden = false; field.classList.add("is-invalid");
      if (el && el.setAttribute) { el.setAttribute("aria-invalid", "true"); }
      const ids = k === "items" ? "f-items-hint f-items-err" : "";
      if (ids && el) el.setAttribute("aria-describedby", ids);
    } else {
      delete errs[k];
      p.hidden = true; p.textContent = ""; field.classList.remove("is-invalid");
      field.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid"));
    }
  }
  const check = (k) => show(k, rules[k]());
  /* validate on blur (once leaving the field or group) */
  for (const k of order) {
    const box = $(`[data-f-field="${k}"]`);
    box.addEventListener("focusout", (e) => {
      if (box.contains(e.relatedTarget)) return;
      if (k === "items" && !errs.items && !lines().length && !form.dataset.touched) return;
      if (k === "day" && !form.querySelector('input[name="day"]:checked') && !form.dataset.touched) return;
      if (e.target.matches && e.target.matches("input,textarea") && !e.target.value && !form.dataset.touched && k !== "email") { if (k === "items" || k === "day") return; }
      check(k);
    });
    box.addEventListener("input", () => { if (errs[k]) check(k); });
    box.addEventListener("change", () => { if (errs[k]) check(k); });
  }

  /* ---------- error summary ---------- */
  const summary = $("[data-f-errors]"), summaryList = $("[data-f-error-list]");
  function renderSummaryErr() {
    summaryList.textContent = "";
    for (const k of order) if (errs[k]) {
      const li = document.createElement("li"), a = document.createElement("a");
      a.href = "#"; a.textContent = errs[k].msg;
      a.addEventListener("click", (e) => { e.preventDefault(); const t = errs[k] && errs[k].el || focusEl(k); if (t && t.focus) t.focus(); });
      li.append(a); summaryList.append(li);
    }
    summary.hidden = !summaryList.children.length;
  }
  function clearSummary() { summary.hidden = true; document.title = baseTitle; }

  /* ---------- end states ---------- */
  const ok = $("[data-f-success]"), nc = $("[data-f-notconnected]");
  const grid = $(".f-order__grid");
  function endState(el) {
    grid.hidden = true; ok.hidden = true; nc.hidden = true;
    el.hidden = false; el.focus();
  }
  $("[data-f-again]").addEventListener("click", (e) => {
    e.preventDefault(); form.reset(); renderSummary(); ok.hidden = true; grid.hidden = false; form.dataset.touched = "";
    form.querySelector("input").focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.dataset.touched = "1";
    if (form.querySelector("[data-f-hp]").value) { endState(ok); return; }   /* honeypot: pretend, send nothing */
    order.forEach(check);
    renderSummaryErr();
    const first = order.find((k) => errs[k]);
    if (first) {
      document.title = D.wErrorPrefix + baseTitle.replace(/^Error: /, "");
      summary.focus();
      return;
    }
    clearSummary();
    if (!flows.form_endpoint || flows.status !== "connected") { endState(nc); return; }
    const btn = $("[data-f-submit]");
    btn.disabled = true; btn.textContent = D.tSending;
    const day = form.querySelector('input[name="day"]:checked');
    const body = { name: form.name.value.trim(), phone: form.phone.value.trim(), email: form.email.value.trim(),
      pickup_day: day ? day.value : "", items: loaves.length ? lines().map((l) => ({ name: l.name, qty: l.qty })) : itemInputs[0].value.trim() };
    try {
      const r = await fetch(flows.form_endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
      $("[data-f-success-day]").textContent = day ? day.dataset.label : "";
      endState(ok);
    } catch (err) {
      errs.send = { msg: D.eNetwork, el: btn };
      summaryList.textContent = "";
      const li = document.createElement("li"), a = document.createElement("a");
      a.href = "#"; a.textContent = D.eNetwork;
      a.addEventListener("click", (ev) => { ev.preventDefault(); btn.focus(); });
      li.append(a); summaryList.append(li); summary.hidden = false;
      document.title = D.wErrorPrefix + baseTitle.replace(/^Error: /, "");
      summary.focus();
      delete errs.send;
    } finally { btn.disabled = false; btn.textContent = D.tSubmit; }
  });
})();

/* ---- estimator.js ---- */
/* Menu list and estimator. Reads only window.SETTINGS.prices so the list and the total always match. */
(function () {
  "use strict";
  const root = document.querySelector(".p-menu");
  if (!root) return;
  const P = (window.SETTINGS && window.SETTINGS.prices) || {};
  const items = (Array.isArray(P.loaves) ? P.loaves : []).filter((i) => i && i.name);
  const d = root.dataset;
  const list = root.querySelector("[data-p-list]");
  const empty = root.querySelector("[data-p-empty]");
  const box = root.querySelector("[data-p-totalbox]");
  const out = root.querySelector("[data-p-total]");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: P.currency || "USD" });
  const num = (p) => {
    if (typeof p === "number") return p;
    const n = parseFloat(String(p == null ? "" : p).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : null;
  };
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  if (!items.length) { list.textContent = ""; empty.hidden = false; return; }
  const staticRows = list.querySelectorAll("[data-p-row]");

  const qtys = [];
  items.forEach((it, i) => {
    const price = num(it.price);
    const old = staticRows[i];
    const li = el("li", "p-row");
    const head = el("div", "p-row__main");
    head.appendChild(el("h3", "p-row__name", it.name));
    const meta = el("p", "p-row__meta");
    const bits = [];
    if (it.weight) bits.push(d.pSizeLabel + ": " + it.weight);
    bits.push(d.pAllergenLabel && it.allergens && it.allergens.length
      ? d.pAllergenLabel + ": " + it.allergens.join(", ") : d.pAllergenPending);
    if (it.days && it.days.length) bits.push(d.pBakedOn + " " + it.days.join(", "));
    meta.textContent = bits.join(". ");
    head.appendChild(meta);
    li.appendChild(head);

    const priceEl = el("p", "p-row__price" + (price === null ? " is-pending" : ""),
      price === null ? d.pPending : fmt.format(price));
    li.appendChild(priceEl);

    if (price !== null) {
      const id = "p-qty-" + i;
      const lab = el("label", "p-row__qty");
      lab.htmlFor = id;
      lab.appendChild(el("span", "", d.pQtyLabel));
      const inp = el("input");
      inp.id = id; inp.type = "number"; inp.min = "0"; inp.max = "12"; inp.step = "1";
      inp.inputMode = "numeric"; inp.value = "0";
      inp.setAttribute("aria-label", it.name + ", " + d.pQtyLabel);
      lab.appendChild(inp);
      li.appendChild(lab);
      qtys.push({ inp, price });
    }
    if (old) list.replaceChild(li, old); else list.appendChild(li);
  });
  for (let k = items.length; k < staticRows.length; k++) staticRows[k].remove();

  if (!qtys.length) return; /* nothing priced yet: no total, only "price to come" */

  box.hidden = false;
  let shown = 0, raf = 0;
  const write = (v) => { out.textContent = v > 0 ? fmt.format(v) : d.pTotalPending; };
  write(0);
  const update = () => {
    const target = qtys.reduce((s, q) => {
      const n = Math.max(0, Math.min(12, parseInt(q.inp.value, 10) || 0));
      return s + n * q.price;
    }, 0);
    cancelAnimationFrame(raf);
    if (reduce) { shown = target; write(target); return; } /* straight to the value */
    const from = shown, t0 = performance.now(), dur = 240;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      shown = from + (target - from) * k;
      /* visual count only; the live region gets the final value once */
      out.dataset.tick = fmt.format(shown);
      if (k < 1) raf = requestAnimationFrame(step);
      else write(target);
    };
    raf = requestAnimationFrame(step);
  };
  qtys.forEach((q) => q.inp.addEventListener("input", update));
})();
