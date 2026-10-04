// CSV/TSV parsing for the lead import. Kept separate from the controller so it
// can be tested on its own and tolerates what real spreadsheets produce.

const DELIMITERS = [',', '\t', ';'];

// Excel's "CSV UTF-8" prepends a BOM, which would otherwise glue onto the first header.
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

// Picks the delimiter that appears most in the header line (outside quotes).
function detectDelimiter(headerLine) {
  const counts = Object.fromEntries(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  return DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best), ',');
}

// Splits the whole text into records of cells. Works character by character so
// quoted cells may contain delimiters, doubled quotes and line breaks.
function splitRecords(text, delimiter) {
  const records = [];
  let record = [];
  let cell = '';
  let inQuotes = false;

  const endCell = () => {
    record.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (record.some((c) => c.trim().length > 0)) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n') {
      endRecord();
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  endRecord();
  return records;
}

// Returns an array of row objects keyed by lower-cased, trimmed header.
exports.parseCsv = (rawText) => {
  const text = stripBom(rawText);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const records = splitRecords(text, detectDelimiter(firstLine));
  if (records.length < 2) return [];

  const headers = records[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  return records.slice(1).map((cells) => {
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
};

const squash = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

// Matches "Walk-in", "walk in", "In Progress", "HEALTH" etc. to the canonical enum
// value ("walkin", "in-progress", "health"). Returns undefined when nothing matches.
exports.matchEnum = (value, allowed) => {
  if (!value) return undefined;
  const target = squash(value);
  return allowed.find((candidate) => squash(candidate) === target);
};
