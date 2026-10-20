/**
 * QA gate for slideshow YAML: structure, word budgets, and the copy rules in CLAUDE.md.
 *
 *   npm run qa -- campaigns/2026-10/slideshow-*.yaml
 *
 * Run it on the week's batch before rendering. The app-slide question check compares the
 * files in one run, so pass the whole week together.
 *
 * FAIL = an unambiguous violation, fix it before rendering.
 * WARN = needs a human look (the rule depends on context).
 * Exits 1 if any FAIL.
 */
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { hasForeignTicket, stripForeignTickets } from "./lib/legal";

// The custody caveat list. One airing per post at most, never on the hook or the app
// slide. Bare "still yours" in a spend-vs-save contrast is about saving, not a Lodavo
// custody claim, so it gets a WARN below instead.
const CAVEAT = [
  /read[- ]only/i,
  /\bin your own (bank )?account\b|\bown bank account\b|stays? in your own (bank|account)/i,
  /never leaves? (your|it)|doesn'?t leave your|money never moves|no money moves/i,
  /holds? (no|none) (of )?your money|never holds? your money/i,
  /can'?t\s+(?:touch|move|withdraw|charge)\s+(?:your\s+(?:money|savings|balance|cash|funds)|it)\b/i,
  /\bPlaid\b/i,
  /Lodavo[^.]{0,40}\bno interest\b|pays? no interest/i,
  /(on Lodavo|your (savings|money))[^.]{0,30}stays? (100% )?yours/i,
];

// Unambiguous bans -> FAIL.
const BAN_FAIL: Record<string, RegExp> = {
  "em dash": /—/,
  '"compounds" (Lodavo pays no interest)': /\bcompounds?\b/i,
  '"a real/free shot" (say "a chance")':
    /\b(a|one)\s+(real|free)\s+shot\b|for a shot\b/i,
  "purchase framing (tickets are free)": /\bbuys? you\b|buy a (chance|ticket)/i,
  "app as subject of a perception verb":
    /\bLodavo\s+(sees|can see|watches|monitors|knows|tracks)\b/i,
  "money moving INTO Lodavo":
    /\b(in|into)\s+lodavo\b|sav\w+\s+in\s+lodavo|auto-?transfer/i,
  "transfer/deposit into Lodavo":
    /\btransfer(s|red|ring)?\s+(to|into)\s+lodavo\b/i,
  'nothing to "pull out" of Lodavo': /pull (it|them|that) (back )?out/i,
  '"turns saving into a game/tickets"': /turns? (your |the )?sav\w+ into/i,
  '"signals" as a verb': /\bsignals\b/i,
  "throat-clearing opener":
    /Here'?s the (thing|honest|truth|real|short|plain)|Let'?s be honest|To be clear/i,
  'bare "win prizes" / "guaranteed"': /\bwin prizes\b|\bguaranteed\b/i,
  'ampersand (spell out "and")': /\s&\s/,
  '"pick" numbers (say "choose")': /\bpick(s|ing)?\s+(your\s+)?numbers?\b/i,
  "Lodavo called a bank/savings account":
    /lodavo is a (bank|savings account)|your lodavo account/i,
  // Chequing accounts qualify too, so the connect step never narrows to savings.
  '"connect your savings account" (chequing qualifies too)':
    /\b(connect|link)(ing|s|ed)?\s+(your|a|an|the)\s+(own\s+)?savings\s+account|\bconnect(ez|er)\s+(votre|un|le)\s+compte\s+d?'?\s*épargne/i,
  // Money doesn't BECOME a ticket; saving EARNS one.
  'money "becomes a ticket" (saving EARNS one)':
    /\bbecomes?\s+\*{0,2}(?:an?|\d+|one|your)\s*\*{0,2}\s*tickets?\b/i,
  '"100% yours" (says nothing)': /\b100%\s+yours\b/i,
  '"Same money" (says nothing)': /\bsame money\b/i,
  'empty closer ("that\'s the difference" / "it\'s that simple")':
    /\bthat'?s the difference\b|\bit'?s that simple\b|\bdo the math\b/i,
  '"safe / can\'t lose / risk-free" (state the mechanism instead)':
    /\bcan'?t lose\b|\bcannot lose\b|\brisk-?free\b|\b100% safe\b|\bcompletely safe\b/i,
  '"18+" (it is the age of majority)':
    /\b18\s*\+|\b18 (or older|and over)\b|\b18 ans\b/i,
};

// Context-dependent -> WARN.
const BAN_WARN: Record<string, RegExp> = {
  '"quietly" (fine on a person, not on a thing)':
    /\bquietly\b|\bsubtly\b|\bsilently\b|\bseamlessly\b|\bdiscrètement\b/i,
  '"the bank you already use" (for no-switching, not as the connect step)':
    /\bbank(ing)?\s+(account\s+)?you\s+already\s+(use|have)\b|banque\s+que\s+vous\s+utilisez\s+déjà/i,
  '"members" (Lodavo has users)': /\bmembers?\b/i,
  '"deposit" (OK if it\'s a rental or other deposit)': /\bdeposits?\b/i,
  '"gambling/betting" (OK as a comparison, never for Lodavo)':
    /\bgambl|\bbetting\b|\bwager/i,
  '"stays/still yours" (fine as spend-vs-save contrast, not often)':
    /stays? yours|still yours/i,
  '"turns into"/"becomes" (fine for accumulation, not for abstractions)':
    /\b(turns?|turning|turned|becomes?|becoming)\s+into\b|\bwhat\b[^.]{0,40}\bbecomes\b/i,
  '"52 tickets" ($25 a week for a year is 1,378, not 52)':
    /\b52\s+(free\s+)?(tickets|billets)\b/i,
  '"entries" (say tickets)': /\bentries\b|\bparticipations\b/i,
  // The greppable AI tells: report them, a human decides.
  'antithesis "it isn\'t X, it\'s Y" (one per piece at most)':
    /\b(isn'?t|is not|not)\s+(about\s+|just\s+)?[^.,;!?]{2,45},\s*(it'?s|but)\s+(about\s+)?/i,
  'bluntness verb ("puts it plainly")':
    /\b(says?|said|puts? it|states?|is|are|makes? it|spells? it)\s+(it\s+)?(flatly|plainly|bluntly|clearly|explicitly|categorical(ly)?|unambiguous(ly)?|blunt|explicit)\b/i,
  'counted lead-in ("Three things to know…")':
    /^(?:There are |Two |Three |Four |Five |Six )(?:things?|reasons?|ways?|steps?|rules?|mistakes?)\b/im,
  "significance signpost / surprise claim":
    /worth (pausing|sitting|noting|a look)|bigger (deal )?than it (sounds|looks)|more than it sounds|surprises people|people (don'?t|do not) realize|find surprising|the part people (miss|underestimate)/i,
  '"-ing" tail ("…, making it a strong option")':
    /,\s(?:making|ensuring|allowing|helping|providing|offering|leading to|creating|enabling|highlighting)\s+[a-z]/,
  '"think of it as"': /\bthink of (it|this|them|that) (as|like)\b/i,
  '"whether you\'re X or Y"': /\bwhether (you|it|they)\b[^.]{0,80}\bor\b/i,
  'reduction cliché ("comes down to")':
    /\b(comes? down to|boils? down to|at its core|in essence)\b/i,
  "stock AI vocabulary":
    /\b(delve|leverage|robust|seamless(ly)?|utilize|myriad|plethora|pivotal|game.changer|transformative|unleash|elevate|empower|supercharge|deep dive|heavy lifting|move the needle|secret sauce|unlock(s|ed|ing)?)\b/i,
  'scaffolding noun ("the saving part")':
    /\bthe (sav|spend|budget|bank|invest|earn|track|connect)ing (part|bit|piece|side|aspect)\b/i,
  // "every $25 you have saved" is the balance claim and is correct; only the
  // comparative ("the more you have put aside") is the tell.
  'compound tense where the present says it ("the more you have put aside")':
    /\bthe more you(?:'|’)?(?:ve| have| had)\s+\w+/i,
  'orphan reference ("in the next one": the next what?)':
    /\b(?:in|on|for|with|from|to)\s+(?:the (?:next|other|first|last)|that|this)\s+one\b/i,
  'reassurance tail ("…and none of them is a reason to")':
    /\b(?:none of (?:them|these|which)|neither|not one of them)\b[^.:;]{0,24}\ba reason\b/i,
  '"Real X from real Y" (name the thing instead)':
    /\breal \w+ (?:from|and|,) ?real \w+/i,
  'question as throat-clearing ("Fair question:")':
    /\b(fair|good|great|honest) question\s*[:,]/i,
  'displaced negation ("holds none of your money")':
    /\b(holds?|keeps?|takes?|sees?|runs?|reports?|charges?|has)\s+(none of|nothing|no one|nobody)\b/i,
  "rule of three (keep only if the third carries a fact)":
    /\b\w+,\s+\w+,?\s+and\s+(completely|totally|entirely|100%)?\s*\w+\b(?=[.!])/i,
};

type Slide = Record<string, any>;

// Word budgets, [warn above, fail above]. The account's old branded cards ran 40-60
// words a slide and rarely passed 50 views; the slideshows that hit 100K+ run a 5-9 word
// hook and a short line per slide. The app slide is a plain question and the sentence
// that answers it.
const WORDS: Record<string, [number, number]> = {
  hook: [10, 14],
  value: [16, 24],
  cta: [20, 24],
};
const wordCount = (s: string): number =>
  s.split(/\s+/).filter((w) => /[\p{L}\p{N}$]/u.test(w)).length;

// The custody caveat never rides a slide whose job is to sell the feeling.
const SELLS = new Set(["hook", "cta"]);
const roleOf = (s: Slide, i: number): string =>
  i === 0 ? "hook" : s.app ? "cta" : "value";

// Strip the *gold* markers first: one landing mid-phrase silently defeats a regex.
const unmark = (s: string): string => s.replace(/\*+/g, "");
const text = (s: Slide): string => unmark(`${s.text || ""} ${s.sub || ""}`);

// Every post is someone's first, so the first slide that leans on the mechanic must say
// what it is: a dollar amount tied to a ticket by an earning verb.
const MECHANIC = /\btickets?\b|\bthe draw\b|\bsunday'?s draw\b|\bweekly draw\b/i;
const EARNS = /(?:earns?|earned|gets? you|gives? you|comes? with|=)/i;
const DEFINES = new RegExp(
  `\\$\\d[\\d,]*[^.]{0,50}${EARNS.source}[^.]{0,40}tickets?` +
    `|${EARNS.source}[^.]{0,40}tickets?[^.]{0,50}\\$\\d`,
  "i",
);

let files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!files.length)
  files = fs
    .readdirSync("campaigns")
    .filter((d) => /^\d{4}-\d{2}$/.test(d))
    .flatMap((d) =>
      fs
        .readdirSync(path.join("campaigns", d))
        .filter((f) => /^slideshow-.*\.yaml$/.test(f))
        .map((f) => path.join("campaigns", d, f)),
    );

let fails = 0;
let warns = 0;
const questions = new Map<string, string>(); // app-slide questions across the batch

for (const file of files) {
  const out: [string, string][] = [];
  let doc: any;
  try {
    doc = yaml.load(fs.readFileSync(file, "utf8"));
  } catch (e: any) {
    console.log(`\n${file}\n  FAIL  YAML does not parse: ${e.message.split("\n")[0]}`);
    fails++;
    continue;
  }
  const c = doc?.slideshow;
  if (!c) {
    console.log(`\n${file}\n  FAIL  no \`slideshow:\` root key`);
    fails++;
    continue;
  }
  const slides: Slide[] = c.slides || [];
  const last = slides[slides.length - 1];

  // structure, word budgets, and the facts behind the numbers
  if (!last?.app)
    out.push(["FAIL", "last slide is not the app slide (`app: hero|cta`)"]);
  if (slides.slice(0, -1).some((s) => s.app))
    out.push(["FAIL", "the app slide is only allowed last"]);
  if (!slides[0]?.text) out.push(["FAIL", "slide 1 has no hook text"]);
  if (slides.length > 10)
    out.push(["FAIL", `${slides.length} slides (the format is 5-8, 10 at most)`]);
  for (const [i, s] of slides.entries()) {
    const role = roleOf(s, i);
    const n = wordCount(text(s));
    const [warn, fail] = WORDS[role];
    if (n > fail)
      out.push(["FAIL", `slide ${i + 1} (${role}) has ${n} words, cap is ${fail}`]);
    else if (n > warn)
      out.push(["WARN", `slide ${i + 1} (${role}) has ${n} words, aim for ${warn} or fewer`]);
    if (role !== "cta" && !s.image) out.push(["WARN", `slide ${i + 1} has no photo`]);
  }
  if (last?.app && !/lodavo/i.test(`${last.text || ""} ${last.sub || ""}`))
    out.push(["FAIL", "the app slide never names Lodavo (a viewer can't search for it)"]);
  if (slides.some((s) => /\d/.test(text(s))) && !(c.sources || []).length)
    out.push(["FAIL", "slides state numbers but `sources:` is empty (verify every figure)"]);

  // The only legal text is the line the renderer puts on the last slide.
  if (/No purchase necessary/i.test(c.caption || ""))
    out.push(["FAIL", "caption carries legal text (the renderer places the only legal line)"]);

  // the custody caveat: once per post at most, never on the hook or the app slide
  let airings = 0;
  for (const [i, s] of slides.entries()) {
    if (!CAVEAT.some((re) => re.test(text(s)))) continue;
    airings++;
    if (SELLS.has(roleOf(s, i)))
      out.push(["FAIL", `custody caveat on the ${roleOf(s, i)} slide (it sells the feeling)`]);
  }
  if (CAVEAT.some((re) => re.test(c.caption || ""))) airings++;
  if (airings > 1)
    out.push(["FAIL", `custody caveat aired ${airings}x (once per post at most)`]);

  // banned phrasing, over the slides and the caption (not the sources)
  const copy = slides.map(text).join("\n") + "\n" + unmark(c.caption || "");
  for (const [label, re] of Object.entries(BAN_FAIL))
    if (re.test(copy)) out.push(["FAIL", `banned: ${label}`]);
  for (const [label, re] of Object.entries(BAN_WARN))
    if (re.test(copy)) out.push(["WARN", `check: ${label}`]);

  // The first slide that leans on Lodavo's mechanic must define it.
  for (const [i, s] of slides.entries()) {
    const t = stripForeignTickets(text(s));
    if (DEFINES.test(t)) break;
    if (MECHANIC.test(t)) {
      out.push([
        "WARN",
        `slide ${i + 1} (${roleOf(s, i)}) leans on the mechanic before it's explained: say "every $25 you save earns a free ticket" in the same breath`,
      ]);
      break;
    }
  }

  // "ticket" is Lodavo's word. Fine in a vs-lottery post, where "lottery tickets" is the
  // point; anywhere else, call the other one a pass or an entry fee.
  if (hasForeignTicket(copy) && /\btickets?\b/i.test(stripForeignTickets(copy)))
    out.push([
      "WARN",
      `"ticket" means both somebody else's ticket and ours in this post (fine in a lottery comparison; otherwise say "pass" or "entry fee")`,
    ]);

  // The app slide's question rotates: one follower sees several posts a week.
  const q = String(last?.text || "").trim();
  if (q) {
    const key = q.slice(0, 55);
    if (questions.has(key))
      out.push(["FAIL", `the app slide's question is retyped from ${questions.get(key)}`]);
    else questions.set(key, path.basename(file));
  }

  if (out.length) {
    console.log(`\n${file}`);
    for (const [lvl, msg] of out) {
      console.log(`  ${lvl}  ${msg}`);
      lvl === "FAIL" ? fails++ : warns++;
    }
  }
}

console.log(
  `\n${files.length} file(s) checked · ${fails} FAIL · ${warns} WARN` +
    (fails ? "\n\nFix every FAIL before rendering (rules: CLAUDE.md)." : "  ✓"),
);
process.exit(fails ? 1 : 0);
