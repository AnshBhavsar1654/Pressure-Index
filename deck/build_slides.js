// Builds the hackathon slide deck (a single self-contained HTML file) from the dashboard's data files, so every
// number on a slide is the number the analysis produced.      node deck/build_slides.js
// Style: Swiss Modern (white grid, Archivo + Nunito, one red-pink accent), fixed 1920x1080 stage.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", f), "utf8"));
const S = read("summary.json");
const BAT = read("batters.json");
const BOWL = read("bowlers.json");
const RR = read("rr2026.json");
const EX = read("example.json");
const OUT = path.join(ROOT, "Pressure_Index_RR_2027_slides.html");
const VIEWPORT_CSS = fs.readFileSync(path.join(__dirname, "viewport-base.css"), "utf8");
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "analysis", "nationality_overrides.json"), "utf8")).overrides;

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sg = (n, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d);
const int = (n) => Math.round(n).toLocaleString("en-US");
const f2 = (n) => (Math.abs(n) < 0.005 ? "0.00" : n.toFixed(2).replace("-", "−"));
const pct = (x) => `${Math.round(x * 100)}%`;
const pts = (w) => (Math.round(w * 100) === 0 ? "0" : sg(w * 100, 0)) + " pts";
const chance = (p) => (p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
const nat = (p) => overrides[p.name] || p.country || (p.ipl_team ? "India" : "");
const ranked = (D) => D.players.filter((p) => p.rank != null).sort((a, b) => a.rank - b.rank);
const top10 = (D) => ranked(D).slice(0, 10);
const find = (D, name) => D.players.find((p) => p.name === name);
const E = BAT.eligibility;

// the same rules as the picks page (web/src/app/picks/page.tsx)
const topIds = new Set([...top10(BAT), ...top10(BOWL)].map((p) => p.id));
const emerging = (D) =>
  D.players
    .filter((p) => p.emerging && !topIds.has(p.id) && (p.excluded == null || p.excluded === "dips") && p.delta100 >= 0 && p.p_eff >= 25 && p.p_matches >= 2 && p.r_eff >= 10)
    .sort((a, b) => b.p_rv100 - a.p_rv100)
    .slice(0, 5);
const total = (p) => (p ? p.p_balls + p.n_balls : 0);
const indianOptions = () => {
  const out = [];
  for (const [role, D, O] of [["bat", BAT, BOWL], ["bowl", BOWL, BAT]]) {
    const other = new Map(O.players.map((p) => [p.id, p]));
    for (const p of D.players)
      if (p.indian && p.excluded == null && !topIds.has(p.id) && p.ipl_season === 2026 && p.delta100 >= 0 && p.p_rv100 >= -1 &&
          p.p_eff >= E.indian_min[0] && p.p_matches >= E.indian_min[1] && total(p) >= total(other.get(p.id)))
        out.push({ p, role });
  }
  return out.sort((a, b) => b.p.p_rv100 - a.p.p_rv100);
};
const targets = new Set(RR.recommendations.map((r) => r.gap.key));
const SLOT = { bat_powerplay: "Opener", bat_middle: "Middle order", bat_death: "Finisher", bowl_powerplay: "New-ball bowler", bowl_middle: "Middle-overs bowler", bowl_death: "Death bowler" };
function fit(p, role) {
  const ph = p.phases.filter((x) => x.balls >= 30 && x.rv100 != null).sort((a, b) => b.rv100 - a.rv100);
  if (!ph.length) return null;
  const key = `${role}_${ph[0].phase.toLowerCase()}`;
  if (targets.has(key)) return key;
  const o = ph.slice(1).find((x) => targets.has(`${role}_${x.phase.toLowerCase()}`) && x.rv100 > 0);
  return o ? `${role}_${o.phase.toLowerCase()}` : null;
}
function moment(D, name, date) {
  const p = find(D, name);
  const m = p && p.matches.find((x) => x.date.startsWith(date));
  if (!m) return null;
  const mo = p.moments.find((x) => x.id === m.id);
  const place = [...p.matches].sort((a, b) => b.wpa - a.wpa).findIndex((x) => x.id === m.id) + 1;
  return { p, m, mo, place };
}
const funnel = (D) => {
  const q = D.players.filter((p) => p.merit_rank != null);
  const c = (k) => q.filter((p) => p.excluded === k).length;
  return { qualified: q.length, notBuyable: c("retained") + c("rr") + c("pakistan") + c("retired") + c("unavailable"), inactive: c("inactive"), dips: c("dips"), ranked: q.filter((p) => p.rank != null).length };
};

// ------------------------------------------------------------------ slide parts
let page = 0;
const N_SLIDES = 17;
function slide(section, body, cls = "") {
  page += 1;
  return `
<section class="slide ${cls}" aria-label="Slide ${page}">
  <div class="grid" aria-hidden="true">${"<span></span>".repeat(12)}</div>
  <header class="chrome reveal"><span><b>Pressure Index</b> · ${esc(section)}</span><span>SupeRR Selector Season 2 · Round 1</span></header>
  ${body}
  <footer class="foot"><span>Ansh Bhavsar</span><span>${String(page).padStart(2, "0")} / ${N_SLIDES}</span></footer>
</section>`;
}
const h = (kicker, title) => `<div class="kicker reveal">${esc(kicker)}</div><h2 class="title reveal">${title}</h2>`;
const bullets = (items, cls = "") => `<ul class="bul ${cls}">${items.filter(Boolean).map((i) => `<li>${i}</li>`).join("")}</ul>`;
const stat = (v, l, red = false) => `<div class="stat"><b class="${red ? "red" : ""}">${v}</b><span>${l}</span></div>`;

function topTable(D, role) {
  const rows = top10(D)
    .map((p) => `<tr><td class="rk">${p.rank}</td><td class="nm">${esc(p.name)}${p.indian ? ' <i class="tag">IND</i>' : ""}${p.emerging ? ' <i class="tag gold">U26</i>' : ""}</td><td class="ct">${esc(nat(p))}</td><td class="n strong">${sg(p.p_rv100)}</td><td class="n">${pct(p.boot.p_top10)}</td></tr>`)
    .join("");
  return `<table class="tbl compact"><thead><tr><th>#</th><th>${role === "bat" ? "Batter" : "Bowler"}</th><th>Country</th><th class="n">Rating</th><th class="n">Top 10</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function evidenceTable(D, role) {
  const rows = top10(D)
    .map((p) => {
      const rate = role === "bat" ? `${p.press.sr?.toFixed(0)} <em>/ ${p.press.par_sr?.toFixed(0)}</em>` : `${p.press.econ?.toFixed(2)} <em>/ ${p.press.par_econ?.toFixed(2)}</em>`;
      return `<tr><td class="rk">${p.rank}</td><td class="nm">${esc(p.name)}</td><td class="n strong">${sg(p.p_rv100)}</td><td class="n">${sg(p.n_rv100)}</td><td class="n red">${sg(p.delta100)}</td><td class="n">${rate}</td><td class="n">${pts(p.wpa100)}</td><td class="n">${p.p_balls}</td><td class="n">${p.boot.rank_lo}–${p.boot.rank_hi}</td><td class="n">${pct(p.boot.p_top10)}</td></tr>`;
    })
    .join("");
  const rateHead = role === "bat" ? "SR / avg batter" : "Econ / avg bowler";
  return `<table class="tbl"><thead><tr><th>#</th><th>${role === "bat" ? "Batter" : "Bowler"}</th><th class="n">Rating</th><th class="n">Usual</th><th class="n">Lift</th><th class="n">${rateHead}</th><th class="n">Win impact</th><th class="n">Pressure balls</th><th class="n">Likely rank</th><th class="n">Top 10</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function barChart(rows, { w = 760, rowH = 54, max } = {}) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.v))) * 1.1;
  const mid = 300, span = w - mid - 90;
  const body = rows
    .map((r, i) => {
      const y = i * rowH + 8;
      const len = (Math.abs(r.v) / m) * span;
      const x = r.v >= 0 ? mid : mid - len;
      return `<text x="${mid - 16 - (r.v < 0 ? len : 0)}" y="${y + 30}" text-anchor="end" class="bl">${esc(r.label)}</text>
<rect x="${x}" y="${y + 8}" width="${Math.max(len, 2)}" height="${rowH - 22}" class="${r.v >= 0 ? "bpos" : "bneg"}"/>
<text x="${r.v >= 0 ? mid + len + 12 : mid + 12}" y="${y + 30}" class="bv">${sg(r.v)}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${rows.length * rowH + 16}" width="${w}" height="${rows.length * rowH + 16}" class="chart"><line x1="${mid}" y1="0" x2="${mid}" y2="${rows.length * rowH + 16}" class="axis"/>${body}</svg>`;
}

// ------------------------------------------------------------------ the slides
const c = S.contrast;
const fb = funnel(BAT), fw = funnel(BOWL);
const ex = EX.steps, ball = EX.ball;
const jad = moment(BAT, "Ravindra Jadeja", "2023-05-29");
const rin = moment(BAT, "Rinku Singh", "2023-04-09");
const tus = moment(BOWL, "Tushar Deshpande", "2026-04-04");
const em = { bat: emerging(BAT), bowl: emerging(BOWL) };
const ind = indianOptions();
const death = RR.phases.find((p) => p.phase === "Death");
const pp = RR.phases.find((p) => p.phase === "Powerplay");
const sl = RR.slots;
const pv = RR.provenance;
const public_ = S.public;
const solid = (D) => top10(D).filter((p) => p.boot.p_top10 >= 0.75).length;

const slides = [];

// 1. title
page += 1;
slides.push(`
<section class="slide title-slide" aria-label="Slide 1">
  <div class="grid" aria-hidden="true">${"<span></span>".repeat(12)}</div>
  <header class="chrome reveal"><span><b>Pressure Index</b> · SupeRR Selector Season 2</span><span>Round 1 · Rajasthan Royals</span></header>
  <div class="big-num reveal">20%</div>
  <h1 class="hero reveal">Who delivers when the match is <em>on the line?</em></h1>
  <p class="hero-sub reveal">The top 10 batters and bowlers under pressure, ranked ball by ball, and what RR should buy at the IPL 2027 auction.</p>
  <div class="hero-stats reveal">
    ${stat(int(S.n_balls), "deliveries, 2022–26")}
    ${stat(int(c.pressure.balls), "pressure balls")}
    ${stat(int(S.n_matches), "IPL and T20I matches")}
  </div>
  <div class="dot" aria-hidden="true"></div>
  <footer class="foot"><span>Ansh Bhavsar</span><span>01 / ${N_SLIDES}</span></footer>
</section>`);

// 2. the answer
slides.push(slide("The answer", `
  ${h("The submission", "Two top 10s: who delivers under pressure")}
  <div class="two">
    <div class="reveal">${topTable(BAT, "bat")}</div>
    <div class="reveal">${topTable(BOWL, "bowl")}</div>
  </div>
  <p class="note reveal"><b>Rating</b> = runs added (bat) or saved (ball) per 100 pressure balls against an average player in the same spot. <b>Top 10</b> = share of 400 re-runs on resampled matches in which he stays top 10. Ranked among players RR can buy at the 2027 auction who are active in 2026 and do not dip under pressure.</p>`));

// 3. method in four steps
const mo0 = S.moments[0];
slides.push(slide("The method", `
  ${h("Two questions for every ball since 2022", "How much was at stake, and how did the player do?")}
  <div class="steps">
    ${[
      ["01", "Who is winning?", `A model trained on all ${int(S.n_matches)} matches gives each side’s chance of winning before every ball. The last over of a chase is worked out exactly.`, `${esc(mo0.match)}: ${esc(mo0.state)}. Chasing side: <b>${pct(mo0.wp)}</b>`],
      ["02", "How much is at stake?", `Stakes = how far the next ball could move that chance (typical ball = 1×). Pressure ball = top 20% (≥ ${S.pressure_threshold.toFixed(2)}×) or any knockout ball.`, `That ball carried <b>${mo0.li.toFixed(0)}×</b> the stakes of a typical ball`],
      ["03", "How did he do?", "Runs added = runs scored − what an average batter scores from the same spot; a wicket costs the runs it takes away. Bowlers mirror it.", "Death overs: a four is about <b>+2.5</b>, a dot <b>−1.5</b>, a powerplay wicket <b>−10</b>"],
      ["04", "One rating per player", `Runs added per 100 pressure balls, leaning on his usual level until his record is long (half and half at ${S.K} balls). Each year back counts 20% less.`, `${esc(EX.name)}: ${sg(ex.p_raw100)} raw, usual ${sg(ex.n_rv100)} → <b>${sg(ex.rating100)}</b>`],
    ]
      .map(([n, t, d, e]) => `<div class="step reveal"><div class="sn">${n}</div><h3>${t}</h3><p>${d}</p><div class="ex">${e}</div></div>`)
      .join("")}
  </div>`));

// 4. pressure definition and proof
const phaseRows = ["Powerplay", "Middle", "Death"].map((ph) => ({
  ph, a: S.by_phase.find((r) => r.innings === 1 && r.phase === ph).pressure_share, b: S.by_phase.find((r) => r.innings === 2 && r.phase === ph).pressure_share,
}));
const shareBars = phaseRows
  .map((r, i) => {
    const y = i * 96;
    return `<text x="0" y="${y + 40}" class="bl2">${r.ph === "Middle" ? "Middle overs" : r.ph}</text>
<rect x="220" y="${y + 14}" width="${r.a * 9}" height="30" class="bfirst"/><text x="${228 + r.a * 9}" y="${y + 38}" class="bv">${r.a.toFixed(0)}%</text>
<rect x="220" y="${y + 50}" width="${r.b * 9}" height="30" class="bpos"/><text x="${228 + r.b * 9}" y="${y + 74}" class="bv">${r.b.toFixed(0)}%</text>`;
  })
  .join("");
slides.push(slide("1 · What counts as pressure", `
  ${h("1 · Pressure definition", "Pressure is where the next ball can swing the result")}
  <div class="split">
    <div class="reveal">
      ${bullets([
        `<b>Pressure ball:</b> the top 20% of balls by stakes (≥ ${S.pressure_threshold.toFixed(2)}× a typical ball), plus every knockout ball`,
        "<b>Why stakes:</b> it combines required rate, wickets, balls left, the target and how close the game is in one number",
        "<b>A dead chase is not pressure</b>, however dramatic it looks: the chance barely moves",
        `<b>Rain:</b> revised targets used; ${S.n_short_excluded} matches under ${S.min_match_balls / 6} overs a side left out`,
      ])}
      <div class="stats3">
        ${stat(c.pressure.wkt_pct.toFixed(1), `wickets / 100 balls under pressure, vs ${c.normal.wkt_pct.toFixed(1)}`, true)}
        ${stat(c.pressure.extras_pct.toFixed(1) + "%", `wides and no-balls, vs ${c.normal.extras_pct.toFixed(1)}%`, true)}
        ${stat(int(c.pressure.balls), `pressure balls of ${int(S.n_balls)}`)}
      </div>
    </div>
    <div class="panel reveal">
      <h4>Share of balls that are pressure balls</h4>
      <div class="legend"><span><i class="sw first"></i>Batting first</span><span><i class="sw pos"></i>Chasing</span></div>
      <svg viewBox="0 0 760 300" width="760" height="300" class="chart">${shareBars}</svg>
      <p class="cap">Chases hold most pressure moments, because a target makes every ball count. A knockout makes every ball count in both innings.</p>
    </div>
  </div>`));

// 5. moments
const mcards = [
  jad && { t: "Ravindra Jadeja, IPL final 2023", s: `${jad.mo.headline}: a six and a four off the last two balls`, v: `CSK ${chance(jad.mo.wp_from)} → won. ${jad.m.li.toFixed(0)}× typical stakes, ${pts(jad.m.wpa)} of win chance: his biggest of ${jad.p.matches.length} pressure matches` },
  rin && { t: "Rinku Singh v Gujarat Titans, 2023", s: `${rin.mo.headline}: five sixes in a row`, v: `KKR ${chance(rin.mo.wp_from)} → won. ${pts(rin.m.wpa)} of win chance, ${ord(rin.place)} of his ${rin.p.matches.length} pressure matches` },
  tus && { t: "Tushar Deshpande v Gujarat Titans, 2026", s: `${tus.mo.headline}`, v: `RR ${chance(tus.mo.wp_from)} → won. ${pts(tus.m.wpa)} of win chance, ${ord(tus.place)} of his ${tus.p.matches.length} pressure matches` },
].filter(Boolean);
const eg = S.wp_model.endgame.rows.slice(0, 4);
slides.push(slide("1 · Does it find the right moments?", `
  ${h("1 · Checked against memory", "It finds the moments anyone would name")}
  <div class="cards3">
    ${mcards.map((m) => `<div class="card reveal"><h3>${esc(m.t)}</h3><p>${esc(m.s)}</p><div class="verdict">${esc(m.v)}</div></div>`).join("")}
  </div>
  <div class="panel reveal wide">
    <h4>The last over of a chase, worked out exactly (how often the chasing side really won)</h4>
    <table class="tbl small"><thead><tr><th>Situation</th><th class="n">Matches</th><th class="n">Actually won</th><th class="n">Smooth model</th><th class="n">Exact last over</th></tr></thead>
    <tbody>${eg.map((r) => `<tr><td>${esc(r.situation)}</td><td class="n">${r.n}</td><td class="n strong">${pct(r.actual)}</td><td class="n">${pct(r.old)}</td><td class="n red">${pct(r.new)}</td></tr>`).join("")}</tbody></table>
  </div>`));

// 6. measurement + worked example
slides.push(slide("2 · Measuring performance", `
  ${h("2 · Performance measurement", "One formula, set against his usual level")}
  <div class="split">
    <div class="reveal">
      <div class="formula">rating = (Σ recency × runs added on pressure balls + ${S.K} × usual level) ÷ (Σ recency + ${S.K})</div>
      ${bullets([
        "<b>Runs added</b> per ball: runs − expected runs from that spot − wicket cost; bowlers mirror it (byes not charged, run-outs not credited)",
        "<b>Usual level:</b> the same sum on every other ball: the baseline the brief asks for",
        `<b>${S.K} balls:</b> a short record leans on the usual level, so a hot streak cannot top the list`,
        "<b>Lift</b> = rating − usual level: does he rise or dip?",
        "Recency: 2026 = 1.0, each year back 20% less (2022 = 0.2)",
      ])}
    </div>
    <div class="panel reveal">
      <h4>Worked by hand: ${esc(EX.name)}, the No. 1 batter</h4>
      <table class="tbl small calc"><tbody>
        <tr><td>One ball: ${esc(ball.match)}, ${esc(ball.over)}, ${ball.need} needed off ${ball.balls_left}</td><td class="n">${ball.stakes}× stakes</td></tr>
        <tr><td>Hit ${ball.runs}, average batter makes ${ball.expected.toFixed(2)} from there</td><td class="n">${sg(ball.rv, 2)} runs added</td></tr>
        <tr><td>All ${int(ex.p_balls)} pressure balls (weighted ${ex.p_weighted})</td><td class="n">${sg(ex.p_sum)} runs → ${sg(ex.p_raw100)} / 100</td></tr>
        <tr><td>Usual level on ${int(ex.n_balls)} other balls</td><td class="n">${sg(ex.n_rv100)} / 100</td></tr>
        <tr><td>His own record’s share: ${ex.p_weighted} ÷ (${ex.p_weighted} + ${ex.K})</td><td class="n">${pct(ex.share)}</td></tr>
        <tr class="hl"><td>Pressure rating</td><td class="n">${sg(ex.rating100)}</td></tr>
        <tr><td>Lift (rating − usual)</td><td class="n red">${sg(ex.lift100)}</td></tr>
        <tr><td>Stays top 10 in 400 re-runs</td><td class="n">${pct(EX.boot.p_top10)}</td></tr>
      </tbody></table>
      <p class="cap">A script rebuilds these sums from the raw data and checks them against the published rating.</p>
    </div>
  </div>`));

// 7. fair comparisons
slides.push(slide("3 · Fair comparisons", `
  ${h("3 · Fair comparisons", "Same situation, same yardstick, for every player")}
  <div class="cards3 six">
    ${[
      ["Sample size", `${E.min_pressure_balls}+ pressure balls in ${E.min_pressure_matches}+ matches, ${E.min_recent_balls}+ in 2025–26. Short records lean on the usual level.`],
      ["Indian players", `A third of the bar (${E.indian_min[0]} balls, ${E.indian_min[1]} matches, ${E.indian_min[2]} recent): the pack has no domestic cricket, only the IPL.`],
      ["IPL and T20I together", `Only top-level cricket: the IPL and T20Is between full members (${int(S.n_top_level_matches)} matches). Each competition and season is its own average.`],
      ["Pitches and opponents", "T20Is recentred by host country and opponent each season: Bangladesh T20Is go at 7.9 an over, others 8.7."],
      ["Batting first", "Knockout first-innings balls are pressure balls but count half: the other side still has to bat."],
      ["Built for 2027", "2026 counts in full, each year back 20% less. Nobody is marked down for age; 35+ is flagged as a short-term buy."],
    ]
      .map(([t, d]) => `<div class="card reveal"><h3>${t}</h3><p>${d}</p></div>`)
      .join("")}
  </div>`));

// 8. funnel
const fRow = (label, b, w, red) => `<tr${red ? ' class="hl"' : ""}><td>${label}</td><td class="n">${b}</td><td class="n">${w}</td></tr>`;
slides.push(slide("3 · From every player to the shortlist", `
  ${h("3 · Eligibility and selection", "From every player to the 20 picks")}
  <div class="split">
    <div class="panel reveal">
      <table class="tbl funnel"><thead><tr><th></th><th class="n">Batters</th><th class="n">Bowlers</th></tr></thead><tbody>
        ${fRow("Rated (every top-level player)", int(BAT.eligibility.n_players), int(BOWL.eligibility.n_players))}
        ${fRow("Clear the evidence bar", fb.qualified, fw.qualified)}
        ${fRow("− not in the auction (retained, at RR, retired, banned, Pakistani)", "−" + fb.notBuyable, "−" + fw.notBuyable)}
        ${fRow("− no top-level cricket in 2026", "−" + fb.inactive, "−" + fw.inactive)}
        ${fRow("− dip under pressure (negative lift)", "−" + fb.dips, "−" + fw.dips)}
        ${fRow("Ranked candidates RR can buy", fb.ranked, fw.ranked, true)}
      </tbody></table>
    </div>
    <div class="reveal">
      ${bullets([
        "<b>Order:</b> by pressure rating alone. Win impact and consistency are shown as evidence, not blended in: blending made forecasts worse",
        `<b>Indian places:</b> each above-average Indian is guaranteed a top-10 place (up to ${E.indian_places})${sl ? `: RR have ${sl.open_overseas} overseas places left` : ""}. Never a below-average player`,
        `<b>Bangladesh:</b> at most ${E.max_bangladesh} per list (board release, NOC)`,
        "<b>Active in 2026:</b> an auction buys 2027 form, so a player unseen at top level in 2026 is not picked",
        "<b>No dip:</b> the brief asks who rises; a player worse under pressure than usual is never picked",
      ])}
    </div>
  </div>`));

// 9 / 10. evidence tables
slides.push(slide("4 · Evidence for the top 10", `
  ${h("4 · Evidence: batters", "Every pick adds runs and rises under pressure")}
  <div class="tbl-wrap reveal">${evidenceTable(BAT, "bat")}</div>
  <p class="note reveal"><b>Usual</b> = the same measure on other balls. <b>SR / avg batter</b> = raw strike rate under pressure against an average batter on the same balls. <b>Likely rank</b> = 9 in 10 re-runs land in this range. ${top10(BAT).filter((p) => p.emerging).map((p) => esc(p.name)).join(" and ")} are under 26 for 2027.</p>`));
slides.push(slide("4 · Evidence for the top 10", `
  ${h("4 · Evidence: bowlers", "Wickets and economy both count")}
  <div class="tbl-wrap reveal">${evidenceTable(BOWL, "bowl")}</div>
  <p class="note reveal"><b>Econ / avg bowler</b> = raw economy under pressure against an average bowler on the same balls (lower is better). Win impact can be negative for a good player: it depends on the matches he walked into, so it is evidence, not the order.</p>`));

// 11. reliability
const F = S.forward;
slides.push(slide("5 · Reliability", `
  ${h("5 · Reliability", "Every setting chosen by predicting next season")}
  <div class="split">
    <div class="panel reveal">
      <h4>Forward test: rate on earlier seasons, predict who adds runs under pressure next season</h4>
      <table class="tbl"><thead><tr><th>Ranking players by…</th><th class="n">Batters</th><th class="n">Bowlers</th></tr></thead><tbody>
        <tr class="hl"><td>The pressure rating (this method)</td><td class="n">${f2(F.bat.rating)}</td><td class="n">${f2(F.bowl.rating)}</td></tr>
        <tr><td>Usual level alone</td><td class="n">${f2(F.bat.normal)}</td><td class="n">${f2(F.bowl.normal)}</td></tr>
        <tr><td>Lift alone</td><td class="n">${f2(F.bat.lift)}</td><td class="n">${f2(F.bowl.lift)}</td></tr>
        <tr><td>Win impact alone</td><td class="n">${f2(F.bat.wpa100)}</td><td class="n">${f2(F.bowl.wpa100)}</td></tr>
      </tbody></table>
      <p class="cap">Correlation with next season’s runs added per pressure ball, pooled over 2025 and 2026 (${F.bat.n} batters, ${F.bowl.n} bowlers). 0 = no better than guessing.</p>
    </div>
    <div class="reveal">
      ${bullets([
        "<b>Bowlers:</b> the rating is the best predictor, beating usual level and lift alone",
        "<b>Batters:</b> usual level predicts slightly better, which is why the rating leans on it until the record is long",
        `<b>“Clutch” is real but small:</b> lift repeats weakly between odd and even matches (${f2(BAT.split_half.lift)} batting, ${f2(BOWL.split_half.lift)} bowling), so it is a filter, not a score`,
        `<b>Stress test:</b> 400 re-runs on resampled matches; ${solid(BAT)} batters and ${solid(BOWL)} bowlers stay top 10 in 75%+ of them`,
        `<b>Win model:</b> chase AUC ${S.wp_model["2"].auc}, validated out of fold by match`,
        "<b>Reproducible:</b> a rerun of the pipeline gives byte-identical results",
      ])}
    </div>
  </div>`));

// 12. limits
const close = (D) => top10(D).filter((p) => p.boot.p_top10 < 0.65).map((p) => `${esc(p.name)} (${pct(p.boot.p_top10)})`);
slides.push(slide("5 · Limits", `
  ${h("5 · Where it is less certain", "Honest limits, and the close calls")}
  <div class="cards3">
    <div class="card reveal"><h3>What the data cannot see</h3>${bullets(["Fielding, pitch reports, batter-v-bowler match-ups", "Injuries and form outside these matches", "Domestic T20 (public SMAT record too patchy to rate fairly)", "The 2022 and 2024 T20 World Cups"])}</div>
    <div class="card reveal"><h3>Modelling choices</h3>${bullets(["First-innings pressure is harder to measure, so pressure balls lean towards chases", "Batting under pressure is hard to predict at all (forward test " + f2(F.bat.rating) + ")", "Lift is a filter, because it repeats only weakly"])}</div>
    <div class="card reveal"><h3>Close calls (top 10 in under 65% of re-runs)</h3>${bullets([...close(BAT).map((x) => "Bat: " + x), ...close(BOWL).map((x) => "Ball: " + x)])}<p class="cap">A Bangladeshi player’s confidence is lower because another can take the one place the board-release rule allows.</p></div>
  </div>`));

// 13. RR diagnosis
const gapRows = ["Powerplay", "Middle", "Death"].flatMap((ph) => ["bat", "bowl"].map((d) => {
  const g = RR.gaps.find((x) => x.phase === ph && x.discipline === d);
  return { label: `${ph === "Middle" ? "Middle overs" : ph} ${d === "bat" ? "batting" : "bowling"}`, v: g.gap_vs_avg, rank: g.rank };
}));
const leaks = RR.gaps.filter((g) => g.gap_vs_avg < 0).reduce((a, g) => a + g.gap_vs_avg, 0);
slides.push(slide("RR in IPL 2026", `
  ${h(`Rajasthan Royals in IPL 2026 · ${esc(RR.summary.playoff_result)}`, `${ord(RR.summary.pos)} in the league, ${RR.summary.won} wins from ${RR.summary.played}`)}
  <div class="split">
    <div class="panel reveal">
      <h4>Runs a match won (+) or lost (−) against an average side, by phase</h4>
      ${barChart(gapRows, { w: 760, rowH: 58 })}
    </div>
    <div class="reveal">
      ${bullets([
        `<b>Best in the league:</b> powerplay batting (${ord(pp.bat_rank)} of 10)`,
        `<b>The death overs:</b> ${ord(death.bat_rank)} of 10 batting, ${ord(death.bowl_rank)} of 10 bowling`,
        `<b>Leaks:</b> about ${Math.abs(leaks).toFixed(0)} runs a match in all`,
        `<b>Roles to fill:</b> ${RR.recommendations.map((r) => r.role.toLowerCase()).join(", ")}`,
        `<b>Checked:</b> ${pv.checks_passed} of ${pv.checks.length} season figures match the public record exactly`,
      ])}
      <div class="stats3">${stat(sl ? sl.open : "–", "squad places open")}${stat(sl ? sl.open_overseas : "–", "overseas places open", true)}${stat(sl ? sl.retained : "–", "players retained")}</div>
    </div>
  </div>`));

// 14. RR plan
const fills = (D, role) => top10(D).map((p) => ({ p, k: fit(p, role) })).filter((x) => x.k);
const planCol = (D, role) => {
  const f = fills(D, role);
  const byKey = {};
  for (const x of f) (byKey[x.k] ||= []).push(x.p.name);
  return Object.entries(byKey).map(([k, ns]) => `<div class="gap"><span class="gk">${SLOT[k]}</span><span>${ns.map(esc).join(", ")}</span></div>`).join("") || '<p class="cap">None of the ten is strongest in a gap phase.</p>';
};
slides.push(slide("RR auction plan", `
  ${h("The IPL 2027 auction plan", "Fix RR’s weak phases first")}
  <div class="two">
    <div class="panel reveal"><h4>Batters who fill a gap</h4>${planCol(BAT, "bat")}<p class="cap">Strongest under pressure in a phase where RR lost runs or trailed the other playoff sides.</p></div>
    <div class="panel reveal"><h4>Bowlers who fill a gap</h4>${planCol(BOWL, "bowl")}<p class="cap">Strongest phase needs 30+ pressure balls to count.</p></div>
  </div>
  ${bullets([
    `<b>Overseas places are the constraint</b> (${sl ? sl.open_overseas : "few"} left): ${top10(BAT).concat(top10(BOWL)).filter((p) => p.indian).map((p) => esc(p.name)).join(" and ")} are Indian, the rest compete for those slots`,
    `<b>Short-term buys:</b> ${top10(BAT).concat(top10(BOWL)).filter((p) => p.born && 2027 - Number(String(p.born).slice(0, 4)) >= 35).map((p) => esc(p.name)).join(", ") || "none"} are 35+ in 2027`,
  ], "reveal")}`));

// 15. beyond the top 10
const emList = (ps) => ps.map((p, i) => `<li><b>E${i + 1}</b> ${esc(p.name)} <span>${esc(nat(p))} · ${sg(p.p_rv100)}, lift ${sg(p.delta100)}</span></li>`).join("");
slides.push(slide("Beyond the top 10", `
  ${h("Beyond the top 10", "Players to buy alongside the top 10")}
  <div class="cards3">
    <div class="card reveal"><h3>Emerging batters</h3><p class="cap">Under 26 for 2027, half the bar (25 pressure balls, 2 matches, 10 recent), no dip</p><ol class="plist">${emList(em.bat)}</ol></div>
    <div class="card reveal"><h3>Emerging bowlers</h3><p class="cap">Same rule, best rating first</p><ol class="plist">${emList(em.bowl)}</ol></div>
    <div class="card reveal"><h3>Indian options</h3><p class="cap">Retentions took most above-average Indians. Next best: in an IPL 2026 squad, ${E.indian_min[0]}+ pressure balls, no dip, rating −1 or better</p><ol class="plist">${ind.map(({ p, role }, i) => `<li><b>I${i + 1}</b> ${esc(p.name)} <span>${role === "bat" ? "bat" : "ball"} · ${sg(p.p_rv100)}, lift ${sg(p.delta100)}</span></li>`).join("")}</ol></div>
  </div>`));

// 16. data used
slides.push(slide("Data used", `
  ${h("Data used", "The official pack, plus one public tournament")}
  <div class="cards3">
    <div class="card reveal"><h3>Taken as is: the data pack</h3>${bullets(["<b>ball_by_ball</b>: every delivery: state, pressure, runs added", "<b>matches</b>: knockouts, rain targets, venue country, results", "<b>competitions</b>: IPL or T20I, season, top level", "<b>squad mapping</b>: nationality, IPL team, RR squad", "<b>playing XIs</b>: roles of RR’s retained players"])}</div>
    <div class="card reveal"><h3>Blended in: public data</h3>${bullets([public_ ? `<b>${esc(public_.name)}</b>: ${public_.matches} matches, ${int(public_.balls)} balls from Cricsheet (CC BY)` : "", "Converted into the pack’s own format", "Players matched to pack ids ball by ball on shared matches, then by name within a country", "Treated exactly like any other T20I"])}</div>
    <div class="card reveal"><h3>Public facts for selection only</h3>${bullets(["IPL 2027 retention lists (17 Nov 2026)", "Retired and banned players", "Birth dates (Emerging label only)", "Nationality fixes for players with no T20I", `RR 2026 figures checked: ${pv.checks_passed}/${pv.checks.length} exact`])}</div>
  </div>`));

// 17. close
slides.push(slide("Summary", `
  ${h("In one slide", "A rating built for pressure, picks built for RR")}
  <div class="two">
    <div class="reveal">${bullets([
      `<b>Pressure</b> = top 20% of balls by how far the next ball could swing the result, plus knockouts`,
      "<b>Performance</b> = runs added against an average player in the same spot, wickets priced in",
      `<b>Rating</b> leans on the usual level until the record is long; ranked only if active, buyable and not dipping`,
      `<b>Checked</b> by a forward test, 400 re-runs, known moments and a public-record audit`,
    ])}</div>
    <div class="panel reveal">
      <h4>Submitted top 10s</h4>
      <div class="mini2">
        <ol>${top10(BAT).map((p) => `<li>${esc(p.name)}</li>`).join("")}</ol>
        <ol>${top10(BOWL).map((p) => `<li>${esc(p.name)}</li>`).join("")}</ol>
      </div>
    </div>
  </div>`));

if (page !== N_SLIDES) throw new Error(`slide count ${page} != ${N_SLIDES}`);

// ------------------------------------------------------------------ page
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pressure Index: SupeRR Selector Season 2</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
/* ===========================================
   THEME: Swiss Modern. Change these to restyle the deck.
   =========================================== */
:root {
  --stage-bg: #111;
  --slide-bg: #fafaf7;
  --ink: #0d0d0d;
  --ink-2: #333;
  --muted: #6b6b66;
  --red: #e6175c;
  --red-soft: #fde7ef;
  --gold: #b07d0c;
  --rule: #d9d8d2;
  --panel: #f1f0ea;
  --font-display: 'Archivo', sans-serif;
  --font-body: 'Nunito', sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}
* { margin: 0; padding: 0; box-sizing: border-box; }

/* === FIXED STAGE (viewport-base.css, included in full) === */
${VIEWPORT_CSS}

/* === SLIDE FRAME === */
.slide { font-family: var(--font-body); color: var(--ink); }
.grid { position: absolute; inset: 0 96px; display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; pointer-events: none; }
.grid span { border-left: 1px solid var(--rule); opacity: .45; }
.chrome { position: absolute; left: 96px; right: 96px; top: 56px; display: flex; justify-content: space-between; font: 600 20px var(--font-body); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.chrome b { color: var(--ink); font-weight: 700; }
.foot { position: absolute; left: 96px; right: 96px; bottom: 44px; display: flex; justify-content: space-between; border-top: 1px solid var(--ink); padding-top: 14px; font: 600 20px var(--font-body); }
.kicker { position: absolute; left: 96px; top: 124px; font: 800 22px var(--font-display); color: var(--red); letter-spacing: .06em; text-transform: uppercase; }
.title { position: absolute; left: 96px; top: 160px; width: 1728px; font: 900 66px/1.02 var(--font-display); letter-spacing: -.025em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* === CONTENT AREA (everything below the title sits between y=300 and y=980) === */
.two, .split, .steps, .cards3, .tbl-wrap { position: absolute; left: 96px; right: 96px; top: 300px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; }
.split { display: grid; grid-template-columns: 1fr 820px; gap: 64px; align-items: start; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px; }
.cards3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.cards3.six { grid-template-rows: auto auto; }
.panel { background: var(--panel); border-radius: 6px; padding: 28px 32px; }
.panel.wide { position: absolute; left: 96px; right: 96px; top: 640px; padding: 22px 32px; }
.panel h4 { font: 800 24px var(--font-display); margin-bottom: 16px; }
.card { border-top: 6px solid var(--ink); padding-top: 20px; }
.card h3 { font: 800 30px/1.1 var(--font-display); margin-bottom: 12px; letter-spacing: -.01em; }
.card p { font-size: 25px; line-height: 1.38; color: var(--ink-2); }
.cards3 > .card:nth-child(3n+1) { border-color: var(--red); }
.verdict { margin-top: 16px; background: var(--red-soft); padding: 16px 18px; border-radius: 4px; font: 600 23px/1.35 var(--font-body); }
.cap { font-size: 21px; line-height: 1.4; color: var(--muted); margin-top: 14px; }
.note { position: absolute; left: 96px; right: 96px; bottom: 112px; font-size: 22px; line-height: 1.4; color: var(--muted); }
.note b { color: var(--ink); }

/* === BULLETS === */
.bul { list-style: none; display: flex; flex-direction: column; gap: 16px; }
.bul li { position: relative; padding-left: 30px; font-size: 26px; line-height: 1.36; color: var(--ink-2); }
.bul li::before { content: ''; position: absolute; left: 0; top: 13px; width: 12px; height: 12px; background: var(--red); }
.bul li b { color: var(--ink); }
.slide > .bul { position: absolute; left: 96px; right: 96px; top: 760px; }
.card .bul li { font-size: 24px; }

/* === STATS === */
.stat { border-top: 4px solid var(--ink); padding-top: 12px; }
.stat b { display: block; font: 800 60px/1 var(--font-display); letter-spacing: -.02em; }
.stat b.red { color: var(--red); }
.stat span { display: block; margin-top: 6px; font: 600 19px/1.3 var(--font-body); color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.stats3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 40px; }

/* === STEPS === */
.step { border-top: 6px solid var(--ink); padding-top: 18px; display: flex; flex-direction: column; gap: 14px; }
.step:nth-child(2) { border-color: var(--red); }
.sn { font: 900 76px/0.9 var(--font-display); color: var(--red); }
.step h3 { font: 800 32px var(--font-display); }
.step p { font-size: 25px; line-height: 1.42; color: var(--ink-2); min-height: 200px; }
.ex { background: var(--panel); padding: 16px 18px; border-radius: 4px; font-size: 22px; line-height: 1.4; }

/* === TABLES === */
.tbl { width: 100%; border-collapse: collapse; font-size: 24px; }
.tbl th { text-align: left; font: 700 18px var(--font-body); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 10px 12px; border-bottom: 2px solid var(--ink); }
.tbl td { padding: 11px 12px; border-bottom: 1px solid var(--rule); }
.tbl .n { text-align: right; font-variant-numeric: tabular-nums; }
.tbl .rk { font: 900 30px var(--font-display); color: var(--red); width: 56px; }
.tbl .nm { font-weight: 700; }
.tbl .ct { color: var(--muted); }
.tbl .strong { font-weight: 800; }
.tbl .red { color: var(--red); font-weight: 700; }
.tbl em { font-style: normal; color: var(--muted); }
.tbl.compact td { padding: 9px 12px; font-size: 25px; }
.tbl.small { font-size: 22px; }
.tbl.small td { padding: 8px 10px; }
.tbl tr.hl td { background: var(--red-soft); font-weight: 800; }
.tbl.funnel td { font-size: 25px; padding: 14px 12px; }
.tag { font-style: normal; font: 700 15px var(--font-body); padding: 2px 7px; border-radius: 3px; background: var(--red-soft); color: var(--red); vertical-align: 3px; }
.tag.gold { background: #fbf1d6; color: var(--gold); }

/* === FORMULA === */
.formula { font: 700 27px/1.4 var(--font-display); border-left: 8px solid var(--red); padding: 16px 22px; background: var(--panel); margin-bottom: 30px; }

/* === CHARTS === */
.chart text { font-family: var(--font-body); }
.bl { font-size: 22px; fill: var(--ink-2); }
.bl2 { font-size: 24px; fill: var(--ink); font-weight: 700; }
.bv { font-size: 22px; font-weight: 800; fill: var(--ink); }
.bpos { fill: var(--red); }
.bneg { fill: var(--ink); }
.bfirst { fill: #a7a59c; }
.axis { stroke: var(--ink); stroke-width: 2; }
.legend { display: flex; gap: 28px; font-size: 20px; color: var(--muted); margin-bottom: 14px; }
.sw { display: inline-block; width: 18px; height: 18px; margin-right: 8px; vertical-align: -3px; }
.sw.first { background: #a7a59c; } .sw.pos { background: var(--red); }

/* === RR PLAN === */
.gap { display: grid; grid-template-columns: 280px 1fr; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--rule); font-size: 25px; }
.gk { font: 800 24px var(--font-display); color: var(--red); }

/* === PLAYER LISTS === */
.plist { list-style: none; display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.plist li { font-size: 25px; font-weight: 700; display: grid; grid-template-columns: 54px 1fr; column-gap: 6px; }
.plist li b { color: var(--red); font-family: var(--font-display); }
.plist li span { grid-column: 2; font-weight: 400; font-size: 20px; color: var(--muted); }
.mini2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.mini2 ol { padding-left: 34px; font-size: 24px; line-height: 1.5; font-weight: 700; }
.mini2 ol li::marker { color: var(--red); font-family: var(--font-display); }

/* === TITLE SLIDE === */
.title-slide .big-num { position: absolute; left: 96px; top: 170px; font: 900 300px/0.8 var(--font-display); color: var(--red); letter-spacing: -.04em; }
.title-slide .hero { position: absolute; left: 96px; top: 450px; width: 1080px; font: 900 112px/0.94 var(--font-display); letter-spacing: -.035em; }
.title-slide .hero em { font-style: normal; color: var(--red); }
.title-slide .hero-sub { position: absolute; left: 96px; top: 820px; width: 1000px; font-size: 32px; line-height: 1.35; color: var(--ink-2); }
.title-slide .hero-stats { position: absolute; right: 96px; top: 190px; width: 520px; display: grid; gap: 28px; }
.title-slide .hero-stats .stat b { font-size: 76px; }
.title-slide .dot { position: absolute; right: 96px; bottom: 150px; width: 120px; height: 120px; border-radius: 50%; background: var(--red); }

/* === ANIMATIONS: staggered reveal on the visible slide === */
.reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s var(--ease), transform .7s var(--ease); }
.slide.visible .reveal { opacity: 1; transform: none; }
.slide.visible .reveal:nth-of-type(2) { transition-delay: .08s; }
.slide.visible .kicker { transition-delay: .05s; }
.slide.visible .title { transition-delay: .12s; }
.slide.visible .two > .reveal:nth-child(2), .slide.visible .split > .reveal:nth-child(2) { transition-delay: .3s; }
.slide.visible .steps > .reveal:nth-child(1), .slide.visible .cards3 > .reveal:nth-child(1) { transition-delay: .2s; }
.slide.visible .steps > .reveal:nth-child(2), .slide.visible .cards3 > .reveal:nth-child(2) { transition-delay: .3s; }
.slide.visible .steps > .reveal:nth-child(3), .slide.visible .cards3 > .reveal:nth-child(3) { transition-delay: .4s; }
.slide.visible .steps > .reveal:nth-child(4), .slide.visible .cards3 > .reveal:nth-child(4) { transition-delay: .5s; }
.slide.visible .cards3 > .reveal:nth-child(5) { transition-delay: .6s; }
.slide.visible .cards3 > .reveal:nth-child(6) { transition-delay: .7s; }

/* === CONTROLS (outside the slide design) === */
.progress { position: fixed; left: 0; top: 0; height: 4px; background: var(--red); z-index: 1001; transition: width .4s var(--ease); }
.deck-controls { display: flex; gap: 10px; align-items: center; font: 600 14px var(--font-body); color: #bbb; background: rgba(0,0,0,.55); padding: 8px 14px; border-radius: 999px; }
.deck-controls button { background: none; border: 0; color: #fff; font-size: 18px; cursor: pointer; padding: 0 6px; }

/* === EXPORT MODE (?export): no on-screen controls, used for PPTX/PDF capture === */
body.export .deck-controls, body.export .progress, body.export .edit-toggle { display: none !important; }

/* === INLINE EDITING === */
.edit-hotzone { position: fixed; top: 0; left: 0; width: 80px; height: 80px; z-index: 10000; cursor: pointer; }
.edit-toggle { position: fixed; top: 18px; left: 18px; z-index: 10001; opacity: 0; pointer-events: none; transition: opacity .3s; background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; font: 600 14px var(--font-body); cursor: pointer; }
.edit-toggle.show, .edit-toggle.active { opacity: 1; pointer-events: auto; }
.edit-toggle.active { background: var(--red); color: #fff; border-color: var(--red); }
body.editing [contenteditable="true"] { outline: 2px dashed rgba(230,23,92,.5); outline-offset: 4px; }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="edit-hotzone"></div>
<button class="edit-toggle" id="editToggle" title="Edit mode (E)">Edit</button>
<div class="deck-viewport">
<main class="deck-stage" id="deckStage">
${slides.join("\n")}
</main>
</div>
<nav class="deck-controls" aria-label="Slide navigation"><button id="prev" aria-label="Previous slide">‹</button><span id="count">1 / ${N_SLIDES}</span><button id="next" aria-label="Next slide">›</button></nav>
<script>
/* ===========================================
   SLIDE PRESENTATION CONTROLLER
   Arrows, Space, PageUp/PageDown, Home/End, mouse wheel, swipe.
   =========================================== */
class SlidePresentation {
  constructor() {
    this.slides = document.querySelectorAll('.slide');
    this.stage = document.getElementById('deckStage');
    this.current = 0;
    this.scale();
    window.addEventListener('resize', () => this.scale());
    document.addEventListener('keydown', (e) => {
      if (e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') return;
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); this.go(this.current + 1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); this.go(this.current - 1); }
      if (e.key === 'Home') this.go(0);
      if (e.key === 'End') this.go(this.slides.length - 1);
    });
    let lock = false;
    window.addEventListener('wheel', (e) => {
      if (lock || Math.abs(e.deltaY) < 30) return;
      lock = true; setTimeout(() => (lock = false), 700);
      this.go(this.current + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });
    let x0 = null;
    window.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    window.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) this.go(this.current + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    document.getElementById('prev').onclick = () => this.go(this.current - 1);
    document.getElementById('next').onclick = () => this.go(this.current + 1);
    const start = parseInt(location.hash.slice(1), 10);
    this.go(Number.isFinite(start) ? start - 1 : 0);
  }
  scale() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    this.stage.style.transform = 'translate(' + (innerWidth - 1920 * k) / 2 + 'px,' + (innerHeight - 1080 * k) / 2 + 'px) scale(' + k + ')';
  }
  go(i) {
    this.current = Math.max(0, Math.min(i, this.slides.length - 1));
    this.slides.forEach((s, j) => { s.classList.toggle('active', j === this.current); s.classList.toggle('visible', j === this.current); });
    document.getElementById('count').textContent = (this.current + 1) + ' / ' + this.slides.length;
    document.getElementById('progress').style.width = ((this.current + 1) / this.slides.length * 100) + '%';
    history.replaceState(null, '', '#' + (this.current + 1));
  }
}
if (location.search.includes('export')) document.body.classList.add('export');
const deck = new SlidePresentation();

/* ===========================================
   INLINE EDITING: hover the top-left corner or press E; Ctrl+S saves a copy.
   =========================================== */
const editor = {
  isActive: false,
  key: 'pressure-index-deck-edits',
  els() { return document.querySelectorAll('.slide h1, .slide h2, .slide h3, .slide h4, .slide p, .slide li, .slide td'); },
  toggleEditMode() {
    this.isActive = !this.isActive;
    document.body.classList.toggle('editing', this.isActive);
    document.getElementById('editToggle').classList.toggle('active', this.isActive);
    this.els().forEach((el) => el.setAttribute('contenteditable', this.isActive ? 'true' : 'false'));
    if (!this.isActive) this.save();
  },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify([...this.els()].map((el) => el.innerHTML))); } catch (e) {}
  },
  restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || 'null');
      const els = this.els();
      if (saved && saved.length === els.length) els.forEach((el, i) => (el.innerHTML = saved[i]));
    } catch (e) {}
  },
  download() {
    this.save();
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
    const blob = new Blob(['<!DOCTYPE html>\\n' + clone.outerHTML], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Pressure_Index_RR_2027_slides.html'; a.click();
  },
};
editor.restore();
const toggle = document.getElementById('editToggle');
const hotzone = document.querySelector('.edit-hotzone');
let hideTimeout = null;
toggle.addEventListener('click', () => editor.toggleEditMode());
hotzone.addEventListener('click', () => editor.toggleEditMode());
hotzone.addEventListener('mouseenter', () => { clearTimeout(hideTimeout); toggle.classList.add('show'); });
hotzone.addEventListener('mouseleave', () => { hideTimeout = setTimeout(() => { if (!editor.isActive) toggle.classList.remove('show'); }, 400); });
toggle.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
toggle.addEventListener('mouseleave', () => { hideTimeout = setTimeout(() => { if (!editor.isActive) toggle.classList.remove('show'); }, 400); });
document.addEventListener('keydown', (e) => {
  if ((e.key === 'e' || e.key === 'E') && e.target.getAttribute('contenteditable') !== 'true') editor.toggleEditMode();
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); editor.download(); }
});
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${N_SLIDES} slides)`);
