// Builds the Round 1 submission deck from the dashboard's data files, so every number on a slide is the
// number the analysis produced.   cd deck && npm install && node build_deck.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const Pi = require("react-icons/pi");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", f), "utf8"));
const S = read("summary.json");
const BAT = read("batters.json");
const BOWL = read("bowlers.json");
const RR = read("rr2026.json");
const EX = read("example.json");
const OUT = path.join(ROOT, "Pressure_Index_RR_2027.pptx");
const { applyTheme } = require("./apply_theme.js"); // writes THEME's colours and fonts into the deck's theme

// ------------------------------------------------------------------ helpers
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "analysis", "nationality_overrides.json"), "utf8")).overrides;
const nat = (p) => overrides[p.name] || p.country || (p.ipl_team ? "India" : "");
const sg = (n, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d);
const pts = (w) => sg(w * 100, 0) + " pts";
const pct = (x) => `${Math.round(x * 100)}%`;
const ranked = (D) => D.players.filter((p) => p.rank != null).sort((a, b) => a.rank - b.rank);
const top10 = (D) => ranked(D).slice(0, 10);
const find = (D, name) => D.players.find((p) => p.name === name);
const matchOn = (p, date) => p && p.matches.find((m) => m.date.startsWith(date));
const placeOf = (p, m) => [...p.matches].sort((a, b) => b.wpa - a.wpa).findIndex((x) => x.id === m.id) + 1;
const ord = (n) => (n === 1 ? "best" : `${n}th best`);
const chance = (p) => (p > 0 && p < 0.005 ? "<1%" : p > 0.995 && p < 1 ? ">99%" : `${Math.round(p * 100)}%`);
const inr = (n) => n.toLocaleString("en-GB");
const f2 = (n) => n.toFixed(2).replace("-", "−");

// where a player is strongest under pressure, and whether that fixes one of RR's 2026 weak phases
const SLOT = { bat_powerplay: "Opener", bat_middle: "Middle order", bat_death: "Finisher",
  bowl_powerplay: "New-ball bowler", bowl_middle: "Middle-overs bowler", bowl_death: "Death bowler" };
const targets = new Set(RR.recommendations.map((r) => r.gap.key));
function strongIn(list, key) {
  const phase = key.split("_")[1];
  return list
    .map((p) => ({ p, ph: p.phases.find((x) => x.phase.toLowerCase() === phase) }))
    .filter((x) => x.ph && x.ph.balls >= 30 && x.ph.rv100 > 0)
    .sort((a, b) => b.ph.rv100 - a.ph.rv100);
}
function fit(p, role) {
  const ph = p.phases.filter((x) => x.balls >= 30 && x.rv100 != null).sort((a, b) => b.rv100 - a.rv100);
  if (!ph.length) return null;
  const key = `${role}_${ph[0].phase.toLowerCase()}`;
  if (targets.has(key)) return key;
  const other = ph.slice(1).find((x) => targets.has(`${role}_${x.phase.toLowerCase()}`) && x.rv100 > 0);
  return other ? `${role}_${other.phase.toLowerCase()}` : null;
}

// ------------------------------------------------------------------ theme and layouts
const THEME = {
  name: "Pressure Index",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1A1D3A", lt1: "FFFFFF", dk2: "254AA5", lt2: "F3F4F9",
    accent1: "D81F7C", accent2: "254AA5", accent3: "E8A317", accent4: "6B7390", accent5: "F9D7E7", accent6: "DCE3F5",
    hlink: "254AA5", folHlink: "6B7390",
  },
};
const HEX = { ink: "1A1D3A", pink: "D81F7C", blue: "254AA5", grey: "6B7390", line: "DADDE8", panel: "F3F4F9", white: "FFFFFF" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "Ansh Bhavsar";
pres.title = "Pressure Index: SupeRR Selector Season 2, Round 1";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;

pres.defineSlideMaster({
  title: "Dark title",
  background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 0.7, y: 1.0, w: 11.5, h: 0.45, fontSize: 16, bold: true, color: C.accent1, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 1.5, w: 11.5, h: 1.9, fontSize: 48, bold: true, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 3.45, w: 10.5, h: 1.0, fontSize: 18, color: C.accent6, valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "Content",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.text1, valign: "middle", align: "left", margin: 0 }, text: "" } },
    { text: { text: "Pressure Index · SupeRR Selector Season 2 · Round 1", options: { x: 0.6, y: 7.05, w: 8, h: 0.3, fontSize: 10, color: C.accent4, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: C.accent4, align: "right" },
});

// icons: Phosphor glyphs rendered white, placed on a pink circle (the deck's one motif)
async function iconPng(Comp, color = "#FFFFFF") {
  const svg = renderToStaticMarkup(React.createElement(Comp, { color, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function iconDot(slide, Comp, x, y, d = 0.62, fill = C.accent1, name = "icon") {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: `${name} circle` });
  const pad = d * 0.22;
  slide.addImage({ data: await iconPng(Comp), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, altText: name, objectName: name });
}
const T = (slide, text, opts) => slide.addText(text, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, ...opts });
function card(slide, x, y, w, h, name, fill = C.background2) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { type: "none" }, objectName: name });
}
const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", legendFontFace: "+mn-lt", titleFontFace: "+mn-lt" };

async function main() {
  const bat10 = top10(BAT), bowl10 = top10(BOWL);

  // ================================================================ 1. title
  pres.addSection({ title: "The answer" });
  let s = pres.addSlide({ masterName: "Dark title", sectionTitle: "The answer" });
  s.addText("SupeRR Selector Season 2 · Round 1", { placeholder: "kicker" });
  s.addText("Who delivers when the match is on the line?", { placeholder: "title" });
  s.addText("A pressure rating for every IPL and T20I player since 2022, and the 20 players Rajasthan Royals should back at the IPL 2027 auction", { placeholder: "body" });
  const stats = [[inr(S.n_balls), "deliveries scored for what was at stake"], [String(S.n_matches), "IPL and T20I matches, 2022–26"], [`${Math.round(S.contrast.pressure.balls / 1000)}k`, "pressure balls found"]];
  stats.forEach(([v, l], i) => {
    T(s, v, { x: 0.7 + i * 3.9, y: 5.0, w: 3.6, h: 0.75, fontSize: 40, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: `stat ${i + 1} value` });
    T(s, l, { x: 0.7 + i * 3.9, y: 5.75, w: 3.6, h: 0.4, fontSize: 14, color: C.accent6, objectName: `stat ${i + 1} label` });
  });
  T(s, "Ansh Bhavsar · November 2026", { x: 0.7, y: 6.75, w: 6, h: 0.35, fontSize: 12, color: C.accent4, objectName: "byline" });
  if (S.public) T(s, `Data: official data pack + 2026 T20 World Cup (${S.public.matches} matches, Cricsheet)`, { x: 6.2, y: 6.75, w: 6.45, h: 0.35, fontSize: 12, color: C.accent4, align: "right", objectName: "data note" });
  s.addNotes("The question from the brief: who performs reliably under pressure, compared with their usual level. The answer: one rating per player, built from what was at stake on every ball, and 20 players RR can actually buy.");

  // ================================================================ 2. the picks
  s = pres.addSlide({ masterName: "Content", sectionTitle: "The answer" });
  s.addText("The 20 picks: players RR can buy who rise under pressure", { placeholder: "title" });
  for (const [ci, [label, list]] of [["Batters", bat10], ["Bowlers", bowl10]].entries()) {
    const x0 = 0.6 + ci * 6.2;
    card(s, x0, 1.45, 5.9, 5.0, `${label} card`);
    T(s, label, { x: x0 + 0.3, y: 1.6, w: 3, h: 0.4, fontSize: 18, bold: true, fontFace: THEME.headFontFace, objectName: `${label} heading` });
    T(s, "Rating", { x: x0 + 4.4, y: 1.65, w: 1.2, h: 0.3, fontSize: 11, color: C.accent4, align: "right", objectName: `${label} rating header` });
    list.forEach((p, i) => {
      const y = 2.1 + i * 0.42;
      T(s, String(p.rank), { x: x0 + 0.3, y, w: 0.4, h: 0.36, fontSize: 16, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: `${label} rank ${p.rank}` });
      T(s, [{ text: p.name, options: { bold: true } }, { text: `   ${nat(p)}`, options: { fontSize: 11, color: C.accent4 } }],
        { x: x0 + 0.75, y, w: 3.3, h: 0.36, fontSize: 14, valign: "middle", objectName: `${label} name ${p.rank}` });
      if (p.indian) {
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0 + 3.95, y: y + 0.06, w: 0.5, h: 0.24, rectRadius: 0.05, fill: { color: C.accent5 }, line: { type: "none" }, objectName: `${label} IND pill ${p.rank}` });
        T(s, "IND", { x: x0 + 3.95, y: y + 0.06, w: 0.5, h: 0.24, fontSize: 10, bold: true, color: C.accent1, align: "center", valign: "middle", objectName: `${label} IND ${p.rank}` });
      }
      T(s, sg(p.p_rv100), { x: x0 + 4.4, y, w: 1.2, h: 0.36, fontSize: 14, bold: true, align: "right", valign: "middle", objectName: `${label} rating ${p.rank}` });
    });
  }
  T(s, "Rating = runs added per 100 pressure balls, against an average player in exactly the same situation. All 20 can enter the 2027 auction, and all 20 are better under pressure than usual.",
    { x: 0.6, y: 6.55, w: 12.1, h: 0.4, fontSize: 12, color: C.accent4, objectName: "picks caption" });
  s.addNotes("Ranked by one number, the pressure rating. Two auction rules shape the lists: each Indian player who is above average under pressure gets a place (RR have only 3 overseas places left), and at most one Bangladeshi player per list (board release risk).");

  // ================================================================ 3. pressure definition
  pres.addSection({ title: "Defining pressure" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Defining pressure" });
  s.addText("Pressure = how much one ball could swing the result", { placeholder: "title" });
  const steps = [
    [Pi.PiChartLineUpBold, "1. Who is winning?", `A win-probability model reads score, wickets, balls left and target before every ball (AUC ${S.wp_model["2"].auc} in chases). In the final over of a chase it is worked out exactly, ball by ball.`],
    [Pi.PiScalesBold, "2. What is at stake?", "Imagine every possible next ball: dot, single, four, six, wicket, wide. The average swing in win chance is the ball’s stakes. A typical ball is 1×."],
    [Pi.PiLightningBold, "3. Pressure ball", `The top 20% of balls by stakes (${S.pressure_threshold.toFixed(2)}× or more), plus every ball of a knockout, where losing means going out. Other first-innings knocks count through the usual level.`],
  ];
  for (const [i, [icon, h, d]] of steps.entries()) {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.5, 3.85, 3.0, `step ${i + 1} card`);
    await iconDot(s, icon, x + 0.3, 1.75, 0.62, C.accent1, `step ${i + 1} icon`);
    T(s, h, { x: x + 0.3, y: 2.55, w: 3.3, h: 0.45, fontSize: 18, bold: true, fontFace: THEME.headFontFace, objectName: `step ${i + 1} heading` });
    T(s, d, { x: x + 0.3, y: 3.05, w: 3.3, h: 1.35, fontSize: 14, color: C.text1, valign: "top", objectName: `step ${i + 1} text` });
  }
  const mo = S.moments[0];
  card(s, 0.6, 4.8, 12.05, 1.95, "example card", C.text1);
  T(s, `${mo.li.toFixed(0)}×`, { x: 0.95, y: 5.0, w: 2.6, h: 1.4, fontSize: 60, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: "middle", objectName: "example value" });
  T(s, [
    { text: "The tensest ball in five years", options: { bold: true, fontSize: 16, color: C.background1, breakLine: true } },
    { text: `${mo.match}, ${mo.comp}: ${mo.state}. One ball carried ${mo.li.toFixed(0)} times the stakes of a typical delivery. A dead rubber or a chase already won carries almost none, however dramatic it looks.`, options: { fontSize: 14, color: C.accent6 } },
  ], { x: 3.7, y: 5.0, w: 8.7, h: 1.55, valign: "middle", objectName: "example text" });
  s.addNotes("Pressure is defined by the match situation, not by the over number. That covers a tight finish, an early collapse or a close chase in the middle overs, and leaves out a chase that is already lost.");

  // ================================================================ 4. proof
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Defining pressure" });
  s.addText("The label is accurate: its chances match what really happened", { placeholder: "title" });
  const overs = Array.from({ length: 20 }, (_, i) => String(i + 1));
  const inn = (k) => overs.map((o) => (S.by_over.find((r) => r.innings === k && String(r.over) === o) || { li: 0 }).li);
  s.addChart(pres.charts.LINE, [{ name: "Chasing", labels: overs, values: inn(2) }, { name: "Batting first", labels: overs, values: inn(1) }], {
    x: 0.6, y: 1.45, w: 7.4, h: 5.3, ...chartText,
    showTitle: true, title: "Average stakes of a ball, by over (1.0 = typical ball)", titleFontSize: 14, titleColor: HEX.ink,
    chartColors: [HEX.pink, HEX.blue], lineSize: 3, lineDataSymbol: "none",
    showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.ink,
    catAxisLabelColor: HEX.grey, valAxisLabelColor: HEX.grey, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
    valGridLine: { color: HEX.line, size: 0.5 }, catGridLine: { style: "none" }, valAxisLabelFormatCode: "0.0",
    showCatAxisTitle: true, catAxisTitle: "Over", catAxisTitleColor: HEX.grey, catAxisTitleFontSize: 11,
  });
  const eg = S.wp_model.endgame.rows.find((r) => r.situation.startsWith("Last ball, a boundary"));
  const cal = S.wp_model["2"].calibration.reduce((best, r) => (Math.abs(r.pred - 0.65) < Math.abs(best.pred - 0.65) ? r : best));
  const chaseDeath = S.by_phase.find((r) => r.innings === 2 && r.phase === "Death");
  const firstMid = S.by_phase.find((r) => r.innings === 1 && r.phase === "Middle");
  const proof = [
    [pct(cal.actual), `of chasing sides won when the model gave them ${pct(cal.pred)} (AUC ${S.wp_model["2"].auc}, ${inr(S.wp_model["2"].n_balls)} balls)`],
    [pct(eg.actual), `won needing a boundary off the last ball. A smooth model said ${pct(eg.old)}; the exact last-over model says ${pct(eg.new)}`],
    [`${Math.round(chaseDeath.pressure_share)}%`, `of death-over balls in a chase are pressure balls, against ${Math.round(firstMid.pressure_share)}% of middle-over balls batting first`],
  ];
  proof.forEach(([v, l], i) => {
    card(s, 8.35, 1.45 + i * 1.8, 4.3, 1.6, `proof ${i + 1} card`);
    T(s, v, { x: 8.65, y: 1.55 + i * 1.8, w: 3.8, h: 0.75, fontSize: 40, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: `proof ${i + 1} value` });
    T(s, l, { x: 8.65, y: 2.3 + i * 1.8, w: 3.8, h: 0.65, fontSize: 13, color: C.text1, valign: "top", objectName: `proof ${i + 1} label` });
  });
  s.addNotes("Stakes build late in chases, where results are decided. The win-probability model behind the stakes is well calibrated, and the exact last-over calculation fixes the one place a smooth model is badly wrong: needing a boundary off the last ball.");

  // ================================================================ 5. moments
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Defining pressure" });
  s.addText("It finds the moments anyone who watched would name", { placeholder: "title" });
  const P = (D, n, d) => { const p = find(D, n); const m = matchOn(p, d); return p && m ? { p, m, mo: p.moments.find((x) => x.id === m.id), place: placeOf(p, m) } : null; };
  const jad = P(BAT, "Ravindra Jadeja", "2023-05-29"), rin = P(BAT, "Rinku Singh", "2023-04-09"), bk = P(BAT, "Jos Buttler", "2024-04-16"),
    br = P(BAT, "Jos Buttler", "2024-04-06"), tu = P(BOWL, "Tushar Deshpande", "2026-04-04"), pa = P(BAT, "Rajat Patidar", "2026-05-26"), sh = P(BAT, "Matthew Short", "2026-04-18");
  const rows = [
    jad && ["Ravindra Jadeja, IPL final 2023", "Six and four off the last two balls to win the title (rain-reduced chase)", `${jad.m.li.toFixed(0)}× typical stakes; ${pts(jad.m.wpa)} win chance, his ${ord(jad.place)} of ${jad.p.matches.length}`],
    rin && ["Rinku Singh v GT, 2023", "28 needed off the last 5 balls: five sixes", `KKR were ${chance(rin.mo.wp_from)} to win; ${pts(rin.m.wpa)}, his ${ord(rin.place)} of ${rin.p.matches.length}`],
    bk && br && ["Jos Buttler, two hundreds in 2024", "107 v KKR (eight down, 36 off 15) and 100 v RCB (easy chase)", `KKR innings ${pts(bk.m.wpa)}; RCB innings ${pts(br.m.wpa)}: only one was clutch`],
    tu && ["Tushar Deshpande v GT, 2026", "Defended 11 in the final over", `RR were ${chance(tu.mo.wp_from)} when the over began; ${pts(tu.m.wpa)}, his ${ord(tu.place)}`],
    pa && ["Rajat Patidar, Qualifier 1 2026", `${pa.m.r} off ${pa.m.balls} batting first in a knockout`, `Every knockout ball counts: ${sg(pa.m.rv, 0)} runs against an average batter`],
    sh && ["Matthew Short v SRH, 2026", `${sh.m.r} off ${sh.m.balls} in a chase CSK lost`, `${pts(sh.m.wpa)}: not a hero’s innings, and the model agrees`],
  ].filter(Boolean);
  const hdr = (t) => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.ink }, fontSize: 13 } });
  s.addTable([[hdr("Moment"), hdr("What happened"), hdr("What the model says")], ...rows.map((r, i) => r.map((t, j) => ({
    text: t, options: { fontSize: 13, color: HEX.ink, bold: j === 0, fill: { color: i % 2 ? HEX.white : HEX.panel } } })))], {
    x: 0.6, y: 1.45, w: 12.1, colW: [3.2, 4.3, 4.6], rowH: 0.62, border: { type: "solid", pt: 0.5, color: HEX.line }, valign: "middle", margin: [0.06, 0.12, 0.06, 0.12], objectName: "moments table",
  });
  T(s, "Win chance in percentage points added by the player’s pressure balls in that match; “his best of 26” ranks the match among all his pressure matches.",
    { x: 0.6, y: 6.45, w: 12.1, h: 0.4, fontSize: 11, color: C.accent4, objectName: "moments caption" });
  s.addNotes("A sanity check against memory. The model independently ranks each famous innings as the player's biggest pressure match, separates Buttler's clutch hundred from his easy one, and does not credit Short's slow innings in a lost chase.");

  // ================================================================ 6. the rating
  pres.addSection({ title: "Measuring performance" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Measuring performance" });
  s.addText("One number per player, always set against his usual level", { placeholder: "title" });
  const b = EX.ball, st = EX.steps;
  card(s, 0.6, 1.45, 5.75, 5.3, "runs added card");
  await iconDot(s, Pi.PiTargetBold, 0.9, 1.7, 0.62, C.accent2, "runs added icon");
  T(s, "Each ball: runs added", { x: 1.7, y: 1.75, w: 4.4, h: 0.5, fontSize: 18, bold: true, fontFace: THEME.headFontFace, objectName: "runs added heading" });
  T(s, "Runs scored, minus what an average batter gets from the same spot (balls left, wickets down, competition, season), minus the runs a wicket costs from there. Bowlers mirror it: runs saved.",
    { x: 0.9, y: 2.5, w: 5.2, h: 1.3, fontSize: 14, valign: "top", objectName: "runs added text" });
  T(s, [
    { text: `${b.match}, ${b.comp}: ${b.need} needed off ${b.balls_left}`, options: { bold: true, breakLine: true } },
    { text: `${EX.name} hit ${b.runs === 6 ? "a six" : b.runs === 4 ? "a four" : b.runs}${b.out ? " and was out" : ""}. An average batter makes ${b.expected.toFixed(2)} from there.`, options: { breakLine: true } },
    { text: `${b.runs} − ${b.expected.toFixed(2)}${b.out ? ` − ${b.wkt_cost.toFixed(2)} (wicket)` : ""} ${b.centre >= 0 ? "+" : "−"} ${Math.abs(b.centre).toFixed(2)} (conditions) = `, options: {} },
    { text: `${sg(b.rv, 2)} runs added`, options: { bold: true, color: C.accent1 } },
  ], { x: 0.9, y: 4.0, w: 5.2, h: 1.4, fontSize: 14, valign: "top", objectName: "runs added example" });
  T(s, `Win chance on that ball: ${pct(b.wp)} → ${pct(b.wp_after)}; stakes ${b.stakes}×.`, { x: 0.9, y: 5.75, w: 5.2, h: 0.4, fontSize: 12, color: C.accent4, objectName: "runs added note" });

  card(s, 6.65, 1.45, 6.0, 5.3, "rating card", C.text1);
  T(s, "The pressure rating", { x: 6.95, y: 1.7, w: 5.4, h: 0.5, fontSize: 18, bold: true, color: C.background1, fontFace: THEME.headFontFace, objectName: "rating heading" });
  T(s, `(pressure runs added + ${st.K} × usual level) ÷ (pressure balls + ${st.K})`, { x: 6.95, y: 2.3, w: 5.4, h: 0.75, fontSize: 18, bold: true, color: C.accent1, objectName: "rating formula" });
  T(s, `Until a player has a long pressure record, assume he plays as he usually does. Half and half at ${st.K} pressure balls; his own record after that. Each year back counts 20% less.`,
    { x: 6.95, y: 3.1, w: 5.4, h: 1.0, fontSize: 13, color: C.accent6, objectName: "rating explanation" });
  const lines = [
    ["Pressure runs added", `${sg(st.p_sum)} on ${st.p_balls} balls (count as ${st.p_weighted})`],
    ["Usual level (other balls)", `${sg(st.n_rv100)} per 100`],
    ["His record’s share", `${st.p_weighted} ÷ (${st.p_weighted} + ${st.K}) = ${pct(st.share)}`],
    [`${EX.name}’s rating`, `${sg(st.rating100)} per 100 pressure balls`],
    ["Lift = rating − usual", `${sg(st.lift100)}: he rises under pressure`],
  ];
  lines.forEach(([k, v], i) => {
    T(s, k, { x: 6.95, y: 4.2 + i * 0.47, w: 2.4, h: 0.42, fontSize: 13, color: C.accent6, valign: "middle", objectName: `rating line ${i + 1} label` });
    T(s, v, { x: 9.35, y: 4.2 + i * 0.47, w: 3.1, h: 0.42, fontSize: 13, bold: i >= 3, color: i === 3 ? C.accent1 : C.background1, valign: "middle", objectName: `rating line ${i + 1} value` });
  });
  s.addNotes(`Worked example for the number-one batter, ${EX.name}. A script rebuilds this rating from the raw balls and checks it equals the published figure. The usual level is the baseline the brief asks for: lift is the rise or dip against it, and a player who dips is never recommended.`);

  // ================================================================ 7. fair comparisons
  pres.addSection({ title: "Fair comparisons" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Fair comparisons" });
  s.addText("Fair comparisons: six rules that stop the wrong players rising", { placeholder: "title" });
  const owen = find(BAT, "Mitchell Owen");
  const fair = [
    [Pi.PiCrosshairBold, "Same situation, same yardstick", "Every ball against an average player with the same balls left, wickets in hand, competition and season."],
    [Pi.PiHourglassMediumBold, "Short records can’t run away", owen ? `${owen.name}: ${sg(owen.p_raw100, 0)} per 100 on his first ${owen.p_balls} pressure balls, but a rating of ${sg(owen.p_rv100)}: ${owen.p_balls} balls cannot outweigh his usual level.` : "A short record leans on the usual level."],
    [Pi.PiMapPinBold, "Pitches and opponents", "T20Is in Bangladesh go at 7.9 an over, elsewhere 8.7. Each T20I ball is judged against the same country and opponent."],
    [Pi.PiTrophyBold, "Top-level cricket only", `IPL plus T20Is between full-member nations (${inr(S.n_top_level_matches)} matches). No associate or A-team games.`],
    [Pi.PiCalendarCheckBold, "Built for 2027", `Each year back counts 20% less. Every pick has ${BAT.eligibility.min_recent_balls}+ pressure balls in 2025–26: active in the last two years.`],
    [Pi.PiFlagBold, "Fair to Indian players", `A third of the evidence bar (${BAT.eligibility.indian_min[0]} pressure balls): the data has no domestic cricket, so their only top-level cricket here is the IPL.`],
  ];
  for (const [i, [icon, h, d]] of fair.entries()) {
    const x = 0.6 + (i % 3) * 4.1, y = 1.45 + Math.floor(i / 3) * 2.7;
    card(s, x, y, 3.85, 2.45, `rule ${i + 1} card`);
    await iconDot(s, icon, x + 0.3, y + 0.28, 0.55, C.accent1, `rule ${i + 1} icon`);
    T(s, h, { x: x + 1.0, y: y + 0.3, w: 2.65, h: 0.55, fontSize: 16, bold: true, fontFace: THEME.headFontFace, valign: "middle", objectName: `rule ${i + 1} heading` });
    T(s, d, { x: x + 0.3, y: y + 1.0, w: 3.3, h: 1.3, fontSize: 13.5, valign: "top", objectName: `rule ${i + 1} text` });
  }
  s.addNotes("Each rule is a fairness fix with a reason in the data. The conditions-and-opposition adjustment roughly doubled how well batting ratings predict the next season.");

  // ================================================================ 8. funnel
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Fair comparisons" });
  s.addText("From every qualified player to the 10 RR can actually use", { placeholder: "title" });
  const stage = (D) => {
    const q = D.players.filter((p) => p.merit_rank != null);
    return [["Qualified", q.length], ["In the 2027 auction", q.filter((p) => p.excluded == null || p.excluded === "dips").length],
      ["Rise under pressure", D.eligibility.n_ranked], ["Submitted top 10", 10]];
  };
  for (const [ci, [label, D]] of [["Batters", BAT], ["Bowlers", BOWL]].entries()) {
    const x0 = 0.6 + ci * 4.2, st4 = stage(D), max = st4[0][1];
    T(s, label, { x: x0, y: 1.45, w: 3.9, h: 0.4, fontSize: 18, bold: true, fontFace: THEME.headFontFace, objectName: `${label} funnel heading` });
    st4.forEach(([k, v], i) => {
      const w = 0.8 + 3.1 * (v / max), y = 2.0 + i * 1.12;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0, y, w, h: 0.62, rectRadius: 0.06, fill: { color: i === 3 ? C.accent1 : C.accent2 }, line: { type: "none" }, objectName: `${label} stage ${i + 1} bar` });
      T(s, String(v), { x: x0 + 0.15, y, w: 0.9, h: 0.62, fontSize: 20, bold: true, color: C.background1, valign: "middle", objectName: `${label} stage ${i + 1} value` });
      T(s, k, { x: x0, y: y + 0.66, w: 3.9, h: 0.32, fontSize: 12, color: C.accent4, objectName: `${label} stage ${i + 1} label` });
    });
  }
  const sl = RR.slots;
  card(s, 9.05, 1.45, 3.6, 5.3, "rules card", C.text1);
  T(s, "Auction rules", { x: 9.3, y: 1.65, w: 3.1, h: 0.45, fontSize: 18, bold: true, color: C.background1, fontFace: THEME.headFontFace, objectName: "rules heading" });
  T(s, [
    { text: "Out: RR’s squad, other teams’ retentions, retired or banned players (Harry Brook), Pakistani players, anyone with no top-level cricket in 2026", options: { bullet: true, breakLine: true } },
    { text: "Out: anyone worse under pressure than usual", options: { bullet: true, breakLine: true } },
    { text: `Each above-average Indian player gets a place: RR have ${sl.open} places left, only ${sl.open_overseas} overseas`, options: { bullet: true, breakLine: true } },
    { text: "At most one Bangladeshi player per list: board release (NOC) risk", options: { bullet: true } },
  ], { x: 9.3, y: 2.2, w: 3.15, h: 4.3, fontSize: 13, color: C.background1, valign: "top", paraSpaceAfter: 8, objectName: "rules list" });
  s.addNotes("The rating ranks everyone; auction reality decides who can be recommended. Below-average players are never promoted to fill a quota.");

  // ================================================================ 9-10. evidence tables
  pres.addSection({ title: "Evidence for the top 10" });
  const meritTop = (D) => D.players.filter((p) => p.merit_rank != null).sort((a, b) => a.merit_rank - b.merit_rank).slice(0, 5).map((p) => p.name).join(", ");
  for (const [role, D, list] of [["bat", BAT, bat10], ["bowl", BOWL, bowl10]]) {
    s = pres.addSlide({ masterName: "Content", sectionTitle: "Evidence for the top 10" });
    s.addText(role === "bat" ? "Batters: the evidence behind each pick" : "Bowlers: the evidence behind each pick", { placeholder: "title" });
    const H = (t, al = "right") => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.ink }, fontSize: 12, align: al } });
    const rowsT = list.map((p, i) => {
      const f = { fontSize: 13, color: HEX.ink, fill: { color: i % 2 ? HEX.white : HEX.panel } };
      return [
        { text: String(p.rank), options: { ...f, bold: true, color: HEX.pink, align: "center" } },
        { text: p.name + (p.indian ? "  (IND)" : "") + (p.emerging ? "  (U26)" : ""), options: { ...f, bold: true } },
        { text: nat(p), options: { ...f, color: HEX.grey } },
        { text: sg(p.p_rv100), options: { ...f, bold: true, align: "right" } },
        { text: sg(p.n_rv100), options: { ...f, align: "right" } },
        { text: sg(p.delta100), options: { ...f, align: "right", color: HEX.pink } },
        { text: pts(p.wpa100), options: { ...f, align: "right" } },
        { text: String(p.p_balls), options: { ...f, align: "right" } },
        { text: pct(p.boot.p_top10), options: { ...f, align: "right" } },
      ];
    });
    s.addTable([[H("#", "center"), H("Player", "left"), H("Country", "left"), H("Rating"), H("Usual"), H("Lift"), H("Win impact"), H("Pressure balls"), H("Stays top 10")], ...rowsT], {
      x: 0.6, y: 1.4, w: 12.1, colW: [0.55, 3.1, 1.75, 1.0, 1.0, 0.9, 1.3, 1.25, 1.25], rowH: 0.42, border: { type: "solid", pt: 0.5, color: HEX.line }, valign: "middle", margin: [0.03, 0.1, 0.03, 0.1], objectName: `${role} evidence table`,
    });
    T(s, [
      { text: "Rating and usual level: runs " + (role === "bat" ? "added" : "saved") + " per 100 balls against an average " + (role === "bat" ? "batter" : "bowler") + " in the same spot. Lift = rating − usual. Win impact: win chance added per 100 pressure balls (evidence, not ranked on). Stays top 10: share of 400 resamples of matches. (U26): under 26 at the start of IPL 2027.", options: { breakLine: true } },
      { text: `Before auction rules, the rating’s top five are ${meritTop(D)}: the method finds the players anyone would expect.`, options: { bold: true, color: C.text1 } },
    ], { x: 0.6, y: 6.15, w: 12.1, h: 0.8, fontSize: 11, color: C.accent4, valign: "top", objectName: `${role} evidence caption` });
    s.addNotes(role === "bat"
      ? "Every pick is above average under pressure and rises above his usual level. Ranks one to three are solid in re-runs; the lower ranks are close calls. Hridoy's lower confidence comes from sharing the one Bangladeshi place in re-runs."
      : "Mahedi Hasan keeps the top spot even after the pitch and opposition adjustment. Deepak Chahar takes the guaranteed Indian place.");
  }

  // ================================================================ 11. RR fit
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Evidence for the top 10" });
  s.addText("How the picks fit RR: the death overs cost RR the title", { placeholder: "title" });
  const phaseRows = RR.phases.flatMap((p) => ["bat", "bowl"].map((d) => ({ label: `${d === "bat" ? "Batting" : "Bowling"}, ${p.phase === "Middle" ? "middle" : p.phase.toLowerCase()}`, v: p.rr[`${d}_rv_pm`] })));
  s.addChart(pres.charts.BAR, [{ name: "RR 2026", labels: phaseRows.map((r) => r.label), values: phaseRows.map((r) => Math.round(r.v * 10) / 10) }], {
    x: 0.6, y: 1.45, w: 6.6, h: 5.3, barDir: "bar", ...chartText,
    showTitle: true, title: "RR 2026: runs a match gained or lost against an average side", titleFontSize: 14, titleColor: HEX.ink,
    chartColors: [HEX.pink], invertedColors: [HEX.blue], showLegend: false, showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 12, dataLabelColor: HEX.ink, dataLabelFormatCode: "+0.0;−0.0;0",
    catAxisLabelColor: HEX.ink, valAxisLabelColor: HEX.grey, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, catAxisOrientation: "maxMin", catAxisLabelPos: "low",
    valGridLine: { color: HEX.line, size: 0.5 }, catGridLine: { style: "none" }, valAxisLabelFormatCode: "+0;−0;0",
  });
  T(s, `${sl.open} places open · ${sl.open_overseas} overseas`, { x: 7.55, y: 1.5, w: 5.1, h: 0.6, fontSize: 26, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: "slots headline" });
  T(s, `RR kept ${sl.retained} players, ${sl.retained_overseas} from overseas (maximum 25 and 8).`, { x: 7.55, y: 2.1, w: 5.1, h: 0.4, fontSize: 13, color: C.accent4, objectName: "slots detail" });
  const gapOrder = RR.recommendations.map((r) => r.gap.key);
  const strong = Object.fromEntries(gapOrder.map((k) => [k, strongIn(k.startsWith("bat") ? bat10 : bowl10, k)]));
  gapOrder.forEach((k, i) => {
    const g = RR.gaps.find((x) => x.key === k);
    const names = strong[k].slice(0, 3).map((x) => `${x.p.name}${x.p.indian ? " (IND)" : ""} ${sg(x.ph.rv100, 0)}`).join("  ·  ") || "none in the top 10";
    card(s, 7.55, 2.7 + i * 1.02, 5.1, 0.9, `gap ${i + 1} card`);
    T(s, [{ text: SLOT[k], options: { bold: true } }, { text: `   RR ${g.rank}th of 10 in 2026`, options: { fontSize: 11, color: C.accent4 } }], { x: 7.75, y: 2.76 + i * 1.02, w: 4.8, h: 0.35, fontSize: 14, objectName: `gap ${i + 1} heading` });
    T(s, names, { x: 7.75, y: 3.12 + i * 1.02, w: 4.8, h: 0.4, fontSize: 12.5, color: C.text1, objectName: `gap ${i + 1} picks` });
  });
  T(s, "Picks above average under pressure in that phase (30+ balls), runs per 100.", { x: 7.55, y: 6.78, w: 5.1, h: 0.25, fontSize: 10, color: C.accent4, objectName: "gap caption" });
  s.addNotes("RR's top order carried 2026; the last five overs, with bat and ball, were 8th of 10. For each gap, the picks shown are those above average under pressure in that exact phase.");

  // ================================================================ 12. reliability
  pres.addSection({ title: "Reliability and limitations" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Reliability and limitations" });
  s.addText("Tested on seasons the rating never saw", { placeholder: "title" });
  const F = S.forward;
  s.addChart(pres.charts.BAR, [
    { name: "This rating", labels: ["Batters", "Bowlers"], values: [F.bat.rating, F.bowl.rating] },
    { name: "Usual level alone", labels: ["Batters", "Bowlers"], values: [F.bat.normal, F.bowl.normal] },
    { name: "Win impact alone", labels: ["Batters", "Bowlers"], values: [F.bat.wpa100, F.bowl.wpa100] },
  ], {
    x: 0.6, y: 1.45, w: 7.2, h: 5.3, barDir: "col", barGapWidthPct: 60, ...chartText,
    showTitle: true, title: "How well each ranking predicts next season’s pressure output (correlation)", titleFontSize: 14, titleColor: HEX.ink,
    chartColors: [HEX.pink, "9AA3BD", HEX.blue], showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.ink,
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 12, dataLabelColor: HEX.ink, dataLabelFormatCode: "0.00",
    catAxisLabelColor: HEX.ink, valAxisLabelColor: HEX.grey, catAxisLabelFontSize: 13, valAxisLabelFontSize: 11,
    valGridLine: { color: HEX.line, size: 0.5 }, catGridLine: { style: "none" }, valAxisLabelFormatCode: "0.00",
  });
  const solid = (D) => top10(D).slice(0, 3).map((p) => pct(p.boot.p_top10)).join(", ");
  const rel = [
    ["Forward test", "Ratings built from 2022–24 and 2022–25 only, scored on 2025 and 2026. Every setting was chosen this way."],
    ["400 re-runs", `Top three stay in the top 10 in ${solid(BAT)} (batters) and ${solid(BOWL)} (bowlers) of resamples.`],
    ["Checked by script", `The worked example is rebuilt from raw balls and must equal the published rating. RR 2026 figures match the public record (${RR.provenance.checks_passed} of ${RR.provenance.checks.length}).`],
  ];
  rel.forEach(([h, d], i) => {
    card(s, 8.15, 1.45 + i * 1.8, 4.5, 1.6, `reliability ${i + 1} card`);
    T(s, h, { x: 8.45, y: 1.6 + i * 1.8, w: 4.0, h: 0.4, fontSize: 16, bold: true, fontFace: THEME.headFontFace, objectName: `reliability ${i + 1} heading` });
    T(s, d, { x: 8.45, y: 2.0 + i * 1.8, w: 4.0, h: 0.95, fontSize: 12.5, valign: "top", objectName: `reliability ${i + 1} text` });
  });
  s.addNotes("Ratings built only from earlier seasons, scored on the next one. For bowlers the rating beats the usual level alone; for batters the usual level is the better guide, which is why the rating leans on it. Win impact and consistency barely predict anything on their own, so they are shown as evidence, not blended in.");

  // ================================================================ 13. limitations
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Reliability and limitations" });
  s.addText("Where to be careful", { placeholder: "title" });
  const lim = [
    [Pi.PiWarningBold, "Batting under pressure is hard to predict", `Next-season correlation is ${f2(F.bat.rating)} for batters (bowlers ${f2(F.bowl.rating)}). A batter’s usual level is the best guide, which is why the rating leans on it. Batting ranks 6–10 are close calls.`],
    [Pi.PiPulseBold, "“Clutch” is real but small", `Lift repeats only weakly between odd and even matches (${f2(BAT.split_half.lift)} batters, ${f2(BOWL.split_half.lift)} bowlers), so it is a filter (never a player who dips), not a score to maximise.`],
    [Pi.PiEyeSlashBold, "What the data cannot see", "No domestic cricket, no ages, no 2022 or 2024 World Cups (2026 is added from public data, except Afghanistan's 4 games, not available in the public data we could access); no fielding, venue or batter-versus-bowler match-ups. Young Indian talent cannot be judged: teams kept " + `${S.new_indians.kept} of ${S.new_indians.total} newer Indian players.`],
    [Pi.PiIdentificationCardBold, "Availability checked by hand", "Retentions from the official lists; Harry Brook’s ban and retirements (e.g. Mohit Sharma) entered manually; Bangladesh board release is a risk, so one per list."],
  ];
  for (const [i, [icon, h, d]] of lim.entries()) {
    const y = 1.45 + i * 1.32;
    await iconDot(s, icon, 0.6, y + 0.1, 0.62, i < 2 ? C.accent1 : C.accent2, `limit ${i + 1} icon`);
    T(s, h, { x: 1.5, y, w: 11.1, h: 0.42, fontSize: 18, bold: true, fontFace: THEME.headFontFace, objectName: `limit ${i + 1} heading` });
    T(s, d, { x: 1.5, y: y + 0.45, w: 11.1, h: 0.75, fontSize: 14, valign: "top", objectName: `limit ${i + 1} text` });
  }
  s.addNotes("Honest limits. The method is strongest for bowlers and for the top of each list; treat the lower batting ranks as a shortlist to scout further.");

  // ================================================================ 14. close
  s = pres.addSlide({ masterName: "Dark title", sectionTitle: "Reliability and limitations" });
  s.addText("Recommendation for RR", { placeholder: "kicker" });
  s.addText("Back players who rise when it matters, and fix the death overs first", { placeholder: "title" });
  const nm = (k, n = 2) => (strong[k] || []).slice(0, n).map((x) => x.p.name).join(" and ");
  const ind = bat10.concat(bowl10).filter((p) => p.indian).map((p) => p.name);
  const indians = ind.length > 1 ? ind.slice(0, -1).join(", ") + " and " + ind[ind.length - 1] : ind.join("");
  const need = RR.squad_need;
  const emg = bat10.concat(bowl10).filter((p) => p.emerging).map((p) => p.name);
  const emgText = emg.length ? ` Young core: ${emg.length > 1 ? emg.slice(0, -1).join(", ") + " and " + emg[emg.length - 1] : emg[0]} ${emg.length > 1 ? "are" : "is"} under 26, picked on merit.` : "";
  s.addText(`Death overs: ${nm("bowl_death")} with the ball, ${nm("bat_death")} with the bat. Indian picks: ${indians}.${emgText} RR kept ${need.batter + need.keeper} batters and ${need.bowler} bowlers, so batting from number 3 down is the first need.`, { placeholder: "body" });
  T(s, [
    { text: "Reproduce everything from the official data pack:", options: { bold: true, breakLine: true, color: C.background1 } },
    { text: "python -I analysis/public_wc2026.py  ·  python -I analysis/pipeline.py  ·  python -I analysis/rr2026.py  ·  python analysis/worked_example.py", options: { fontFace: "Courier New", color: C.accent6, fontSize: 12, breakLine: true } },
    { text: "The interactive dashboard shows every player’s profile, match by match, and the full method with a worked example.", options: { color: C.accent6 } },
  ], { x: 0.7, y: 5.2, w: 11.9, h: 1.3, fontSize: 14, valign: "top", objectName: "reproduce text" });
  s.addNotes("Close with the recommendation and how to check it.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
