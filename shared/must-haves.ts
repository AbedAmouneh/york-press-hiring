// Must-haves come in two kinds. Core ones are what the role is really about (Django, copy editing, InDesign) and
// decide the "must" score. Basic ones are office software, degrees, soft skills and plain language ability: people
// rarely write them on their profiles, so not seeing them says nothing and must never lower anyone's score.
// Pure helpers shared by the server (signals, scoring prompt) and the screens.

/** Words that never make a term on their own. */
export const STOP = new Set(["and", "or", "with", "the", "for", "in", "of", "a", "an", "to", "experience", "years", "year", "strong", "good", "knowledge", "skills", "practical", "web", "apps", "using", "integration", "based", "driven"]);

/** "TypeScript and JavaScript" → ["typescript", "javascript"]; "3+ years of Python" → ["python"]. */
export function mustHaveTerms(mustHave: string): string[] {
  return mustHave
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    // "children's" → "children", so it matches "Children's Book Illustrator" (a lone "s" is never a word).
    .replace(/['’]s\b/g, "")
    // "Portfolio of children's illustration": the skill is the illustration; profiles never say "portfolio of".
    .replace(/\b(?:(?:a|an|strong|solid|good|great|proven)\s+)*portfolio\s+(?:of|showing|with|in|demonstrating)\b/g, " ")
    // A leading "3+ years of" would otherwise make the whole term look like a number and drop it.
    .replace(/\b\d+\s*\+?\s*(?:years?|yrs?)\b(?:\s+(?:of\s+)?(?:professional\s+|hands-on\s+)?experience\b)?(?:\s+(?:of|in|with|using)\b)?/g, " ")
    .split(/,|;|\/|\band\b|\bor\b/)
    .map((s) => s.replace(/[^a-z0-9+#. -]/g, " ").replace(/\s+/g, " ").trim())
    // Drop leftovers that are only numbers ("2+"), but keep skills that start with one ("2D animation").
    .filter((s) => s && !/^[\d\s+.-]*$/.test(s) && !STOP.has(s));
}

/** Describing words removed before deciding whether a term is basic ("excellent written English" → "english"). */
const FILLER = /\b(excellent|strong|good|great|solid|sound|high|fluent|fluency|native|near|professional|proficient|proficiency|written|spoken|verbal|skills?|ability|abilities|able|knowledge|of|in|with|the|a|an|to|be|level|related|relevant|field|equivalent|similar|preferred|required|must|basic|working|familiarity|familiar|experience|years?|plus|use|using|tools?|suite|applications?|programs?|computer|literacy|literate|demonstrated|proven|effective|clear)\b/g;

const OFFICE = /^(microsoft|ms)? ?(office|office 365|365|word|powerpoint|outlook|teams)$|^(google )?(workspace|g ?suite|docs|slides)$/;
const SPREADSHEET = /^(microsoft |ms |google )?(excel|sheets|spreadsheets?)$/;
const DEGREE = /\b(bachelor|bachelors|bachelor s|master|masters|master s|degree|diploma|bsc|msc|ba|bs|ma|mba|phd|university|college|graduate|graduated)\b/;
// Anchored, so "communication strategy" for a communications role stays core.
const SOFT = /^(communication|communicator|teamwork|team player|collaboration|collaborative|problem solving|problem solver|attention detail|detail oriented|time management|organi[sz]ed|organi[sz]ational|self motivated|self starter|motivated|interpersonal|adaptable|adaptability|flexible|flexibility|fast learner|quick learner|work under pressure|working under pressure|work independently|multitasking|multi tasking|punctual|punctuality|reliable|reliability|positive attitude|critical thinking|analytical thinking|work ethic|(meet |meeting )?(tight )?deadlines?|(following )?briefs?|proactive|creative|creativity|confidentiality|discretion|willingness travel|willing travel|travel|driving licen[cs]e|driver s licen[cs]e|valid driving licen[cs]e)$/;
const LANGUAGE = /^((english|arabic|french|german|spanish|italian|turkish|armenian)( language)? ?)+$/;
/** A must-have that starts with a degree ("Bachelor's in Accounting or Finance") is a degree, whatever the subjects. */
const STARTS_WITH_DEGREE = /^\s*(bachelor|master|bsc|b\.sc|msc|m\.sc|ba|bs|ma|mba|phd|diploma|university|degree)(['’]?s)?(\s+degree)?\s+(in|of)\b/i;

/**
 * True when every part of a must-have is basic: office software, a degree, a soft skill or plain language ability.
 * Spreadsheets count as basic only next to other office software ("MS Office, Excel"), so "Advanced Excel" for a
 * finance role stays core.
 */
export function isBasicMustHave(mustHave: string): boolean {
  if (STARTS_WITH_DEGREE.test(mustHave)) return true;
  const officeBundle = /office|powerpoint|outlook|\bword\b|workspace/i.test(mustHave);
  const terms = mustHaveTerms(mustHave);
  // Nothing readable left ("3+ years"): not something to wave through as basic.
  if (!terms.length) return false;
  return terms.every((t) => {
    const rest = t.replace(/[.-]/g, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();
    if (!rest) return true;
    return OFFICE.test(rest) || (officeBundle && SPREADSHEET.test(rest)) || DEGREE.test(rest) || SOFT.test(rest) || LANGUAGE.test(rest);
  });
}

/**
 * Core and basic must-haves, in the request's order. When a role lists only basic ones (an assistant role that needs
 * Office and English), they are all treated as core so the score still has something to measure.
 */
export function splitMustHaves(mustHaves: string[]): { core: string[]; basic: string[] } {
  const basic = mustHaves.filter(isBasicMustHave);
  const core = mustHaves.filter((m) => !basic.includes(m));
  return core.length ? { core, basic } : { core: mustHaves, basic: [] };
}
