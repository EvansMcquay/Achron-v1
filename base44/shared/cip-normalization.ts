// CIP code → Achron canonical-major normalization (shared by the IPEDS baseline
// import and the official-verification reconciliation).
//
// NCES CIP codes are 6-digit (family 2 / program 4 / specialization 6). The
// College Scorecard program inventory exposes them as numeric string keys; we
// normalize by family (first 2 digits) for a broad canonical, with curated
// 4-digit overrides for common specific majors. We intentionally DO NOT
// over-merge genuinely different programs: the CIP code itself is always
// preserved by the caller (never discarded), and the canonical major is a
// separate searchable label, never a replacement for the official program
// name.

import { lookupCipTitle } from "./cip-2020-reference.ts";

// 2-digit CIP family → { title, canonical }
const CIP_FAMILY = {
  "01": { title: "Agriculture", canonical: "Agriculture" },
  "03": { title: "Natural Resources and Conservation", canonical: "Natural Resources" },
  "04": { title: "Architecture and Related Services", canonical: "Architecture" },
  "05": { title: "Area, Ethnic, Cultural, Gender, and Group Studies", canonical: "Area Studies" },
  "09": { title: "Communication and Journalism", canonical: "Communication" },
  "10": { title: "Communications Technologies", canonical: "Communications Technology" },
  "11": { title: "Computer and Information Sciences", canonical: "Computer & Information Sciences" },
  "12": { title: "Personal and Culinary Services", canonical: "Culinary Arts" },
  "13": { title: "Education", canonical: "Education" },
  "14": { title: "Engineering", canonical: "Engineering" },
  "15": { title: "Engineering Technologies", canonical: "Engineering Technology" },
  "16": { title: "Foreign Languages, Literatures, and Linguistics", canonical: "Foreign Languages" },
  "19": { title: "Family and Consumer Sciences", canonical: "Family & Consumer Sciences" },
  "22": { title: "Legal Professions and Studies", canonical: "Legal Studies" },
  "23": { title: "English Language and Literature", canonical: "English" },
  "24": { title: "Liberal Arts and Sciences", canonical: "Liberal Arts" },
  "25": { title: "Library Science", canonical: "Library Science" },
  "26": { title: "Biological and Biomedical Sciences", canonical: "Biology & Biomedical Sciences" },
  "27": { title: "Mathematics and Statistics", canonical: "Mathematics" },
  "29": { title: "Military Technologies", canonical: "Military Technologies" },
  "30": { title: "Multi/Interdisciplinary Studies", canonical: "Interdisciplinary Studies" },
  "31": { title: "Parks, Recreation, Leisure, and Fitness Studies", canonical: "Parks & Recreation" },
  "32": { title: "Basic Skills", canonical: "Basic Skills" },
  "33": { title: "High School/Secondary Diplomas and Certificates", canonical: "High School Diploma" },
  "34": { title: "Healthcare", canonical: "Healthcare" },
  "35": { title: "Personal Services", canonical: "Personal Services" },
  "36": { title: "Leisure and Recreational Activities", canonical: "Leisure Studies" },
  "37": { title: "Protective Services", canonical: "Protective Services" },
  "38": { title: "Philosophy and Religious Studies", canonical: "Philosophy & Religious Studies" },
  "39": { title: "Theology and Religious Vocations", canonical: "Theology" },
  "40": { title: "Physical Sciences", canonical: "Physical Sciences" },
  "41": { title: "Science Technologies", canonical: "Science Technologies" },
  "42": { title: "Psychology", canonical: "Psychology" },
  "43": { title: "Homeland Security, Law Enforcement, and Firefighting", canonical: "Homeland Security" },
  "44": { title: "Public Administration and Social Service Professions", canonical: "Public Administration" },
  "45": { title: "Social Sciences", canonical: "Social Sciences" },
  "46": { title: "Construction Trades", canonical: "Construction Trades" },
  "47": { title: "Mechanic and Repair Technologies", canonical: "Mechanic & Repair" },
  "48": { title: "Precision Production", canonical: "Precision Production" },
  "49": { title: "Transportation and Materials Moving", canonical: "Transportation" },
  "50": { title: "Visual and Performing Arts", canonical: "Visual & Performing Arts" },
  "51": { title: "Health Professions and Related Programs", canonical: "Health Professions" },
  "52": { title: "Business, Management, Marketing, and Related Support Services", canonical: "Business" },
  "54": { title: "History", canonical: "History" },
};

// Curated 4-digit CIP overrides for common, specific majors. Where present,
// these take precedence over the 2-digit family canonical.
const CIP_SPECIFIC = {
  "0103": { title: "Agricultural Production Operations", canonical: "Agriculture" },
  "0105": { title: "Agricultural Business and Management", canonical: "Agribusiness" },
  "0109": { title: "Animal Sciences", canonical: "Animal Science" },
  "0111": { title: "Plant Sciences", canonical: "Plant Science" },
  "0401": { title: "Architecture", canonical: "Architecture" },
  "0901": { title: "Communication, General", canonical: "Communication" },
  "0907": { title: "Public Relations, Advertising, and Applied Communication", canonical: "Public Relations" },
  "0910": { title: "Journalism", canonical: "Journalism" },
  "0911": { title: "Broadcasting, Radio and Television", canonical: "Broadcasting" },
  "1101": { title: "Computer and Information Sciences, General", canonical: "Computer & Information Sciences" },
  "1102": { title: "Artificial Intelligence", canonical: "Artificial Intelligence" },
  "1103": { title: "Information Technology", canonical: "Information Technology" },
  "1104": { title: "Information Science/Studies", canonical: "Information Science" },
  "1105": { title: "Computer Systems Networking and Telecommunications", canonical: "Computer Networking" },
  "1106": { title: "Computer/Information Technology Services Administration and Management", canonical: "IT Management" },
  "1107": { title: "Computer Science", canonical: "Computer Science" },
  "1108": { title: "Computer Software and Media Applications", canonical: "Software Development" },
  "1310": { title: "Education, General", canonical: "Education" },
  "1313": { title: "Teacher Education and Professional Development", canonical: "Teacher Education" },
  "1319": { title: "Junior High/Secondary/Middle School Education", canonical: "Secondary Education" },
  "1401": { title: "Engineering, General", canonical: "Engineering" },
  "1407": { title: "Chemical Engineering", canonical: "Chemical Engineering" },
  "1410": { title: "Electrical, Electronics and Communications Engineering", canonical: "Electrical Engineering" },
  "1419": { title: "Mechanical Engineering", canonical: "Mechanical Engineering" },
  "1420": { title: "Petroleum Engineering", canonical: "Petroleum Engineering" },
  "1428": { title: "Civil Engineering", canonical: "Civil Engineering" },
  "1435": { title: "Materials Engineering", canonical: "Materials Engineering" },
  "1437": { title: "Biomedical/Medical Engineering", canonical: "Biomedical Engineering" },
  "1438": { title: "Industrial Engineering", canonical: "Industrial Engineering" },
  "1501": { title: "Engineering Technologies, General", canonical: "Engineering Technology" },
  "1601": { title: "Foreign Languages and Literatures, General", canonical: "Foreign Languages" },
  "1612": { title: "Spanish Language and Literature", canonical: "Spanish" },
  "2301": { title: "English Language and Literature, General", canonical: "English" },
  "2302": { title: "Composition and Rhetoric", canonical: "Composition & Rhetoric" },
  "2401": { title: "Liberal Arts and Sciences/Liberal Studies", canonical: "Liberal Arts" },
  "2601": { title: "Biology/Biological Sciences, General", canonical: "Biology" },
  "2602": { title: "Biochemistry, Biophysics and Molecular Biology", canonical: "Biochemistry" },
  "2603": { title: "Botany/Plant Biology", canonical: "Botany" },
  "2604": { title: "Cell/Cellular Biology", canonical: "Cell Biology" },
  "2605": { title: "Microbiological Sciences and Immunology", canonical: "Microbiology" },
  "2606": { title: "Zoology/Animal Biology", canonical: "Zoology" },
  "2607": { title: "Neuroscience", canonical: "Neuroscience" },
  "2610": { title: "Biotechnology", canonical: "Biotechnology" },
  "2701": { title: "Mathematics, General", canonical: "Mathematics" },
  "2702": { title: "Applied Mathematics", canonical: "Applied Mathematics" },
  "2703": { title: "Statistics", canonical: "Statistics" },
  "3001": { title: "Biological and Physical Sciences", canonical: "Biological & Physical Sciences" },
  "3008": { title: "Exercise Science and Kinesiology", canonical: "Exercise Science" },
  "3019": { title: "Cognitive Science", canonical: "Cognitive Science" },
  "3101": { title: "Parks, Recreation and Leisure Studies", canonical: "Parks & Recreation" },
  "3801": { title: "Philosophy", canonical: "Philosophy" },
  "3802": { title: "Religion/Religious Studies", canonical: "Religious Studies" },
  "4001": { title: "Physical Sciences, General", canonical: "Physical Sciences" },
  "4002": { title: "Astronomy and Astrophysics", canonical: "Astronomy" },
  "4005": { title: "Chemistry", canonical: "Chemistry" },
  "4006": { title: "Geological and Earth Sciences/Geosciences", canonical: "Geology" },
  "4008": { title: "Physics", canonical: "Physics" },
  "4201": { title: "Psychology, General", canonical: "Psychology" },
  "4206": { title: "Clinical, Counseling and Applied Psychology", canonical: "Clinical Psychology" },
  "4207": { title: "Research and Experimental Psychology", canonical: "Experimental Psychology" },
  "4301": { title: "Homeland Security", canonical: "Homeland Security" },
  "4302": { title: "Fire Protection", canonical: "Fire Protection" },
  "4401": { title: "Public Administration", canonical: "Public Administration" },
  "4402": { title: "Social Work", canonical: "Social Work" },
  "4501": { title: "Social Sciences, General", canonical: "Social Sciences" },
  "4502": { title: "Anthropology", canonical: "Anthropology" },
  "4504": { title: "Criminology", canonical: "Criminology" },
  "4505": { title: "Economics", canonical: "Economics" },
  "4506": { title: "Geography and Cartography", canonical: "Geography" },
  "4507": { title: "International Relations and National Security Studies", canonical: "International Relations" },
  "4508": { title: "Political Science and Government", canonical: "Political Science" },
  "4510": { title: "Sociology", canonical: "Sociology" },
  "4613": { title: "Electrician", canonical: "Electrician" },
  "4701": { title: "Mechanic and Repair Technologies, General", canonical: "Mechanic & Repair" },
  "4902": { title: "Aviation/Airway Management and Operations", canonical: "Aviation" },
  "5001": { title: "Visual and Performing Arts, General", canonical: "Visual & Performing Arts" },
  "5002": { title: "Crafts/Craft Design, Folk Art and Artisanry", canonical: "Crafts" },
  "5004": { title: "Design and Applied Arts", canonical: "Design" },
  "5005": { title: "Drama and Dramatics/Theatre Arts", canonical: "Theatre" },
  "5006": { title: "Film/Video and Photographic Arts", canonical: "Film & Video" },
  "5007": { title: "Fine/Studio Arts, General", canonical: "Art" },
  "5008": { title: "Music", canonical: "Music" },
  "5099": { title: "Visual and Performing Arts, Other", canonical: "Visual & Performing Arts" },
  "5101": { title: "Health/Health Care Administration/Management", canonical: "Health Administration" },
  "5104": { title: "Clinical/Laboratory Science/Medical Technology", canonical: "Medical Technology" },
  "5105": { title: "Communication Disorders Sciences and Services", canonical: "Communication Disorders" },
  "5106": { title: "Dental Support Services and Allied Professions", canonical: "Dental Support" },
  "5107": { title: "Dietetics and Clinical Nutrition Services", canonical: "Dietetics & Nutrition" },
  "5108": { title: "Allied Health Diagnostic, Intervention, and Treatment Professions", canonical: "Allied Health" },
  "5109": { title: "Public Health", canonical: "Public Health" },
  "5110": { title: "Rehabilitation and Therapeutic Professions", canonical: "Rehabilitation" },
  "5111": { title: "Registered Nursing, Nursing Administration, Nursing Research and Clinical Nursing", canonical: "Nursing" },
  "5113": { title: "Practical Nursing, Vocational Nursing and Nursing Assistants", canonical: "Practical Nursing" },
  "5114": { title: "Health and Medical Administrative Services", canonical: "Health Administration" },
  "5115": { title: "Pharmacy, Pharmaceutical Sciences, and Administration", canonical: "Pharmacy" },
  "5116": { title: "Medicine", canonical: "Medicine" },
  "5117": { title: "Physician Assistant", canonical: "Physician Assistant" },
  "5118": { title: "Physical Therapy", canonical: "Physical Therapy" },
  "5120": { title: "Pre-Medicine/Pre-Medical Studies", canonical: "Pre-Medicine" },
  "5122": { title: "Radiologic Technology/Science", canonical: "Radiologic Technology" },
  "5126": { title: "Emergency Medical Technology/Technician (EMT)", canonical: "Emergency Medical Technology" },
  "5201": { title: "Business/Commerce, General", canonical: "Business Administration" },
  "5202": { title: "Business Administration and Management, General", canonical: "Business Administration" },
  "5203": { title: "Accounting", canonical: "Accounting" },
  "5204": { title: "Administrative Assistant and Secretarial Science", canonical: "Administrative Assistant" },
  "5205": { title: "Business/Corporate Communications", canonical: "Business Communications" },
  "5206": { title: "Finance and Financial Management Services", canonical: "Finance" },
  "5207": { title: "Hospitality Administration/Management", canonical: "Hospitality Management" },
  "5208": { title: "Human Resources Management and Services", canonical: "Human Resources" },
  "5209": { title: "International Business/Trade/Commerce", canonical: "International Business" },
  "5210": { title: "Management Information Systems and Services", canonical: "Information Systems" },
  "5211": { title: "Marketing/Marketing Management", canonical: "Marketing" },
  "5212": { title: "Real Estate", canonical: "Real Estate" },
  "5214": { title: "Operations Management and Supervision", canonical: "Operations Management" },
  "5215": { title: "Project Management", canonical: "Project Management" },
  "5216": { title: "Entrepreneurship/Entrepreneurial Studies", canonical: "Entrepreneurship" },
  "5217": { title: "Insurance", canonical: "Insurance" },
  "5218": { title: "Taxation", canonical: "Taxation" },
  "5401": { title: "History, General", canonical: "History" },
  "5402": { title: "American History (United States)", canonical: "American History" },
  "5403": { title: "European History", canonical: "European History" },
};

function pad4(cip) {
  // Accept 2-, 4-, or 6-digit numeric CIP strings; return the first 4 digits,
  // left-padded to 4 if shorter (so a 2-digit family like "11" -> "1100" is
  // handled, though 4-digit overrides rarely use the padded form).
  const n = String(cip || "").replace(/[^0-9]/g, "");
  if (!n) return "";
  if (n.length >= 4) return n.slice(0, 4);
  return n.padEnd(4, "0");
}

function familyOf(cip) {
  return String(cip || "").replace(/[^0-9]/g, "").slice(0, 2);
}

// Returns { canonical_major, cip_title } for a CIP code. Falls back to the
// 2-digit family; if the family is unknown, returns a neutral label derived
// from the code so the program is still represented (never silently dropped).
export function canonicalForCip(cip) {
  const fam = familyOf(cip);
  const famMeta = CIP_FAMILY[fam];
  const spec = CIP_SPECIFIC[pad4(cip)];
  const cip_title = (spec && spec.title) || (famMeta && famMeta.title) || "";
  const canonical_major =
    (spec && spec.canonical) ||
    (famMeta && famMeta.canonical) ||
    (cip_title ? cip_title : `Program ${fam || ""}`.trim());
  return { canonical_major, cip_title };
}

// Map an institution's IPEDS level (Achron institution_type) to a baseline
// degree level for national-baseline records. This is a coarse, institution-
// level inference — official verification later refines it to the exact degree.
export function degreeLevelForInstitutionType(institutionType) {
  if (institutionType === "4-year") return "bachelor";
  if (institutionType === "2-year") return "associate";
  if (institutionType === "less-than-2-year") return "certificate";
  return "bachelor";
}

// Map an IPEDS/College Scorecard credential level code to a degree level.
// College Scorecard credential.level: 1=Certificate, 2=Associate, 3=Bachelor,
// 4=Post-bacc, 5=Master, 6=Doctorate (professional), 7=Doctorate (research).
export function degreeLevelForCredential(level) {
  const n = Number(level);
  if (n === 1) return "certificate";
  if (n === 2) return "associate";
  if (n === 3) return "bachelor";
  if (n === 4) return "bachelor";
  if (n === 5) return "master";
  if (n === 6 || n === 7) return "doctorate";
  return "";
}

export function degreeTypeForLevel(level) {
  switch (level) {
    case "certificate": return "Certificate";
    case "associate": return "Associate";
    case "bachelor": return "Bachelor";
    case "master": return "Master";
    case "doctorate": return "Doctorate";
    default: return "Bachelor";
  }
}

// Normalize a program/major name for fuzzy matching (baseline <-> official).
export function normProgramName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Normalize any CIP (2/4/6-digit, with or without dots) to a 6-digit numeric
// string, right-padding shorter codes with zeros (so "11" -> "110000").
function normalizeTo6(cip) {
  const n = String(cip || "").replace(/[^0-9]/g, "");
  if (!n) return "";
  if (n.length >= 6) return n.slice(0, 6);
  return n.padEnd(6, "0");
}

// Shorten an exact CIP title into a stable canonical label by stripping a
// trailing period and a trailing ", General" / ", Other" qualifier. This keeps
// genuinely different 6-digit CIPs distinct while giving a clean grouping label.
function shortForm(title) {
  return String(title || "")
    .replace(/\s*\.\s*$/, "")
    .trim()
    .replace(/,\s*(General|Other)\s*$/i, "")
    .trim();
}

// Resolve a CIP code to { canonical_major, cip_title, exact } using the official
// CIP 2020 reference (exact 6-digit title) with curated/family fallback.
//   - cip_title: the REAL 6-digit CIP title when the reference has it (exact);
//     otherwise the curated 4-digit title, otherwise the 2-digit family title.
//   - canonical_major: a STABLE cross-school identity — the curated short
//     canonical when available, otherwise a shortened form of the exact title.
//     The SAME CIP always yields the SAME canonical at every institution, while
//     distinct CIPs stay distinct (no over-merging to a broad family bucket).
//   - exact: true when the 6-digit code was found in the CIP 2020 reference.
export function resolveCip(cip, ref) {
  const cip6 = normalizeTo6(cip);
  const fam = familyOf(cip6);
  const famMeta = CIP_FAMILY[fam];
  const spec = CIP_SPECIFIC[pad4(cip6)];
  const exactTitle = lookupCipTitle(cip6, ref);
  const cip_title = exactTitle || (spec && spec.title) || (famMeta && famMeta.title) || "";
  const canonical_major =
    (spec && spec.canonical) ||
    (exactTitle ? shortForm(exactTitle) : "") ||
    (famMeta && famMeta.canonical) ||
    (cip_title ? shortForm(cip_title) : `Program ${fam}`.trim());
  return { canonical_major, cip_title, exact: Boolean(exactTitle) };
}