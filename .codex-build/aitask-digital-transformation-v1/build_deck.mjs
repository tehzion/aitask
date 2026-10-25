import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/user/Downloads/aitask-master";
const buildDir = path.join(workspaceDir, ".codex-build", "aitask-digital-transformation-v1");
const outputDir = path.join(workspaceDir, "output");
const finalPath = path.join(outputDir, "aitask-digital-transformation-v4.pptx");
const skillDir = "/Users/user/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations";
const runtimePython = "/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

const W = 1280;
const H = 720;
const FONT = "Arial";
const C = {
  navy: "#0B1F3A",
  navy2: "#122E50",
  blue: "#2F6BFF",
  teal: "#0EA5A8",
  tealSoft: "#DDF7F1",
  blueSoft: "#DCEBFF",
  coral: "#E2523C",
  coralSoft: "#FFE7E2",
  yellow: "#D9A441",
  yellowSoft: "#FFF4D7",
  ink: "#12233E",
  muted: "#5B6677",
  line: "#D7DEE8",
  light: "#F5F7FA",
  soft: "#EEF3F8",
  white: "#FFFFFF",
  black: "#101820",
  green: "#1A8B5B",
  greenSoft: "#E1F5EA",
};

function safeTextStyle(style = {}) {
  return {
    typeface: FONT,
    fontSize: style.fontSize ?? 20,
    color: style.color ?? C.ink,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    alignment: style.alignment ?? "left",
    verticalAlignment: style.verticalAlignment ?? "top",
    lineSpacing: style.lineSpacing ?? 1.08,
    wrap: style.wrap ?? "square",
    autoFit: style.autoFit ?? "shrinkText",
    ...(style.insets ? { insets: style.insets } : {}),
  };
}

function shape(slide, geometry, left, top, width, height, fill = "none", lineFill = "none", lineWidth = 0, name) {
  return slide.shapes.add({
    geometry,
    ...(name ? { name } : {}),
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
  });
}

function text(slide, value, left, top, width, height, style = {}, name) {
  const s = shape(slide, "textbox", left, top, width, height, "none", "none", 0, name);
  s.text = value;
  s.text.style = safeTextStyle(style);
  return s;
}

function box(slide, left, top, width, height, fill, radius = "rounded-lg", lineFill = "none", lineWidth = 0, name) {
  const s = shape(slide, "roundRect", left, top, width, height, fill, lineFill, lineWidth, name);
  s.borderRadius = radius;
  return s;
}

function line(slide, left, top, width, height, fill, widthPx = 1, dash = "solid") {
  return shape(slide, "rect", left, top, width, height, fill, fill, 0, undefined);
}

function arrowBetween(slide, from, to, color = C.blue, kind = "straight", width = 2) {
  return slide.shapes.connect(from, to, {
    kind,
    fromSide: "right",
    toSide: "left",
    line: { style: "solid", fill: color, width },
    tail: { type: "arrow", width: "med", length: "med" },
  });
}

function arrowDown(slide, from, to, color = C.blue, kind = "straight", width = 2) {
  return slide.shapes.connect(from, to, {
    kind,
    fromSide: "bottom",
    toSide: "top",
    line: { style: "solid", fill: color, width },
    tail: { type: "arrow", width: "med", length: "med" },
  });
}

function addBrand(slide, dark = false) {
  box(slide, 54, 34, 32, 32, dark ? C.white : C.coral, "rounded-lg", "none", 0, "brand-mark");
  text(slide, "AT", 54, 39, 32, 19, { fontSize: 12, bold: true, color: dark ? C.navy : C.white, alignment: "center", verticalAlignment: "middle" });
  text(slide, "AiTask", 96, 35, 100, 22, { fontSize: 17, bold: true, color: dark ? C.white : C.ink });
}

function addChrome(slide, num, title, kicker = "DIGITAL TRANSFORMATION CASE STUDY") {
  addBrand(slide, false);
  text(slide, kicker, 54, 90, 520, 18, { fontSize: 12, bold: true, color: C.blue, letterSpacing: 1.2 });
  text(slide, title, 54, 114, 1130, 56, { fontSize: 34, bold: true, color: C.ink, lineSpacing: 0.94 });
  line(slide, 54, 184, 1172, 1, C.line);
  text(slide, String(num).padStart(2, "0"), 1186, 38, 38, 20, { fontSize: 12, bold: true, color: C.muted, alignment: "right" });
}

function addNotes(slide, main, example, lesson) {
  slide.speakerNotes.text = `Main point: ${main}\n\nPractical example: ${example}\n\nLesson for Malaysian SMEs: ${lesson}`;
  slide.speakerNotes.setVisible(true);
}

function addBulletList(slide, items, left, top, width, height, style = {}) {
  const value = items.map((item) => `• ${item}`).join("\n");
  return text(slide, value, left, top, width, height, { fontSize: style.fontSize ?? 20, color: style.color ?? C.ink, lineSpacing: style.lineSpacing ?? 1.28, ...style });
}

function addStep(slide, x, y, w, h, number, label, sub, fill = C.white, accent = C.blue) {
  const s = box(slide, x, y, w, h, fill, "rounded-xl", C.line, 1);
  box(slide, x + 16, y + 16, 30, 30, accent, "rounded-lg");
  text(slide, String(number), x + 16, y + 20, 30, 18, { fontSize: 14, bold: true, color: C.white, alignment: "center", verticalAlignment: "middle" });
  text(slide, label, x + 60, y + 15, w - 76, 28, { fontSize: 20, bold: true, color: C.ink });
  text(slide, sub, x + 18, y + 55, w - 36, h - 66, { fontSize: 15, color: C.muted, lineSpacing: 1.15 });
  return s;
}

function addTag(slide, label, x, y, w, fill, color = C.ink) {
  box(slide, x, y, w, 28, fill, "rounded-lg");
  text(slide, label, x + 10, y + 5, w - 20, 18, { fontSize: 13, bold: true, color, alignment: "center", verticalAlignment: "middle" });
}

async function readBlob(filePath) {
  const bytes = await fs.readFile(filePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function addImage(slide, blob, contentType, left, top, width, height, alt) {
  return slide.images.add({
    blob,
    contentType,
    alt,
    fit: "cover",
    position: { left, top, width, height },
    geometry: "roundRect",
    borderRadius: "rounded-xl",
  });
}

async function main() {
  const dashboardBlob = await readBlob(path.join(workspaceDir, "e2e/calm-ui.spec.ts-snapshots/calm-dashboard-desktop-light-desktop-chrome-darwin.png"));
  const reviewBlob = await readBlob(path.join(workspaceDir, "docs/audit-evidence/hod-latest-2026-10-14/review-cover-desktop.png"));
  const popupBlob = await readBlob(path.join(workspaceDir, "docs/audit-evidence/staff-hod-ui/popup-en-mobile.png"));

  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  presentation.theme.defaultFont = FONT;
  presentation.theme.colorScheme = {
    name: "AiTask consulting",
    themeColors: {
      accent1: C.blue,
      accent2: C.teal,
      accent3: C.coral,
      accent4: C.yellow,
      accent5: C.navy,
      accent6: C.green,
      bg1: C.white,
      bg2: C.light,
      tx1: C.ink,
      tx2: C.muted,
      dk1: C.black,
      lt1: C.white,
      dk2: C.navy2,
      lt2: C.soft,
      hlink: C.blue,
      folHlink: C.teal,
    },
  };

  // 1. Cover
  {
    const s = presentation.slides.add();
    s.background.fill = C.navy;
    addBrand(s, true);
    text(s, "From Manual Operations\nto Digital Transformation", 72, 150, 620, 170, { fontSize: 48, bold: true, color: C.white, lineSpacing: 0.98 });
    text(s, "The AiTask journey: connecting people, processes and management", 76, 348, 530, 64, { fontSize: 22, color: "#C9D7E8", lineSpacing: 1.15 });
    addTag(s, "A business transformation case study", 76, 438, 250, C.blue, C.white);
    text(s, "Structure  /  Process  /  Applications  /  Data  /  Behaviour", 76, 620, 700, 22, { fontSize: 14, color: "#A8BCD7" });

    // Editable transformation path
    const nodes = [
      [790, 142, 146, 76, "Fragmented\noperations", C.coralSoft, C.coral],
      [980, 258, 146, 76, "Shared\nworkflows", C.blueSoft, C.blue],
      [790, 374, 146, 76, "Connected\ndata", C.tealSoft, C.teal],
      [980, 490, 146, 76, "Better\nbehaviour", C.greenSoft, C.green],
    ];
    const sh = nodes.map(([x, y, w, h, label, fill, accent]) => {
      const n = box(s, x, y, w, h, fill, "rounded-xl", accent, 1);
      text(s, label, x + 10, y + 20, w - 20, h - 30, { fontSize: 20, bold: true, color: C.ink, alignment: "center", verticalAlignment: "middle" });
      return n;
    });
    arrowBetween(s, sh[0], sh[1], C.coral, "straight", 2);
    arrowBetween(s, sh[1], sh[2], C.blue, "straight", 2);
    arrowBetween(s, sh[2], sh[3], C.teal, "straight", 2);
    text(s, "AiTask", 825, 574, 280, 40, { fontSize: 26, bold: true, color: C.white, alignment: "center" });
    addNotes(s, "Digital transformation changes how the organization operates, not just where it stores information.", "A company moves from scattered messages and manual follow-ups to one shared operational rhythm through AiTask.", "Start with the operating model and the daily work, then choose the technology that makes the model easier to run.");
  }

  // 2. Digital transformation is a progression
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 2, "Digital transformation is a progression", "THE OPERATING MODEL");
    text(s, "The value increases when technology changes the workflow, not just the format.", 54, 205, 780, 30, { fontSize: 21, color: C.muted });
    const stages = [
      [70, "Digitization", "Paper task lists become spreadsheets.", "Information becomes digital.", C.soft, C.muted],
      [425, "Digitalization", "Tasks move into an online workflow.", "Existing work becomes easier to coordinate.", C.blueSoft, C.blue],
      [780, "Digital transformation", "The company works through connected roles, processes and data.", "The operating model changes.", C.tealSoft, C.teal],
    ];
    stages.forEach(([x, title, desc, label, fill, accent], i) => {
      box(s, x, 290, 300, 220, fill, "rounded-xl", accent, 1);
      text(s, String(i + 1).padStart(2, "0"), x + 24, 318, 50, 25, { fontSize: 15, bold: true, color: accent });
      text(s, title, x + 24, 360, 250, 34, { fontSize: 24, bold: true, color: C.ink });
      text(s, desc, x + 24, 408, 250, 54, { fontSize: 17, color: C.ink, lineSpacing: 1.18 });
      text(s, label, x + 24, 482, 250, 24, { fontSize: 14, bold: true, color: accent });
      if (i < stages.length - 1) arrowBetween(s, box(s, x + 302, 390, 8, 8, "none"), box(s, x + 350, 390, 8, 8, "none"), accent, "straight", 1);
    });
    text(s, "AiTask case study", 70, 570, 180, 20, { fontSize: 14, bold: true, color: C.blue });
    text(s, "Management, departments and staff operate through one coordinated project and task system.", 250, 566, 820, 30, { fontSize: 20, bold: true, color: C.ink });
    addNotes(s, "Digitization, digitalization and transformation describe different levels of change.", "Moving a paper list into a spreadsheet is useful, but it does not clarify ownership or review responsibilities.", "For an SME, the question is whether the system makes the business easier to run, not whether the business has adopted a new tool.");
  }

  // 3. First principles
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 3, "Start with the organization, not the software", "FIRST PRINCIPLES");
    text(s, "A digital system should reflect how the organization needs to operate.", 54, 205, 760, 30, { fontSize: 21, color: C.muted });
    const qs = [
      "Why does the organization operate this way?",
      "Who owns each decision?",
      "What information does each role need?",
      "Where does information originate and move?",
      "What behaviour should the system make easier?",
    ];
    qs.forEach((q, i) => {
      const y = 274 + i * 62;
      box(s, 66, y, 570, 44, C.white, "rounded-lg", C.line, 1);
      box(s, 80, y + 9, 26, 26, i === 4 ? C.teal : C.blue, "rounded-lg");
      text(s, String(i + 1), 80, y + 12, 26, 18, { fontSize: 12, bold: true, color: C.white, alignment: "center" });
      text(s, q, 122, y + 10, 480, 20, { fontSize: 17, color: C.ink });
    });
    const layers = [
      ["Organizational structure", C.navy],
      ["Responsibilities and decisions", C.navy2],
      ["Operational workflows", C.blue],
      ["Digital applications", C.teal],
      ["Connected data", C.green],
      ["Working behaviour", C.coral],
    ];
    layers.forEach(([label, fill], i) => {
      const x = 770 + i * 12;
      const y = 255 + i * 55;
      const w = 380 - i * 24;
      box(s, x, y, w, 40, fill, "rounded-lg");
      text(s, label, x + 15, y + 9, w - 30, 20, { fontSize: 16, bold: true, color: C.white, alignment: "center" });
    });
    text(s, "The design sequence matters.", 770, 617, 420, 24, { fontSize: 20, bold: true, color: C.ink, alignment: "center" });
    addNotes(s, "First principles thinking reduces the risk of choosing software before understanding the operating model.", "AiTask begins with role relationships and responsibility boundaries, then turns those into workflows.", "SMEs get better digital outcomes when they make ownership and information flow explicit before configuring a platform.");
  }

  // 4. Structure
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 4, "Structure creates clarity", "LAYER 1: STRUCTURE");
    text(s, "The system starts with the people who own the work.", 54, 205, 700, 28, { fontSize: 21, color: C.muted });
    const roleData = [
      ["Boss Koo", "Company-wide visibility", C.navy, 70, 310],
      ["Project Manager", "Owns project direction", C.blue, 340, 310],
      ["HOD", "Owns departmental execution", C.teal, 610, 310],
      ["Staff", "Executes assigned work", C.coral, 880, 310],
    ];
    const roles = roleData.map(([name, sub, color, x, y]) => {
      const n = box(s, x, y, 190, 82, C.white, "rounded-xl", color, 2);
      box(s, x + 16, y + 18, 44, 44, color, "rounded-lg");
      text(s, name.split(" ").map((p) => p[0]).join(""), x + 16, y + 29, 44, 20, { fontSize: 16, bold: true, color: C.white, alignment: "center" });
      text(s, name, x + 74, y + 17, 100, 24, { fontSize: 16, bold: true, color: C.ink });
      text(s, sub, x + 74, y + 46, 100, 28, { fontSize: 13, color: C.muted, lineSpacing: 1.02 });
      return n;
    });
    arrowBetween(s, roles[0], roles[1], C.navy, "straight", 2);
    arrowBetween(s, roles[1], roles[2], C.blue, "straight", 2);
    arrowBetween(s, roles[2], roles[3], C.teal, "straight", 2);
    text(s, "PM → Department → HOD → Staff", 260, 500, 780, 34, { fontSize: 28, bold: true, color: C.ink, alignment: "center" });
    text(s, "Clients sit in the business context. Ownership stays inside the operating team.", 260, 550, 780, 24, { fontSize: 17, color: C.muted, alignment: "center" });
    addNotes(s, "Structure defines authority, ownership and reporting relationships.", "AiTask reflects a practical SME hierarchy where the PM routes work to a department, the HOD coordinates execution, and staff complete the work.", "Make the ownership model visible. A digital system cannot repair an operating model that nobody has defined.");
  }

  // 5. Discovery
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 5, "Business discovery reveals the real work", "LAYER 2: PROCESS DESIGN");
    text(s, "The first deliverable is understanding how work actually moves.", 54, 205, 760, 28, { fontSize: 21, color: C.muted });
    const steps = [
      ["Listen", "Interview management and department leads"],
      ["Observe", "Follow daily work and repeated handoffs"],
      ["Map", "Identify approvals, bottlenecks and information flow"],
      ["Define", "Agree what good execution should look like"],
    ];
    const nodes = steps.map(([title, sub], i) => addStep(s, 64 + i * 292, 302, 250, 158, i + 1, title, sub, C.white, [C.navy, C.blue, C.teal, C.coral][i]));
    nodes.slice(0, -1).forEach((n, i) => arrowBetween(s, n, nodes[i + 1], [C.navy, C.blue, C.teal][i], "straight", 2));
    box(s, 64, 518, 1100, 80, C.navy, "rounded-xl");
    text(s, "Representative SME challenge", 90, 539, 220, 22, { fontSize: 15, bold: true, color: "#A8BCD7" });
    text(s, "Tasks arrive through WhatsApp, email and verbal instructions. The issue is not a lack of communication. It is a lack of one connected process.", 315, 531, 810, 34, { fontSize: 20, bold: true, color: C.white, lineSpacing: 1.05 });
    addNotes(s, "Process design starts with discovery, not configuration.", "A marketing deliverable may move from a PM to a HOD to a designer, then back for review. Mapping that reality exposes where the workflow needs clarity.", "Treat the existing business as the source of truth. The system should simplify it without hiding the accountability behind it.");
  }

  // 6. Conventional vs first-principles
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 6, "The design approach determines the outcome", "WHY FIRST PRINCIPLES MATTERS");
    text(s, "Both approaches may use existing software. The difference is where the design begins.", 54, 205, 930, 28, { fontSize: 21, color: C.muted });
    box(s, 70, 282, 500, 300, C.soft, "rounded-xl", C.line, 1);
    text(s, "Conventional implementation", 100, 310, 400, 28, { fontSize: 23, bold: true, color: C.ink });
    const left = ["Identify a problem", "Purchase software", "Configure it", "Ask employees to use it", "Discover workflow gaps"];
    left.forEach((v, i) => { text(s, `${i + 1}`, 102, 365 + i * 40, 22, 22, { fontSize: 14, bold: true, color: C.coral }); text(s, v, 140, 362 + i * 40, 350, 24, { fontSize: 17, color: C.ink }); });
    box(s, 680, 282, 500, 300, C.tealSoft, "rounded-xl", C.teal, 1);
    text(s, "First-principles transformation", 710, 310, 430, 28, { fontSize: 23, bold: true, color: C.ink });
    const right = ["Understand structure", "Define responsibilities", "Redesign workflows", "Build or integrate applications", "Use data to improve behaviour"];
    right.forEach((v, i) => { text(s, `${i + 1}`, 712, 365 + i * 40, 22, 22, { fontSize: 14, bold: true, color: C.teal }); text(s, v, 750, 362 + i * 40, 370, 24, { fontSize: 17, color: C.ink }); });
    text(s, "AiTask follows the second sequence.", 350, 635, 580, 28, { fontSize: 21, bold: true, color: C.blue, alignment: "center" });
    addNotes(s, "First principles is a design method, not a requirement to build everything from scratch.", "AiTask could use existing components or integrate future applications, as long as the result fits the organization’s responsibility and process model.", "The decision is about fit and operating logic. Custom software is not automatically better, and off-the-shelf software is not automatically wrong.");
  }

  // 7. AiTask workflow
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 7, "The operating model becomes a digital workflow", "LAYER 3: APPLICATIONS");
    text(s, "AiTask translates role relationships into repeatable actions.", 54, 205, 740, 28, { fontSize: 21, color: C.muted });
    const steps = [
      ["PM", "Creates task", C.navy],
      ["Department", "Receives work", C.blue],
      ["HOD", "Assigns staff", C.teal],
      ["Staff", "Performs work", C.coral],
      ["Review", "Checks output", C.yellow],
      ["Complete", "Records result", C.green],
    ];
    const nodes = steps.map(([label, sub, accent], i) => {
      const x = 50 + i * 198;
      const n = box(s, x, 330, 160, 118, C.white, "rounded-xl", accent, 2);
      box(s, x + 52, 346, 56, 36, accent, "rounded-lg");
      text(s, label, x + 10, 355, 140, 20, { fontSize: 15, bold: true, color: C.white, alignment: "center" });
      text(s, sub, x + 16, 405, 128, 28, { fontSize: 16, color: C.ink, alignment: "center", verticalAlignment: "middle" });
      return n;
    });
    nodes.slice(0, -1).forEach((n, i) => arrowBetween(s, n, nodes[i + 1], steps[i + 1][2], "straight", 2));
    box(s, 94, 518, 1000, 64, C.white, "rounded-xl", C.line, 1);
    text(s, "Technology supports the organizational structure. It does not erase the roles that make the process accountable.", 120, 537, 950, 24, { fontSize: 20, bold: true, color: C.ink, alignment: "center" });
    addNotes(s, "AiTask is a practical example of structure becoming workflow.", "A PM selects the responsible department, the HOD assigns staff, staff performs the work, and review actions remain visible.", "Start with the sequence of work. Then decide which parts the system should automate, record or surface to the next role.");
  }

  // 8. Actions and statuses + screenshot
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 8, "Users take actions. The system manages states", "WORKFLOW SIMPLIFICATION");
    text(s, "A good workflow makes the next useful action obvious.", 54, 205, 680, 28, { fontSize: 21, color: C.muted });
    const states = [
      ["Start task", "In progress", C.blue],
      ["Send for review", "Awaiting review", C.yellow],
      ["Request revision", "Needs action", C.coral],
      ["Approve", "Completed", C.green],
    ];
    states.forEach(([action, status, accent], i) => {
      const y = 300 + i * 68;
      box(s, 72, y, 246, 46, C.soft, "rounded-lg");
      text(s, action, 90, y + 12, 130, 20, { fontSize: 16, bold: true, color: C.ink });
      text(s, "→", 220, y + 11, 25, 20, { fontSize: 18, bold: true, color: C.muted, alignment: "center" });
      box(s, 330, y, 190, 46, accent, "rounded-lg");
      text(s, status, 342, y + 12, 166, 20, { fontSize: 15, bold: true, color: C.white, alignment: "center" });
    });
    text(s, "Example: review responsibility is visible in the task context.", 72, 595, 490, 34, { fontSize: 16, color: C.muted, lineSpacing: 1.12 });
    addImage(s, reviewBlob, "image/png", 638, 235, 560, 338, "AiTask review responsibility interface");
    text(s, "Illustrative AiTask interface", 864, 590, 334, 18, { fontSize: 13, color: C.muted, alignment: "right" });
    addNotes(s, "Workflow simplicity helps adoption because people can focus on the next action rather than internal status logic.", "AiTask uses actions such as start, send for review and approve to move work through a configured lifecycle.", "Hide unnecessary complexity from employees. Keep the system’s rules explicit enough to preserve accountability and history.");
  }

  // 9. Departments
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 9, "One project can coordinate multiple departments", "CROSS-DEPARTMENT COLLABORATION");
    text(s, "Digital transformation breaks information silos without removing accountability.", 54, 205, 900, 28, { fontSize: 21, color: C.muted });
    const center = box(s, 508, 310, 264, 120, C.navy, "rounded-xl");
    text(s, "Marketing project", 540, 342, 200, 28, { fontSize: 24, bold: true, color: C.white, alignment: "center" });
    text(s, "One shared outcome", 540, 380, 200, 20, { fontSize: 15, color: "#A8BCD7", alignment: "center" });
    const deps = [
      ["Content", "Brief and copy", 180, 245, C.blue],
      ["Design", "Visual assets", 180, 465, C.teal],
      ["Video", "Short-form edit", 860, 245, C.coral],
      ["PM / client", "Direction and review", 860, 465, C.yellow],
    ];
    deps.forEach(([name, sub, x, y, accent]) => {
      const d = box(s, x, y, 230, 84, C.white, "rounded-xl", accent, 2);
      text(s, name, x + 16, y + 17, 198, 22, { fontSize: 19, bold: true, color: C.ink, alignment: "center" });
      text(s, sub, x + 16, y + 48, 198, 18, { fontSize: 14, color: C.muted, alignment: "center" });
      arrowBetween(s, d, center, accent, "straight", 2);
    });
    text(s, "Shared project context  /  Department ownership  /  Clear review path", 270, 600, 740, 24, { fontSize: 19, bold: true, color: C.ink, alignment: "center" });
    addNotes(s, "Cross-department collaboration works when the shared project context is visible but responsibility remains local.", "A marketing project can route content, design and video tasks to separate departments while the PM keeps the project outcome in view.", "Use one account and one project context where useful, but preserve the department boundaries that make ownership clear.");
  }

  // 10. Notifications + popup screenshot
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 10, "Notifications replace repeated follow-ups", "OPERATIONAL COMMUNICATION");
    text(s, "The right information reaches the right person at the right time.", 54, 205, 820, 28, { fontSize: 21, color: C.muted });
    const before = box(s, 70, 298, 390, 240, C.soft, "rounded-xl", C.line, 1);
    text(s, "Before", 100, 328, 150, 25, { fontSize: 24, bold: true, color: C.ink });
    addBulletList(s, ["Manager asks for an update", "Employee searches messages", "Review request may be missed"], 100, 380, 300, 120, { fontSize: 18, color: C.ink, lineSpacing: 1.36 });
    text(s, "Manual follow-up", 100, 493, 220, 20, { fontSize: 14, bold: true, color: C.coral });
    const after = box(s, 500, 298, 390, 240, C.tealSoft, "rounded-xl", C.teal, 1);
    text(s, "After", 530, 328, 150, 25, { fontSize: 24, bold: true, color: C.ink });
    addBulletList(s, ["Assignment notification", "Review request", "Revision or deadline update"], 530, 380, 300, 120, { fontSize: 18, color: C.ink, lineSpacing: 1.36 });
    text(s, "Action-based updates", 530, 493, 240, 20, { fontSize: 14, bold: true, color: C.teal });
    arrowBetween(s, before, after, C.blue, "straight", 2);
    addImage(s, popupBlob, "image/png", 964, 230, 240, 430, "AiTask in-app notification example");
    text(s, "AiTask evidence", 964, 670, 240, 18, { fontSize: 13, color: C.muted, alignment: "right" });
    addNotes(s, "Notifications turn workflow events into timely prompts instead of relying on memory and repeated messaging.", "A review-ready task can surface an in-app alert with the task name, timing and a direct action.", "Use alerts to reinforce the process. Notifications should point people to useful work, not create a second stream of noise.");
  }

  // 11. Recurring services
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 11, "Recurring services become structured operations", "ONGOING BUSINESS COMMITMENTS");
    text(s, "A monthly service is a cycle of commitments, not a pile of unrelated tasks.", 54, 205, 880, 28, { fontSize: 21, color: C.muted });
    const cycle = [
      ["Service plan", C.navy],
      ["Monthly cycle", C.blue],
      ["Deliverables", C.teal],
      ["Tasks", C.coral],
      ["Review", C.yellow],
      ["Renewal", C.green],
    ];
    const nodes = cycle.map(([label, accent], i) => {
      const angle = -Math.PI / 2 + i * (Math.PI * 2 / cycle.length);
      const cx = 480 + Math.cos(angle) * 220;
      const cy = 430 + Math.sin(angle) * 150;
      const n = box(s, cx - 82, cy - 32, 164, 64, C.white, "rounded-xl", accent, 2);
      text(s, label, cx - 70, cy - 11, 140, 22, { fontSize: 16, bold: true, color: C.ink, alignment: "center", verticalAlignment: "middle" });
      return n;
    });
    nodes.forEach((n, i) => arrowBetween(s, n, nodes[(i + 1) % nodes.length], cycle[(i + 1) % nodes.length][1], "curved", 2));
    box(s, 850, 295, 330, 250, C.white, "rounded-xl", C.line, 1);
    text(s, "Operational memory", 880, 326, 260, 24, { fontSize: 22, bold: true, color: C.ink });
    addBulletList(s, ["Previous deliverables remain visible", "Deadlines connect to the monthly plan", "Review and renewal history stays together"], 880, 382, 260, 130, { fontSize: 17, color: C.ink, lineSpacing: 1.34 });
    addNotes(s, "Recurring service plans connect daily work to ongoing client commitments.", "A monthly social media service can create a cycle of deliverables, tasks, reviews and renewal decisions.", "The SME gains consistency without rebuilding the entire coordination process every month.");
  }

  // 12. Modular applications
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 12, "One organizational foundation, multiple applications", "LAYER 3: MODULARITY");
    text(s, "AiTask can be one operational application within a broader digital ecosystem.", 54, 205, 900, 28, { fontSize: 21, color: C.muted });
    const hub = box(s, 475, 332, 330, 128, C.navy, "rounded-xl");
    text(s, "Shared organizational\nfoundation", 520, 350, 240, 54, { fontSize: 24, bold: true, color: C.white, alignment: "center", lineSpacing: 1.02 });
    text(s, "Users  /  roles  /  departments  /  authorization", 510, 418, 260, 18, { fontSize: 13, color: "#A8BCD7", alignment: "center" });
    const apps = [
      ["AiTask", "Project + task work", 90, 255, C.blue],
      ["HR", "People records", 90, 470, C.teal],
      ["CRM", "Client context", 970, 255, C.coral],
      ["Finance", "Commercial tracking", 970, 470, C.yellow],
      ["Documents", "Shared records", 430, 520, C.green],
      ["AI automation", "Future opportunity", 690, 520, "#7C5CFC"],
    ];
    apps.forEach(([name, sub, x, y, accent]) => {
      const a = box(s, x, y, 220, 72, C.white, "rounded-xl", accent, 2);
      text(s, name, x + 15, y + 14, 190, 22, { fontSize: 18, bold: true, color: C.ink, alignment: "center" });
      text(s, sub, x + 15, y + 42, 190, 16, { fontSize: 13, color: C.muted, alignment: "center" });
      arrowBetween(s, a, hub, accent, "straight", 1.5);
    });
    text(s, "Potential integrations, not existing AiTask features", 400, 650, 480, 18, { fontSize: 13, color: C.muted, alignment: "center" });
    addNotes(s, "Modularity means applications share the organizational foundation without forcing every function into one oversized product.", "AiTask can remain focused on projects and tasks while future HR, CRM, finance or document applications exchange authorized data.", "Build reusable foundations first. Add applications when the business need is clear, not because a platform can theoretically do everything.");
  }

  // 13. Data to behavior
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 13, "From operational data to organizational behaviour", "LAYER 4 → 5: DATA TO BEHAVIOUR");
    text(s, "Data matters when it helps people make a better next decision.", 54, 205, 780, 28, { fontSize: 21, color: C.muted });
    const steps = [
      ["Activity", "Staff completes a task", C.navy],
      ["Data", "Completion time, history and result are recorded", C.blue],
      ["Insight", "A recurring delay becomes visible", C.teal],
      ["Decision", "PM and HOD adjust allocation or timing", C.yellow],
      ["Behaviour", "Assignments become clearer and intervention happens earlier", C.coral],
      ["Improvement", "The next project benefits from the change", C.green],
    ];
    const nodes = steps.map(([label, sub, accent], i) => {
      const x = 54 + i * 195;
      const y = i % 2 === 0 ? 324 : 478;
      const n = box(s, x, y, 158, 98, C.white, "rounded-xl", accent, 2);
      text(s, label, x + 12, y + 18, 134, 22, { fontSize: 17, bold: true, color: accent, alignment: "center" });
      text(s, sub, x + 14, y + 50, 130, 38, { fontSize: 13, color: C.ink, alignment: "center", lineSpacing: 1.06 });
      return n;
    });
    nodes.forEach((n, i) => { if (i < nodes.length - 1) arrowBetween(s, n, nodes[i + 1], steps[i + 1][2], "straight", 2); });
    text(s, "Avoid using employee monitoring or punitive scoring as the primary example.", 270, 640, 740, 22, { fontSize: 16, color: C.muted, alignment: "center" });
    addNotes(s, "Connected data should improve decisions and behaviours, not become surveillance for its own sake.", "If a workflow repeatedly stalls at review, the PM and HOD can adjust allocation, timing or the review rule.", "Choose data that serves an operational purpose, protect it with permissions and governance, and connect it to a decision people can act on.");
  }

  // 14. Role-based visibility + dashboard screenshot
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 14, "One operational record, different management questions", "LAYER 4: VISIBILITY");
    text(s, "The same data becomes useful at different levels of the organization.", 54, 205, 860, 28, { fontSize: 21, color: C.muted });
    const qs = [
      ["Staff", "What should I work on today?", C.coral],
      ["HOD", "Which tasks need assignment or review?", C.teal],
      ["PM", "Which projects need attention?", C.blue],
      ["Boss Koo", "Where are delays or workload risks?", C.navy],
    ];
    qs.forEach(([role, q, accent], i) => {
      const y = 294 + i * 74;
      box(s, 70, y, 430, 54, C.soft, "rounded-lg", accent, 1);
      text(s, role, 90, y + 15, 110, 22, { fontSize: 16, bold: true, color: accent });
      text(s, q, 220, y + 15, 250, 22, { fontSize: 16, color: C.ink });
    });
    text(s, "Role-based dashboards", 70, 611, 430, 24, { fontSize: 20, bold: true, color: C.ink, alignment: "center" });
    addImage(s, dashboardBlob, "image/png", 570, 252, 628, 352, "AiTask management dashboard");
    text(s, "Illustrative dashboard view", 970, 620, 228, 18, { fontSize: 13, color: C.muted, alignment: "right" });
    addNotes(s, "Management visibility comes from structured operational records presented to the right role.", "A staff member needs today’s work, while a PM needs project health and Boss Koo needs company-wide attention points.", "Do not give every user every detail. Give each role enough context to make the next responsible decision.");
  }

  // 15. Governance and improvement
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 15, "Connected data needs governance and feedback", "LAYER 6: IMPROVEMENT");
    text(s, "Better processes create better data. Better data enables better decisions. The loop continues.", 54, 205, 1010, 28, { fontSize: 21, color: C.muted });
    const loop = [
      ["Better processes", C.navy, 140, 328],
      ["Better data", C.blue, 390, 250],
      ["Better decisions", C.teal, 690, 250],
      ["Better behaviour", C.coral, 940, 328],
      ["Improved process", C.green, 690, 500],
    ];
    const nodes = loop.map(([label, accent, x, y]) => {
      const n = box(s, x, y, 180, 68, C.white, "rounded-xl", accent, 2);
      text(s, label, x + 14, y + 22, 152, 20, { fontSize: 17, bold: true, color: accent, alignment: "center" });
      return n;
    });
    arrowBetween(s, nodes[0], nodes[1], C.navy, "straight", 2);
    arrowBetween(s, nodes[1], nodes[2], C.blue, "straight", 2);
    arrowBetween(s, nodes[2], nodes[3], C.teal, "straight", 2);
    arrowDown(s, nodes[3], nodes[4], C.coral, "elbow", 2);
    text(s, "Feedback loop", 484, 566, 160, 20, { fontSize: 14, bold: true, color: C.green, alignment: "center" });
    box(s, 160, 600, 950, 46, C.white, "rounded-lg", C.line, 1);
    text(s, "Governance: collect data for a clear operational purpose, with appropriate permissions, privacy and accountability.", 180, 613, 910, 20, { fontSize: 16, color: C.ink, alignment: "center" });
    addNotes(s, "Continuous improvement needs a feedback loop and guardrails for data use.", "A recurring delay can trigger a workflow simplification, a change in workload distribution or a targeted automation.", "Treat data quality and privacy as part of the operating model. The goal is improvement, not collection for its own sake.");
  }

  // 16. Implementation journey
  {
    const s = presentation.slides.add();
    s.background.fill = C.white;
    addChrome(s, 16, "The implementation journey is iterative", "FROM DESIGN TO ADOPTION");
    text(s, "AiTask develops as the organization learns what needs to be clearer, faster or safer.", 54, 205, 930, 28, { fontSize: 21, color: C.muted });
    const stages = [
      ["Process discovery", "Roles and current work", C.navy],
      ["Workflow design", "Delegation and approval rules", C.blue],
      ["Platform development", "Projects, tasks and access", C.teal],
      ["Operational integration", "Reviews, notifications and cycles", C.coral],
      ["Management intelligence", "Visibility and dashboards", C.yellow],
      ["Stabilization and adoption", "Testing, permissions and daily use", C.green],
    ];
    const nodes = stages.map(([label, sub, accent], i) => {
      const x = 62 + i * 196;
      const y = i % 2 === 0 ? 310 : 470;
      const n = box(s, x, y, 168, 108, C.white, "rounded-xl", accent, 2);
      box(s, x + 56, y - 18, 56, 34, accent, "rounded-lg");
      text(s, String(i + 1), x + 56, y - 10, 56, 18, { fontSize: 14, bold: true, color: C.white, alignment: "center" });
      text(s, label, x + 12, y + 24, 144, 36, { fontSize: 16, bold: true, color: C.ink, alignment: "center", lineSpacing: 1.02 });
      text(s, sub, x + 14, y + 70, 140, 28, { fontSize: 13, color: C.muted, alignment: "center", lineSpacing: 1.04 });
      return n;
    });
    nodes.slice(0, -1).forEach((n, i) => arrowBetween(s, n, nodes[i + 1], stages[i + 1][2], "curved", 2));
    text(s, "Iteration is part of the method, not a sign that the transformation failed.", 210, 635, 860, 24, { fontSize: 20, bold: true, color: C.blue, alignment: "center" });
    addNotes(s, "Transformation stabilizes through repeated design, implementation, testing and adoption.", "AiTask examples include refining PM to HOD delegation, simplifying task statuses, improving HOD permissions and making notifications more visible.", "Expect the first operating version to teach the organization where rules are unclear. Use that learning to improve the system deliberately.");
  }

  // 17. Before/after table
  {
    const s = presentation.slides.add();
    s.background.fill = C.light;
    addChrome(s, 17, "The operating model changes in practical ways", "INTENDED OPERATIONAL IMPROVEMENTS");
    text(s, "The comparison below describes intended improvements, not measured outcomes.", 54, 205, 900, 28, { fontSize: 21, color: C.muted });
    const values = [
      ["Business area", "Before", "After"],
      ["Task assignment", "Messages and verbal instructions", "Structured delegation"],
      ["Responsibility", "Sometimes unclear", "Role-based ownership"],
      ["Progress tracking", "Manual follow-ups", "Centralized task tracking"],
      ["Approval", "Scattered communication", "Recorded workflow"],
      ["Notifications", "Manual reminders", "Automated in-app alerts"],
      ["Monthly services", "Repeated manual coordination", "Structured monthly cycles"],
      ["Management reporting", "Manual consolidation", "Operational dashboards"],
      ["Historical records", "Scattered information", "Centralized audit history"],
    ];
    const table = s.tables.add({ rows: values.length, columns: 3, left: 72, top: 285, width: 1135, height: 330, columnWidths: [260, 420, 455], values });
    table.borders.assign({ style: "solid", fill: C.line, width: 1 });
    table.styleOptions = { headerRow: true, bandedRows: false };
    values.forEach((row, r) => row.forEach((value, c) => {
      const cell = table.getCell(r, c);
      cell.text.style = safeTextStyle({ fontSize: r === 0 ? 15 : 14, bold: r === 0 || c === 0, color: r === 0 ? C.white : c === 0 ? C.ink : C.muted, verticalAlignment: "middle", insets: { left: 10, right: 10, top: 5, bottom: 5 } });
      cell.fill = r === 0 ? C.navy : r % 2 === 0 ? C.white : C.soft;
    }));
    text(s, "Representative case-study framing; validate outcomes with client data before making performance claims.", 72, 640, 1135, 20, { fontSize: 14, color: C.muted, alignment: "center" });
    addNotes(s, "Digital transformation shows up in daily operating choices: who owns work, how progress is seen and how history is retained.", "The table contrasts manual coordination with structured delegation, review history, in-app alerts and operational dashboards.", "Use the comparison as a design target. Measure outcomes later rather than presenting intended improvements as verified results.");
  }

  // 18. Conclusion
  {
    const s = presentation.slides.add();
    s.background.fill = C.navy;
    addBrand(s, true);
    text(s, "Digital transformation is the redesign of how an organization operates", 72, 132, 900, 100, { fontSize: 42, bold: true, color: C.white, lineSpacing: 0.98 });
    text(s, "Structure creates clarity. Processes create consistency. Applications enable execution. Data creates visibility. Behaviour creates lasting transformation.", 76, 282, 930, 68, { fontSize: 23, color: "#C9D7E8", lineSpacing: 1.14 });
    const end = [
      ["Structure", C.navy2],
      ["Process", C.blue],
      ["Applications", C.teal],
      ["Data", C.yellow],
      ["Behaviour", C.coral],
      ["Improvement", C.green],
    ];
    end.forEach(([label, accent], i) => {
      const x = 76 + i * 176;
      box(s, x, 430, 150, 58, accent, "rounded-xl");
      text(s, label, x + 10, 448, 130, 20, { fontSize: 16, bold: true, color: C.white, alignment: "center" });
      if (i < end.length - 1) arrowBetween(s, box(s, x + 152, 458, 6, 6, "none"), box(s, x + 168, 458, 6, 6, "none"), "#A8BCD7", "straight", 1.5);
    });
    box(s, 76, 565, 1040, 66, C.white, "rounded-xl");
    text(s, "Digital transformation succeeds when technology becomes part of how people naturally work, rather than another system they are forced to manage.", 100, 584, 990, 28, { fontSize: 19, bold: true, color: C.ink, alignment: "center", verticalAlignment: "middle" });
    text(s, "AiTask case study", 1040, 668, 160, 18, { fontSize: 13, color: "#A8BCD7", alignment: "right" });
    addNotes(s, "The conclusion returns to the design philosophy: structure to process to applications to data to behaviour to improvement.", "AiTask demonstrates how a focused operational platform can help a company make responsibility, progress and review part of normal work.", "The long-term goal is a more connected, accountable organization, with technology supporting the way people already need to work.");
  }

  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  for (const [index, slide] of presentation.slides.items.entries()) {
    const png = await presentation.export({ slide, format: "png", scale: 1 });
    await fs.writeFile(path.join(buildDir, `slide-${String(index + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
  }
  const montage = await presentation.export({ format: "webp", montage: true });
  await fs.writeFile(path.join(buildDir, "deck-montage.webp"), new Uint8Array(await montage.arrayBuffer()));

  const stagingDir = path.join(workspaceDir, ".codex-finalizer");
  await fs.mkdir(stagingDir, { recursive: true });
  const candidatePath = path.join(stagingDir, "aitask-digital-transformation-v4-candidate.pptx");
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href);
  const requirements = {
    explicitTotalSlideCount: 18,
    requiredNativeTableOwnerSlides: [17],
    requiredNativeChartOwnerSlides: [],
  };
  const result = await finalizePresentation({
    ...requirements,
    workspaceDir,
    candidatePath,
    finalPath,
    pythonExecutable: runtimePython,
    integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
    layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit", "--require-native-table-slide", "17"],
    requiredNativeTableOwnerSlides: [17],
    fontPolicy: { basis: "design", families: [FONT] },
    verifyArtifactToolImport: true,
    receiptPath: path.join(stagingDir, `${path.basename(finalPath)}.validation.json`),
  });
  console.log(JSON.stringify({ finalPath, buildDir, validation: result }, null, 2));
}

function slideLoopBack(slide, from, to) {
  const connector = slide.shapes.connect(from, to, {
    kind: "curved",
    fromSide: "left",
    toSide: "left",
    line: { style: "dashed", fill: C.green, width: 2 },
    head: { type: "arrow", width: "med", length: "med" },
  });
  connector.bringToFront();
  return connector;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

