/**
 * Legal text, and the test for whether a "ticket" is ours.
 *
 * The on-screen line is the only legal text a slideshow carries; the renderer puts it on
 * the last slide. The QA gate uses the ticket test: "ticket" is Lodavo's word for what
 * saving earns ($25 saved = 1 ticket), and also a festival, lottery or parking ticket, so
 * copy that means somebody else's ticket must not be read as a claim about ours.
 */

// Ticket senses that are NOT Lodavo's mechanic. The `to|for` clause is deliberately
// narrow: `tickets? for` alone would eat "a ticket for every $25 you save", which is the
// real mechanic. `ticket price(s)/sale(s)` is a ticket you buy; `ticket cost(s)` is not
// safe to strip ("a losing ticket costs you nothing" is ours).
const NOT_OUR_TICKET_SRC = String.raw`\b(?:festival|concert|show|gig|event|tour|presale|pre-?sale|resale|movie|cinema|theatre|theater|plane|flight|airline|train|bus|transit|parking|speeding|traffic|lottery|lotto|scratch|raffle|season|game|sports?|match|admission|ticketmaster|stubhub)[\s-]*tickets?\b|\btickets?\s+(?:to|for)\s+(?:the\s+|a\s+|an\s+)?(?:show|concert|festival|fest|game|match|movie|event)\b|\bticket\s+(?:prices?|sales?)\b|\bcost of (?:a|the) ticket\b|\bbillets?\s+(?:de\s+)?(?:festival|concert|spectacle|match|cinéma|loterie|avion|train|autobus|stationnement)\b`;

const NOT_OUR_TICKET_G = new RegExp(NOT_OUR_TICKET_SRC, "gi");
const NOT_OUR_TICKET = new RegExp(NOT_OUR_TICKET_SRC, "i");

// $10,000 is Lodavo's jackpot, and also an ordinary sum: "a $10,000 emergency fund"
// makes no prize claim.
const NOT_OUR_10K =
  /\$10[,.]?000\s+(?:emergency\s+fund|savings?\s+goal|salary|debt|loan|down\s?payment|in\s+debt|of\s+debt)|\b(?:emergency\s+fund|savings?\s+goal|salary|debt|loan|down\s?payment)\s+of\s+\$10[,.]?000/gi;

// Somebody else's jackpot. Ours is exactly $10,000, so a jackpot in the millions, or one
// with a lottery's name beside it, belongs to a lottery ("$80 million, Canada's biggest
// solo jackpot", "a Lotto 6/49 jackpot share").
const JACKPOT = String.raw`\b(?:jackpots?|gros\s+lots?)\b`;
const MILLIONS = String.raw`\d[\d,.\s]*\s*(?:millions?|billions?|milliards?|[MB])\b`;
const LOTTERY = String.raw`\b(?:lotto\s*max|lotto\s*6\/49|6\/49|lotto|lotter(?:y|ies)|loto(?:-qu[ée]bec)?|loteries?|powerball|mega\s*millions|euromillions|olg|bclc)\b`;
const NOT_OUR_JACKPOT = new RegExp(
  `${MILLIONS}[^.]{0,40}${JACKPOT}|${JACKPOT}[^.]{0,40}${MILLIONS}` +
    `|${LOTTERY}[^.]{0,40}${JACKPOT}|${JACKPOT}[^.]{0,40}${LOTTERY}`,
  "gi",
);
// A comparison line can hold both ("our $10,000 jackpot vs the $80 million Lotto Max
// one"); keep any span that carries our amount.
const OUR_AMOUNT = /(?<![\d,.])10[,.\s]?000(?![,.\s]?\d)/;
const blankForeignJackpot = (m: string, at: number, whole: string): string =>
  OUR_AMOUNT.test(whole.slice(Math.max(0, at - 14), at + m.length)) ? m : " ";

// The YAML's *gold* emphasis markers can land mid-phrase; strip them before matching.
const unmark = (s: string): string => s.replace(/\*+/g, "");

/** Blank out the ticket and jackpot senses that aren't Lodavo's. */
export const stripForeignTickets = (text: unknown): string =>
  unmark(String(text ?? ""))
    .replace(NOT_OUR_TICKET_G, " ")
    .replace(NOT_OUR_10K, " ")
    .replace(NOT_OUR_JACKPOT, blankForeignJackpot);

/** Does this text use "ticket" for something that is NOT Lodavo's mechanic? */
export const hasForeignTicket = (text: unknown): boolean =>
  NOT_OUR_TICKET.test(unmark(String(text ?? "")));

export const ON_SCREEN_DISCLAIMER = {
  en: "No purchase necessary. STQ required. Rules & odds: lodavo.com/rules",
  fr: "Aucun achat requis. QH requise. Règles & chances : lodavo.com/regles",
};
