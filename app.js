/* FantaMotoGP 2026 — app (vanilla JS, nessuna build). */
"use strict";

const view = document.getElementById("view");
const S = { league: null, standings: null, season: null, config: null, rounds: {}, chart: null, timer: null };

/* ------------------------------------------------------------------ util */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NF = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const fmt = (n) => NF.format(n ?? 0).replace("-", "−");
const fmtS = (n) => (n > 0 ? "+" : "") + fmt(n);
const sign = (n) => (n > 0 ? "plus" : n < 0 ? "minus" : "");
const abbr = (nome) => {
  const p = String(nome || "").split(" ");
  return p.length < 2 ? nome : p[0][0] + ". " + p.slice(1).join(" ");
};
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const dayDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const fDate = (d, opt = { day: "numeric", month: "short" }) => d.toLocaleDateString("it-IT", opt);
const fDateTime = (d) => d.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(path + ": " + r.status);
  return r.json();
}
async function getRound(n) {
  if (!S.rounds[n]) S.rounds[n] = await getJSON(`data/rounds/${String(n).padStart(2, "0")}.json`);
  return S.rounds[n];
}

const TEAM_COLORS = {
  "Ducati Lenovo": "#e10600", "Gresini": "#5fb0f0", "VR46": "#f5c400", "Pramac": "#9b5de5",
  "Aprilia Racing": "#8a94a6", "Trackhouse": "#2563eb", "KTM Factory": "#f97316",
  "Tech3": "#14b8a6", "Honda HRC": "#f43f5e", "LCR Honda": "#22a55b", "Yamaha Factory": "#4f46e5",
};
const teamColor = (t) => TEAM_COLORS[t] || "#8d95a8";
const PLAYER_COLORS = ["#e10600", "#2f7cf6", "#e8b100", "#16a34a", "#9b5de5", "#f97316", "#0d9488"];
const playerColor = (nome) => {
  const i = (S.league?.giocatori || []).findIndex((g) => g.nome === nome);
  return PLAYER_COLORS[(i < 0 ? 0 : i) % PLAYER_COLORS.length];
};
const riderInfo = (nome) => (S.league?.piloti || []).find((p) => p.nome === nome) || {};
const me = () => {
  const a = lsGet("fm_auth");
  return a ? (S.league.giocatori.find((g) => g.id === a.id) || {}).nome : null;
};

const medal = (pos, extra = "") => `<span class="medal ${pos <= 3 ? "p" + pos : ""} ${extra}">${pos}</span>`;
const teamChip = (t) => t ? `<span class="chip"><span class="team-dot" style="background:${teamColor(t)}"></span>${esc(t)}</span>` : "";
const ownerChip = (o) => o
  ? `<span class="chip" style="color:${playerColor(o)}">● ${esc(o)}</span>`
  : `<span class="chip">libero</span>`;
const racenum = (n) => n != null ? `<span class="racenum">${esc(n)}</span>` : "";
const CHEV = `<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
const SKULL = "💀";

/* -------------------------------------------------------- calendario */
function nextRaces() {
  const now = new Date();
  const oggi = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cal = S.league.calendario;
  // GP "attuale": il primo non ancora importato la cui gara non e' passata da piu' di 2 giorni
  const current = cal.find((c) => !c.importato && dayDate(c.data) >= new Date(oggi - 2 * 864e5));
  // GP per cui si schiera: il primo con deadline futura
  const lineup = cal.find((c) => c.deadline && new Date(c.deadline) > now);
  return { current, lineup };
}

function countdownHTML(target) {
  let ms = Math.max(0, new Date(target) - new Date());
  const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5;
  const m = Math.floor(ms / 6e4);
  const s = Math.floor((ms - m * 6e4) / 1000);
  const cell = (v, l) => `<div><b class="num">${String(v).padStart(2, "0")}</b><span>${l}</span></div>`;
  return (d ? cell(d, "giorni") : "") + cell(h, "ore") + cell(m, "min") + (d ? "" : cell(s, "sec"));
}
function startCountdown(id, target) {
  clearInterval(S.timer);
  const tick = () => {
    const el = document.getElementById(id);
    if (!el) return clearInterval(S.timer);
    el.innerHTML = countdownHTML(target);
  };
  tick();
  S.timer = setInterval(tick, 1000);
}

/* ------------------------------------------------------------ rendering */
function setTab(name) {
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === name));
  document.querySelectorAll(".top-actions a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + name));
}

function moveHTML(pos, prev) {
  if (prev == null) return "";
  const d = prev - pos;
  if (d > 0) return `<span class="move up">▲${d}</span>`;
  if (d < 0) return `<span class="move down">▼${-d}</span>`;
  return `<span class="move same">=</span>`;
}

function standingsRows(limit) {
  const io = me();
  const rows = S.standings.tabella.slice(0, limit || 99);
  if (!rows.length) return `<div class="empty">Ancora nessun GP disputato</div>`;
  return `<div class="list">` + rows.map((r) => `
    <a class="row" href="#/squadre/${encodeURIComponent(r.nome)}" ${r.nome === io ? 'style="background:var(--accent-soft)"' : ""}>
      ${medal(r.pos)}
      <div class="grow">
        <div class="name">${esc(r.nome)}${r.nome === io ? ' <span class="chip accent">tu</span>' : ""}</div>
        <div class="meta">${moveHTML(r.pos, r.pos_prec)} ultimo GP ${fmt(r.ultimo_gp)} pt</div>
      </div>
      <div class="right">
        <div class="pts big num">${fmt(r.tot)}</div>
        <div class="gap num">${r.distacco ? "−" + fmt(r.distacco) : "leader"}</div>
      </div>
    </a>`).join("") + `</div>`;
}

/* ================================================================ HOME */
async function viewHome() {
  setTab("home");
  const { current, lineup } = nextRaces();
  const last = S.league.ultimo_round;
  let hero = "";
  const c = current || lineup;
  if (c) {
    const aperta = lineup && lineup.round === c.round;
    hero = `
    <section class="hero">
      <div class="hero-top"><span>Round ${c.round} / 22</span><span>${fDate(dayDate(c.data), { weekday: "short", day: "numeric", month: "long" })}</span></div>
      <h2>GP ${esc(c.gp)}</h2>
      <div class="circuit">${esc(c.circuito)} · ${esc(c.paese)}${c.sprint ? " · con Sprint" : ""}</div>
      <div class="hero-row">
        ${aperta ? `<div><div class="hero-label">Formazioni chiudono tra</div><div class="countdown" id="cd"></div></div>
                    <a class="btn light" href="#/formazione">Schiera la formazione</a>`
                 : `<div><div class="hero-label">Formazioni chiuse</div><b>Weekend in corso</b></div>
                    <a class="btn light" href="#/formazione">Vedi le formazioni</a>`}
      </div>
    </section>`;
  } else {
    hero = `<section class="hero"><div class="hero-top">Stagione 2026</div><h2>Stagione conclusa</h2>
            <div class="circuit">Grazie a tutti, ci vediamo all'asta!</div></section>`;
  }

  let lastGP = "";
  if (last) {
    const R = await getRound(last);
    const top = R.giocatori.slice(0, 3);
    const order = [top[1], top[0], top[2]];
    const cls = ["s2", "s1", "s3"];
    lastGP = `
      <div class="section-title"><span>Ultimo GP · ${esc(R.gp)}</span><a href="#/gp/${last}">Dettagli →</a></div>
      <div class="card">
        <div class="podium">
          ${order.map((g, i) => g ? `<div class="step ${cls[i]}"><div class="who">${esc(g.nome)}</div>
            <div class="val num">${fmt(g.tot)} pt</div><div class="block">${g.pos}</div></div>` : "<div></div>").join("")}
        </div>
      </div>
      <div class="section-title"><span>Top piloti del weekend</span><a href="#/gp/${last}/piloti">Tutti →</a></div>
      <div class="card"><div class="list">
        ${R.piloti.slice(0, 3).map((p) => `
          <a class="row" href="#/gp/${last}/piloti">
            ${medal(p.pos)} ${racenum(p.numero)}
            <div class="grow"><div class="name">${esc(p.nome)}</div>
              <div class="meta">${teamChip(p.team)} ${p.owner ? ownerChip(p.owner) : ""}</div></div>
            <div class="right pts big num">${fmt(p.tot)}</div>
          </a>`).join("")}
      </div></div>`;
  }

  view.innerHTML = `
    ${hero}
    <div class="section-title"><span>Classifica generale</span><a href="#/classifica">Completa →</a></div>
    <div class="card">${standingsRows(5)}</div>
    ${lastGP}
    <p class="foot">Dati aggiornati al ${esc(fDateTime(new Date(S.league.aggiornato)))}</p>`;
  if (c && lineup && lineup.round === c.round) startCountdown("cd", lineup.deadline);
}

/* ========================================================== CLASSIFICA */
function viewClassifica() {
  setTab("classifica");
  const st = S.standings;
  const giocati = st.giocati;
  const tab = st.tabella;
  const best = tab.length ? tab.reduce((a, b) => (b.migliore > a.migliore ? b : a)) : null;
  const avg = tab.length ? tab.reduce((a, b) => (b.media > a.media ? b : a)) : null;
  const lastBest = tab.length ? tab.reduce((a, b) => (b.ultimo_gp > a.ultimo_gp ? b : a)) : null;
  const R = (n) => S.league.calendario.find((c) => c.round === n);

  const matrix = giocati.length ? `
    <div class="section-title"><span>Punti GP per GP</span></div>
    <div class="card table-wrap"><table class="grid">
      <thead><tr><th>Giocatore</th>${giocati.map((n) => `<th title="${esc(R(n).gp)}">R${n}<br><span style="text-transform:none">${esc(R(n).gp.slice(0, 3))}</span></th>`).join("")}<th>Tot</th></tr></thead>
      <tbody>${tab.map((r) => {
        const g = st.giocatori.find((x) => x.nome === r.nome);
        return `<tr><td><b>${esc(r.nome)}</b></td>${giocati.map((n) => {
          const v = g.punti[n - 1];
          const top = Math.max(...st.giocatori.map((x) => x.punti[n - 1]));
          return `<td class="num ${v === top && v ? "best" : ""}">${fmt(v)}</td>`;
        }).join("")}<td class="num"><b>${fmt(r.tot)}</b></td></tr>`;
      }).join("")}</tbody>
    </table></div>` : "";

  view.innerHTML = `
    <h1 class="page-title">Classifica</h1>
    <p class="page-sub">${giocati.length} GP disputati su 22</p>
    <div class="card">${standingsRows()}</div>
    ${tab.length ? `
    <div class="section-title"><span>Record</span></div>
    <div class="stats">
      <div class="stat"><small>Miglior GP</small><b class="num">${fmt(best.migliore)}</b><span>${esc(best.nome)}</span></div>
      <div class="stat"><small>Media più alta</small><b class="num">${fmt(avg.media)}</b><span>${esc(avg.nome)}</span></div>
      <div class="stat"><small>Ultimo GP</small><b class="num">${fmt(lastBest.ultimo_gp)}</b><span>${esc(lastBest.nome)}</span></div>
    </div>
    <div class="section-title"><span>Andamento</span></div>
    <div class="seg" id="chart-mode"><button class="on" data-m="cum">Totale</button><button data-m="gp">Per GP</button></div>
    <div class="card"><div class="chart-box"><canvas id="chart"></canvas></div></div>` : ""}
    ${matrix}`;

  if (!tab.length) return;
  const draw = (mode) => {
    if (typeof Chart === "undefined") return;
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim();
    const line = css.getPropertyValue("--line").trim();
    const labels = giocati.map((n) => "R" + n + " " + R(n).gp.slice(0, 3));
    const datasets = st.giocatori.map((g) => {
      let acc = 0;
      const dati = giocati.map((n) => mode === "cum" ? (acc += g.punti[n - 1]) : g.punti[n - 1]);
      const col = playerColor(g.nome);
      return { label: g.nome, data: mode === "cum" ? [0, ...dati] : dati, borderColor: col, backgroundColor: col,
               tension: .3, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, borderRadius: 6 };
    });
    if (S.chart) S.chart.destroy();
    S.chart = new Chart(document.getElementById("chart"), {
      type: mode === "cum" ? "line" : "bar",
      data: { labels: mode === "cum" ? ["Start", ...labels] : labels, datasets },
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { color: muted, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8,
                     font: { family: "Titillium Web", size: 13, weight: 600 } } },
                   tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y)} pt` } } },
        scales: { x: { grid: { display: false }, ticks: { color: muted, font: { family: "Titillium Web" } } },
                  y: { grid: { color: line }, border: { display: false }, ticks: { color: muted, font: { family: "Titillium Web" } } } },
      },
    });
  };
  draw("cum");
  document.getElementById("chart-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll("#chart-mode button").forEach((x) => x.classList.toggle("on", x === b));
    draw(b.dataset.m);
  });
}

/* ================================================================== GP */
function resultsPills(p) {
  const one = (l, v) => v == null ? "" :
    `<span class="res ${/^P/.test(v) || typeof v === "number" ? "" : "bad"}"><small>${l}</small>${esc(typeof v === "number" ? "P" + v : v)}</span>`;
  return `<div class="results">${one("Qual", p.q)}${one("Sprint", p.s)}${one("Gara", p.g)}</div>`;
}

/* Q4 · S3 · G DNF */
function compatto(p) {
  const one = (l, v) => v == null ? l + "–" : /^P\d/.test(v) ? l + v.slice(1) : l + " " + v;
  return [one("Q", p.q != null ? "P" + p.q : null), one("S", p.s), one("G", p.g)].join(" · ");
}

function phasesHTML(fasi) {
  if (!fasi || !fasi.length) return `<div class="note-line">Nessun punto</div>`;
  return fasi.map((f) => `
    <div class="phase">
      <div class="ph">${esc(f.nome)}${f.ctx ? `<small>${esc(f.ctx)}</small>` : ""}</div>
      <div class="voci">${f.voci.length ? f.voci.map((v) =>
        `<span class="voce ${v.pt > 0 ? "p" : v.pt < 0 ? "n" : ""}">${esc(v.l)}<b class="num">${fmtS(v.pt)}</b></span>`).join("")
        : `<span class="muted small">—</span>`}</div>
      <div class="sub num ${sign(f.sub)}">${fmtS(f.sub)}</div>
    </div>`).join("");
}

function riderBlock(p, pts) {
  if (!p || !p.nome) return `<div class="rider"><div class="muted">⚠️ Nessun pilota valido</div></div>`;
  return `
    <div class="rider">
      <div class="rider-head">
        ${racenum(p.numero)}
        <div class="grow">
          <div class="name">${esc(p.nome)} ${p.subentrato_a ? `<span class="tag-sub">⇄ riserva per ${esc(abbr(p.subentrato_a))}</span>` : ""}</div>
          <div class="meta">${teamChip(p.team)}</div>
        </div>
        <div class="pts big num ${sign(pts)}">${fmt(pts)}</div>
      </div>
      ${p.assente ? `<div class="note-line">Assente nel weekend</div>` : resultsPills(p) + phasesHTML(p.fasi)}
    </div>`;
}

function teamBlock(t) {
  if (!t) return "";
  return `
    <div class="rider">
      <div class="rider-head">
        <span class="racenum" style="background:${teamColor(t.nome)};color:#fff">T</span>
        <div class="grow"><div class="name">${esc(t.nome)}</div>
          <div class="meta">${t.corridori.map((c) => `${esc(abbr(c.pilota))} <b>${esc(c.esito)}</b>`).join(" · ") || "nessun pilota in gara"}</div></div>
        <div class="pts big num ${sign(t.pt)}">${fmt(t.pt)}</div>
      </div>
      <div class="voci" style="margin-top:10px">${t.voci.length ? t.voci.map((v) =>
        `<span class="voce ${v.pt > 0 ? "p" : v.pt < 0 ? "n" : ""}">${esc(v.l)}<b class="num">${fmtS(v.pt)}</b></span>`).join("")
        : `<span class="muted small">Nessun bonus né malus</span>`}</div>
    </div>`;
}

async function viewGP(nArg, tabArg) {
  setTab("gp");
  const giocati = S.standings.giocati;
  if (!giocati.length) {
    view.innerHTML = `<h1 class="page-title">GP</h1><div class="card empty">Nessun GP ancora disputato</div>`;
    return;
  }
  const n = giocati.includes(+nArg) ? +nArg : giocati[giocati.length - 1];
  const tab = ["giocatori", "piloti", "team"].includes(tabArg) ? tabArg : "giocatori";
  view.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  const R = await getRound(n);
  const cal = S.league.calendario;
  const io = me();

  const pills = `<div class="scroller" id="rounds">${giocati.slice().reverse().map((r) => {
    const c = cal.find((x) => x.round === r);
    return `<a class="round-pill ${r === n ? "on" : ""}" href="#/gp/${r}/${tab}"><small>ROUND ${r}</small><b>${esc(c.gp)}</b></a>`;
  }).join("")}</div>`;

  let body = "";
  if (tab === "giocatori") {
    body = R.giocatori.length ? R.giocatori.map((g) => `
      <details class="x card" ${g.nome === io || R.giocatori.length <= 3 && g.pos === 1 ? "open" : ""}>
        <summary class="row">
          ${medal(g.pos)}
          <div class="grow"><div class="name">${esc(g.nome)}${g.nome === io ? ' <span class="chip accent">tu</span>' : ""}</div>
            <div class="meta">${g.piloti.map((p) => esc(abbr(p.nome))).join(" · ")}${g.team ? " · " + esc(g.team.nome) : ""}</div></div>
          <div class="pts big num">${fmt(g.tot)}</div>${CHEV}
        </summary>
        <div class="xbody">
          ${g.stato_rosa && String(g.stato_rosa).toUpperCase() !== "OK" ? `<div class="alert ko">Rosa: ${esc(g.stato_rosa)}</div>` : ""}
          ${g.piloti.map((p) => riderBlock(p, p.pt)).join("")}
          ${teamBlock(g.team)}
          ${g.riserva_panchina ? `<div class="note-line">🪑 Riserva <b>${esc(g.riserva_panchina.nome)}</b> non entrata
            ${g.riserva_panchina.assente ? "(assente)" : `(avrebbe fatto ${fmt(g.riserva_panchina.avrebbe)} pt)`}</div>` : ""}
        </div>
      </details>`).join("") : `<div class="card empty">Nessuna rosa compilata per questo GP</div>`;
  } else if (tab === "piloti") {
    body = `<div class="card">` + R.piloti.map((p) => `
      <details class="x">
        <summary class="row">
          ${p.maglia_nera ? `<span class="medal" title="Maglia nera">${SKULL}</span>` : medal(p.pos)}
          ${racenum(p.numero)}
          <div class="grow"><div class="name">${esc(p.nome)}</div>
            <div class="meta">${teamChip(p.team)} ${p.ospite ? `<span class="chip accent">${esc(p.ruolo || "ospite")}</span>` : ownerChip(p.owner)}</div></div>
          <div class="right"><div class="pts big num ${sign(p.tot)}">${fmt(p.tot)}</div>
            <div class="gap">${compatto(p)}</div></div>
          ${CHEV}
        </summary>
        <div class="xbody">${resultsPills(p)}${phasesHTML(p.fasi)}</div>
      </details>`).join("") + `</div>
      ${R.assenti.length ? `<p class="muted small" style="margin:12px 4px">🚫 Assenti: ${R.assenti.map(esc).join(", ")}</p>` : ""}
      <p class="muted small" style="margin:8px 4px">Sostituti e wild card: punti indicativi, contano solo per il team.</p>`;
  } else {
    body = `<div class="card">` + R.team.map((t) => `
      <details class="x">
        <summary class="row">
          ${medal(t.pos)}
          <span class="team-dot" style="background:${teamColor(t.nome)};width:12px;height:12px"></span>
          <div class="grow"><div class="name">${esc(t.nome)}</div>
            <div class="meta">${ownerChip(t.owner)} ${t.corridori.map((c) => `${esc(abbr(c.pilota))} ${esc(c.esito)}`).join(" · ")}</div></div>
          <div class="pts big num ${sign(t.tot)}">${fmt(t.tot)}</div>${CHEV}
        </summary>
        <div class="xbody"><div class="voci">${t.voci.length ? t.voci.map((v) =>
          `<span class="voce ${v.pt > 0 ? "p" : v.pt < 0 ? "n" : ""}">${esc(v.l)}<b class="num">${fmtS(v.pt)}</b></span>`).join("")
          : `<span class="muted small">Nessun bonus né malus</span>`}</div></div>
      </details>`).join("") + `</div>`;
  }

  view.innerHTML = `
    ${pills}
    <h1 class="page-title">GP ${esc(R.gp)}</h1>
    <p class="page-sub">Round ${R.round} · ${esc(R.circuito)} · ${esc(R.data)}</p>
    <div class="seg">
      ${["giocatori", "piloti", "team"].map((t) => `<button class="${t === tab ? "on" : ""}" onclick="location.hash='#/gp/${n}/${t}'">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
    </div>
    ${body}
    ${R.avvisi.length ? `<p class="muted small center" style="margin-top:14px">⚠️ ${R.avvisi.length} voci con rettifica rispetto all'Excel</p>` : ""}`;
  const on = document.querySelector("#rounds .on");
  if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
}

/* ============================================================= SQUADRE */
function sparkline(values, color) {
  if (!values.length) return "";
  const w = 70, h = 24, pad = 3;
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const x = (i) => values.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (values.length - 1);
  const y = (v) => h - pad - ((v - min) * (h - 2 * pad)) / (max - min || 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}"><path d="${d}" stroke="${color}"/>
    <circle cx="${x(last)}" cy="${y(values[last])}" r="2.6" fill="${color}" stroke="none"/></svg>`;
}

function viewSquadre(arg) {
  setTab("squadre");
  const tabs = ["giocatori", "piloti", "team"];
  const tab = tabs.includes(arg) ? arg : "giocatori";
  const focus = tabs.includes(arg) ? null : arg;
  const giocati = S.standings.giocati;
  const seasonP = Object.fromEntries(S.season.piloti.map((p) => [p.nome, p]));
  const seasonT = Object.fromEntries(S.season.team.map((t) => [t.nome, t]));
  const tot = Object.fromEntries(S.standings.tabella.map((r) => [r.nome, r]));
  let body = "";

  if (tab === "giocatori") {
    const asta = S.league.asta.slice().sort((a, b) => (tot[a.nome]?.pos ?? 99) - (tot[b.nome]?.pos ?? 99));
    body = asta.map((a) => {
      const col = playerColor(a.nome);
      const rose = Object.entries(S.league.rose).map(([r, l]) => [+r, l.find((x) => x.giocatore === a.nome)])
        .filter(([, x]) => x).sort((x, y) => y[0] - x[0]);
      return `
      <div class="card" id="sq-${esc(a.nome)}">
        <div class="team-card-head">
          <div class="avatar" style="background:${col}">${esc(a.nome[0])}</div>
          <div class="grow" style="flex:1;min-width:0">
            <div class="name" style="font-weight:900;font-size:19px">${esc(a.nome)}</div>
            <div class="meta muted small">${tot[a.nome] ? `${tot[a.nome].pos}° in classifica` : ""} · asta ${fmt(a.speso)} crediti</div>
          </div>
          <div class="right"><div class="pts big num">${fmt(tot[a.nome]?.tot ?? 0)}</div><div class="gap">punti</div></div>
        </div>
        <div class="list">
          ${a.piloti.map((p) => {
            const s = seasonP[p.nome] || { punti: [], tot: 0 };
            return `<div class="row">
              ${racenum(p.numero)}
              <div class="grow"><div class="name">${esc(p.nome)}</div>
                <div class="meta">${teamChip(p.team)} <span class="chip">${fmt(p.prezzo)} cr</span></div></div>
              ${sparkline(giocati.map((n) => s.punti[n - 1] || 0), col)}
              <div class="right"><div class="pts num">${fmt(s.tot)}</div><div class="gap">pt pilota</div></div>
            </div>`;
          }).join("")}
          ${a.team ? (() => {
            const s = seasonT[a.team.nome] || { punti: [], tot: 0 };
            return `<div class="row">
              <span class="racenum" style="background:${teamColor(a.team.nome)};color:#fff">T</span>
              <div class="grow"><div class="name">${esc(a.team.nome)}</div>
                <div class="meta"><span class="chip">Team</span> <span class="chip">${fmt(a.team.prezzo)} cr</span></div></div>
              ${sparkline(giocati.map((n) => s.punti[n - 1] || 0), col)}
              <div class="right"><div class="pts num">${fmt(s.tot)}</div><div class="gap">pt team</div></div>
            </div>`;
          })() : ""}
        </div>
        ${rose.length ? `
        <details class="x" ${focus === a.nome ? "open" : ""}>
          <summary class="row"><div class="grow"><b>Formazioni schierate</b> <span class="muted small">(${rose.length})</span></div>${CHEV}</summary>
          <div class="list">${rose.map(([r, x]) => {
            const c = S.league.calendario.find((k) => k.round === r);
            return `<a class="row" href="#/gp/${r}">
              <div class="grow"><div class="name small" style="font-size:14px">R${r} · ${esc(c?.gp || "")}</div>
                <div class="meta">${x.tit.map((t, i) => x.eff[i] && x.eff[i] !== t
                  ? `<s>${esc(abbr(t))}</s> → ${esc(abbr(x.eff[i]))}` : esc(abbr(t))).join(" · ")} · 🪑 ${esc(abbr(x.riserva))}</div></div>
              <div class="right pts num">${c?.importato ? fmt(x.tot) : "–"}</div></a>`;
          }).join("")}</div>
        </details>` : ""}
      </div>`;
    }).join("");
  } else if (tab === "piloti") {
    body = `<div class="card"><div class="list">` + S.season.piloti.map((p, i) => {
      const info = riderInfo(p.nome);
      const ultimo = giocati.length ? p.punti[giocati[giocati.length - 1] - 1] : 0;
      return `<div class="row">
        ${medal(i + 1)} ${racenum(info.numero)}
        <div class="grow"><div class="name">${esc(p.nome)}</div>
          <div class="meta">${teamChip(info.team)} ${ownerChip(p.owner)}</div></div>
        <div class="right"><div class="pts big num ${sign(p.tot)}">${fmt(p.tot)}</div>
          <div class="gap">ultimo GP ${fmt(ultimo)}</div></div>
      </div>`;
    }).join("") + `</div></div>
    <p class="muted small" style="margin:10px 4px">Punti fanta totali dei piloti a listino nei GP disputati.</p>`;
  } else {
    body = `<div class="card"><div class="list">` + S.season.team.map((t, i) => {
      const ultimo = giocati.length ? t.punti[giocati[giocati.length - 1] - 1] : 0;
      return `<div class="row">
        ${medal(i + 1)} <span class="team-dot" style="background:${teamColor(t.nome)};width:12px;height:12px"></span>
        <div class="grow"><div class="name">${esc(t.nome)}</div><div class="meta">${ownerChip(t.owner)}</div></div>
        <div class="right"><div class="pts big num ${sign(t.tot)}">${fmt(t.tot)}</div>
          <div class="gap">ultimo GP ${fmt(ultimo)}</div></div>
      </div>`;
    }).join("") + `</div></div>`;
  }

  view.innerHTML = `
    <h1 class="page-title">Squadre</h1>
    <p class="page-sub">Rose d'asta, piloti e team della stagione</p>
    <div class="seg">${tabs.map((t) => `<button class="${t === tab ? "on" : ""}" onclick="location.hash='#/squadre/${t}'">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
    ${body}`;
  if (focus) document.getElementById("sq-" + focus)?.scrollIntoView({ block: "start" });
}

/* ========================================================== FORMAZIONE */
const sbOK = () => S.config?.supabase_url && S.config?.supabase_anon_key && !/INSERISCI/.test(S.config.supabase_url + S.config.supabase_anon_key);
async function rpc(fn, args) {
  const key = S.config.supabase_anon_key;
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  const base = S.config.supabase_url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const r = await fetch(base + "/rest/v1/rpc/" + fn,
    { method: "POST", headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error("Server non raggiungibile (" + r.status + ")");
  return r.json();
}

function statusList(st, rnd, conPiloti) {
  const inviate = Object.fromEntries((st.inviate || []).map((x) => [x.player_id, x]));
  return `<div class="list">` + S.league.giocatori.map((g) => {
    const x = inviate[g.id];
    return `<div class="row">
      <div class="avatar" style="background:${playerColor(g.nome)};width:34px;height:34px;font-size:15px;border-radius:10px">${esc(g.nome[0])}</div>
      <div class="grow"><div class="name">${esc(g.nome)}</div>
        <div class="meta">${x ? (conPiloti && x.tit1
          ? `${esc(abbr(x.tit1))} · ${esc(abbr(x.tit2))} · 🪑 ${esc(abbr(x.riserva))}`
          : "inviata " + esc(fDateTime(new Date(x.submitted_at)))) : "non ancora inviata"}</div></div>
      ${x ? `<span class="chip ok">✓</span>` : `<span class="chip ko">—</span>`}
    </div>`;
  }).join("") + `</div>`;
}

async function viewFormazione() {
  setTab("formazione");
  if (!sbOK()) {
    view.innerHTML = `<h1 class="page-title">Formazione</h1>
      <div class="card pad"><div class="alert info">L'invio delle formazioni dall'app non è ancora attivo.
      L'admin deve configurare Supabase (vedi GUIDA_APP.md).</div></div>`;
    return;
  }
  const { lineup } = nextRaces();
  const now = new Date();
  // GP con formazioni chiuse ma risultati non ancora pubblicati
  const inCorso = S.league.calendario.filter((c) => !c.importato && c.deadline && new Date(c.deadline) <= now).pop();
  const auth = lsGet("fm_auth");
  const player = auth && S.league.giocatori.find((g) => g.id === auth.id);

  let main = "";
  if (!lineup) {
    main = `<div class="card pad"><div class="alert info">Non ci sono GP con formazioni aperte.</div></div>`;
  } else if (!player) {
    main = `
      <div class="card pad">
        <div class="field"><label>Chi sei?</label>
          <div class="players-pick" id="who">${S.league.giocatori.map((g) =>
            `<button type="button" data-id="${esc(g.id)}">${esc(g.nome)}</button>`).join("")}</div></div>
        <form id="login">
          <div class="field"><label for="pin">PIN</label>
            <input class="input" id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Il tuo PIN" required></div>
          <div id="login-msg"></div>
          <button class="btn block" type="submit" disabled id="login-btn">Entra</button>
        </form>
        <p class="muted small center" style="margin:12px 0 0">Il PIN te lo dà l'admin della lega. Resta salvato su questo dispositivo.</p>
      </div>`;
  } else {
    main = `<div class="card pad" id="lineup-box"><div class="loading" style="padding:30px 0"><div class="spinner"></div></div></div>`;
  }

  view.innerHTML = `
    <h1 class="page-title">Formazione</h1>
    ${lineup ? `<p class="page-sub">Round ${lineup.round} · <b>GP ${esc(lineup.gp)}</b> · chiude ${esc(fDateTime(new Date(lineup.deadline)))}</p>` : ""}
    ${player ? `<p class="page-sub" style="margin-top:-12px">Ciao <b>${esc(player.nome)}</b> · <button class="linkbtn" id="logout">Esci</button></p>` : ""}
    ${main}
    ${lineup ? `<div class="section-title"><span>Chi ha già schierato · R${lineup.round}</span></div>
      <div class="card" id="status-next"><div class="empty">…</div></div>` : ""}
    ${inCorso ? `<div class="section-title"><span>Formazioni GP ${esc(inCorso.gp)}</span></div>
      <div class="card" id="status-now"><div class="empty">…</div></div>` : ""}`;

  document.getElementById("logout")?.addEventListener("click", () => { lsSet("fm_auth", null); viewFormazione(); });

  if (lineup) rpc("lineup_status", { p_round: lineup.round })
    .then((st) => { document.getElementById("status-next").innerHTML = statusList(st, lineup.round, false); })
    .catch((e) => { document.getElementById("status-next").innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  if (inCorso) rpc("lineup_status", { p_round: inCorso.round })
    .then((st) => { document.getElementById("status-now").innerHTML = statusList(st, inCorso.round, true); })
    .catch((e) => { document.getElementById("status-now").innerHTML = `<div class="empty">${esc(e.message)}</div>`; });

  if (!lineup) return;
  if (!player) {
    let chosen = null;
    const btn = document.getElementById("login-btn");
    document.getElementById("who").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      chosen = b.dataset.id;
      document.querySelectorAll("#who button").forEach((x) => x.classList.toggle("on", x === b));
      btn.disabled = false;
      document.getElementById("pin").focus();
    });
    document.getElementById("login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = document.getElementById("pin").value.trim();
      const msg = document.getElementById("login-msg");
      btn.disabled = true;
      try {
        const r = await rpc("my_lineup", { p_player: chosen, p_pin: pin, p_round: lineup.round });
        if (!r.ok) throw new Error(r.errore);
        lsSet("fm_auth", { id: chosen, pin });
        viewFormazione();
      } catch (err) {
        msg.innerHTML = `<div class="alert ko">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
    return;
  }
  editorFormazione(player, auth.pin, lineup);
}

async function editorFormazione(player, pin, lineup) {
  const box = document.getElementById("lineup-box");
  let saved = null;
  try {
    const r = await rpc("my_lineup", { p_player: player.id, p_pin: pin, p_round: lineup.round });
    if (!r.ok) {
      lsSet("fm_auth", null);
      box.innerHTML = `<div class="alert ko">${esc(r.errore)}</div><button class="btn ghost block" onclick="location.reload()">Accedi di nuovo</button>`;
      return;
    }
    saved = r.lineup;
  } catch (e) {
    box.innerHTML = `<div class="alert ko">${esc(e.message)}</div>`;
    return;
  }
  const rosa = S.league.asta.find((a) => a.id === player.id);
  if (!rosa || rosa.piloti.length < 3) {
    box.innerHTML = `<div class="alert ko">Rosa d'asta incompleta: chiedi all'admin.</div>`;
    return;
  }
  const nomi = rosa.piloti.map((p) => p.nome);
  // riserva iniziale: quella salvata, altrimenti quella dell'ultimo GP, altrimenti il terzo pilota
  const ultime = Object.keys(S.league.rose).map(Number).sort((a, b) => b - a)
    .map((r) => S.league.rose[r].find((x) => x.giocatore === player.nome)).filter(Boolean);
  let riserva = saved?.riserva || (ultime[0] && nomi.includes(ultime[0].riserva) ? ultime[0].riserva : nomi[2]);
  const seasonP = Object.fromEntries(S.season.piloti.map((p) => [p.nome, p]));

  const render = (msg = "") => {
    const cambiata = !saved || saved.riserva !== riserva;
    box.innerHTML = `
      ${msg}
      ${saved ? `<div class="alert ok">✓ Formazione inviata il ${esc(fDateTime(new Date(saved.submitted_at)))}</div>`
              : `<div class="alert info">Non hai ancora inviato la formazione per questo GP.</div>`}
      <div class="field"><label>Tocca un pilota per mandarlo in panchina</label></div>
      ${rosa.piloti.map((p) => {
        const bench = p.nome === riserva;
        return `<button type="button" class="pick ${bench ? "bench" : ""}" data-n="${esc(p.nome)}">
          ${racenum(p.numero)}
          <div class="grow"><div class="name" style="font-weight:700">${esc(p.nome)}</div>
            <div class="meta muted small">${esc(p.team)} · ${fmt(seasonP[p.nome]?.tot ?? 0)} pt in stagione</div></div>
          <span class="role ${bench ? "ris" : "tit"}">${bench ? "Riserva" : "Titolare"}</span>
        </button>`;
      }).join("")}
      ${rosa.team ? `<div class="pick" style="cursor:default;margin-top:8px">
          <span class="racenum" style="background:${teamColor(rosa.team.nome)};color:#fff">T</span>
          <div class="grow"><div class="name" style="font-weight:700">${esc(rosa.team.nome)}</div>
            <div class="meta muted small">Team · sempre schierato</div></div>
          <span class="role tit">Team</span></div>` : ""}
      <button class="btn block" id="send" style="margin-top:16px" ${cambiata ? "" : "disabled"}>
        ${saved ? (cambiata ? "Aggiorna formazione" : "Formazione già inviata") : "Invia formazione"}</button>
      <p class="muted small center" style="margin:10px 0 0">Puoi cambiarla fino alla deadline. La riserva entra da sola se un titolare non corre.</p>`;
    box.querySelectorAll(".pick[data-n]").forEach((b) => b.addEventListener("click", () => {
      riserva = b.dataset.n;
      render();
    }));
    box.querySelector("#send").addEventListener("click", invia);
  };

  const invia = async () => {
    const btn = box.querySelector("#send");
    btn.disabled = true;
    btn.textContent = "Invio…";
    const tit = nomi.filter((n) => n !== riserva);
    try {
      const r = await rpc("submit_lineup", { p_player: player.id, p_pin: pin, p_round: lineup.round,
        p_tit1: tit[0], p_tit2: tit[1], p_riserva: riserva });
      if (!r.ok) throw new Error(r.errore);
      saved = { tit1: tit[0], tit2: tit[1], riserva, submitted_at: r.submitted_at };
      render(`<div class="alert ok"><b>Fatto!</b> Titolari ${esc(tit.join(" e "))}, riserva ${esc(riserva)}.</div>`);
      rpc("lineup_status", { p_round: lineup.round })
        .then((st) => { document.getElementById("status-next").innerHTML = statusList(st, lineup.round, false); });
    } catch (e) {
      render(`<div class="alert ko">${esc(e.message)}</div>`);
    }
  };
  render();
}

/* ========================================================== CALENDARIO */
function viewCalendario() {
  setTab("calendario");
  const { current } = nextRaces();
  const oggi = new Date();
  view.innerHTML = `
    <h1 class="page-title">Calendario</h1>
    <p class="page-sub">22 GP · deadline formazioni il giovedì alle ${esc(fDateTime(new Date(S.league.calendario[0].deadline)).split(" ").pop())}</p>
    <div class="card"><div class="list">${S.league.calendario.map((c) => {
      const cls = c.importato ? "done" : current && c.round === current.round ? "next" : dayDate(c.data) < oggi ? "past" : "";
      const tag = c.importato ? `<span class="chip ok">Risultati</span>`
        : current && c.round === current.round ? `<span class="chip accent">Prossimo</span>` : "";
      const inner = `
        <div class="rnd"><span><small>R</small>${c.round}</span></div>
        <div class="grow"><div class="name">GP ${esc(c.gp)}</div>
          <div class="meta">${esc(c.circuito)} · ${esc(fDate(dayDate(c.data), { weekday: "short", day: "numeric", month: "short" }))}${c.sprint ? " · Sprint" : ""}</div></div>
        <div class="right">${tag}</div>`;
      return c.importato ? `<a class="row cal-row ${cls}" href="#/gp/${c.round}">${inner}</a>`
                         : `<div class="row cal-row ${cls}">${inner}</div>`;
    }).join("")}</div></div>`;
}

/* ========================================================= REGOLAMENTO */
function viewRegolamento() {
  setTab("regolamento");
  const reg = S.league.regolamento;
  const tabella = (t, titolo) => `
    <div class="section-title"><span>${titolo}</span></div>
    <div class="card"><div class="pts-grid">${Object.entries(t).map(([k, v]) =>
      `<div><small>${k}°</small><b class="num">${fmt(v)}</b></div>`).join("")}</div></div>`;
  view.innerHTML = `
    <h1 class="page-title">Regolamento</h1>
    <p class="page-sub">Tutti i bonus e malus in vigore, letti dal file della lega</p>
    <a class="btn ghost block" href="regolamento.pdf" target="_blank" rel="noopener">📄 Apri il regolamento completo (PDF)</a>
    ${tabella(reg.tab_gara, "Punti gara")}
    ${tabella(reg.tab_sprint, "Punti sprint")}
    ${tabella(reg.tab_team, "Classifica team del weekend")}
    ${reg.sezioni.map((s) => `
      <div class="section-title"><span>${esc(s.titolo.replace(/^[A-Z]\.\s*/, ""))}</span></div>
      <div class="card">${s.voci.map((v) => `
        <div class="rule">
          <div class="grow">${esc(v.descrizione)}${v.note ? `<small>${esc(v.note)}</small>` : ""}</div>
          <div class="val num ${v.soglia || v.valore == null || typeof v.valore !== "number" ? "" : sign(v.valore)}">
            ${v.valore == null ? "" : typeof v.valore === "number" ? (v.soglia ? fmt(v.valore) : fmtS(v.valore)) : esc(v.valore)}</div>
        </div>`).join("")}</div>`).join("")}`;
}

/* ============================================================== router */
async function route() {
  clearInterval(S.timer);
  if (S.chart) { S.chart.destroy(); S.chart = null; }
  const [page, a, b] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  try {
    switch (page) {
      case "classifica": viewClassifica(); break;
      case "gp": await viewGP(a, b); break;
      case "squadre": viewSquadre(a); break;
      case "formazione": await viewFormazione(); break;
      case "calendario": viewCalendario(); break;
      case "regolamento": viewRegolamento(); break;
      default: await viewHome();
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card pad"><div class="alert ko">Errore: ${esc(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- tema */
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(lsGet("fm_theme"));
document.getElementById("theme-btn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const t = dark ? "light" : "dark";
  lsSet("fm_theme", t);
  applyTheme(t);
  if (location.hash.startsWith("#/classifica")) route();
});

/* ---------------------------------------------------------------- avvio */
(async function init() {
  try {
    [S.league, S.standings, S.season, S.config] = await Promise.all([
      getJSON("data/league.json"), getJSON("data/standings.json"),
      getJSON("data/season.json"), getJSON("data/config.json").catch(() => ({}))]);
  } catch (e) {
    view.innerHTML = `<div class="card pad"><div class="alert ko">Impossibile caricare i dati (${esc(e.message)}).</div></div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
