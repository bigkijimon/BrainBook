// Recomputes every number in the LLM-company one-page plan and fails if the note disagrees.
// Read-only: it parses the Obsidian note and never writes. Run: node scripts/check-llm-company-plan.mjs [path]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NOTE = process.argv[2] || '/Users/yuma/Documents/ObsidianVault/Vault/Projects/LLM-Company/LLM-Company-Plan.md';
const FEE_RATE = 0.036; // Stripe Japan domestic card rate used by the note (still to confirm on stripe.com/jp/pricing)
const text = readFileSync(NOTE, 'utf8');
// First number in a cell ("**10本（目標）**" -> 10, "24,100" -> 24100); NaN when there is none.
const num = (s) => { const m = s.replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : NaN; };
// Table rows under a "## <heading>" / "### <heading>" section, as arrays of numbers, header/separator skipped.
const rows = (heading) => {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `section not found: ${heading}`);
  const body = text.slice(start).split('\n').slice(1);
  const out = [];
  for (const line of body) {
    if (/^#{2,3} /.test(line)) break;
    if (!line.startsWith('|') || /^\|[-:| ]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(num);
    if (cells.every(Number.isFinite)) out.push(cells);
  }
  return out;
};
const perUnit = (price) => {
  const fee = Math.round(price * FEE_RATE);
  const exTax = Math.floor(price / 1.1);
  const tax = price - exTax;
  return { fee, exempt: price - fee, exTax, tax, taxable: price - fee - tax };
};

let checks = 0;
const costRows = rows('### 1本あたり');
assert.equal(costRows.length, 2, 'per-unit cost table should have 2 price rows');
for (const [price, fee, exempt, exTax, tax, taxable] of costRows) {
  assert.deepEqual({ fee, exempt, exTax, tax, taxable }, (({ fee, exempt, exTax, tax, taxable }) => ({ fee, exempt, exTax, tax, taxable }))(perUnit(price)), `per-unit row ${price}`);
  checks++;
}
const unit = perUnit(25000);
const salesRows = rows('## 6. 売上');
assert.equal(salesRows.length, 3, 'revenue table should have 3 rows');
for (const [units, revenue, exempt, taxable] of salesRows) {
  assert.deepEqual([revenue, exempt, taxable], [units * 25000, units * unit.exempt, units * unit.taxable], `revenue row ${units} units`);
  checks++;
}
// Break-even sentence: "F が 30,000円なら2本、50,000円なら3本（どちらも免税・課税で同じ本数）"
const be = text.match(/F が ([\d,]+)円なら(\d+)本、([\d,]+)円なら(\d+)本/);
assert.ok(be, 'break-even sentence not found');
for (const [f, n] of [[num(be[1]), Number(be[2])], [num(be[3]), Number(be[4])]]) {
  assert.equal(Math.ceil(f / unit.exempt), n, `break-even F=${f} (exempt)`);
  assert.equal(Math.ceil(f / unit.taxable), n, `break-even F=${f} (taxable)`);
  checks++;
}
console.log(`PASS ${checks} number checks in ${NOTE}`);
