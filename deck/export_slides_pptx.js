// Saves the HTML slide deck (Pressure_Index_RR_2027_slides.html) as a PowerPoint file with the same look:
// each slide is captured at 1920x1080 in headless Microsoft Edge and placed full-bleed on a 16:9 slide, with the
// slide's text in the speaker notes.        node deck/build_slides.js && node deck/export_slides_pptx.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "Pressure_Index_RR_2027_slides.html");
const OUT = path.join(ROOT, "Pressure_Index_RR_2027_slides.pptx");
const EDGE = [
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && fs.existsSync(p));
if (!EDGE) throw new Error("Microsoft Edge not found; set EDGE_PATH to a Chromium-based browser");

const html = fs.readFileSync(HTML, "utf8");
const sections = html.split('<section class="slide').slice(1).map((s) => s.slice(s.indexOf(">") + 1).split("</section>")[0]);
const text = (s) =>
  s.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<(br|\/p|\/li|\/tr|\/h[1-4]|\/div)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-slides-"));
const base = pathToFileURL(HTML).href;
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in, 16:9
pres.author = "Ansh Bhavsar";
pres.title = "Pressure Index: SupeRR Selector Season 2, Round 1";

sections.forEach((sec, i) => {
  const png = path.join(tmp, `slide-${String(i + 1).padStart(2, "0")}.png`);
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1920,1080",
    "--virtual-time-budget=3500", `--screenshot=${png}`, `${base}?export#${i + 1}`], { stdio: "ignore" });
  if (!fs.existsSync(png)) throw new Error(`capture failed for slide ${i + 1}`);
  const slide = pres.addSlide();
  slide.addImage({ path: png, x: 0, y: 0, w: 13.333, h: 7.5 });
  slide.addNotes(text(sec));
  process.stdout.write(`slide ${i + 1}/${sections.length}\r`);
});

pres.writeFile({ fileName: OUT }).then(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nwrote ${OUT} (${sections.length} slides)`);
});
