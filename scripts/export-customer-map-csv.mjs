import fs from 'fs';

const inputPath = 'customer-target-map.md';
const outputPath = 'customer-target-map.csv';

const lines = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/);
const headerLine = lines.find((line) => line.startsWith('| Segment |'));
if (!headerLine) {
  throw new Error('Table header not found in customer-target-map.md');
}

const startIndex = lines.indexOf(headerLine);
const rows = [];

for (let index = startIndex; index < lines.length; index += 1) {
  const line = lines[index];
  if (!line.startsWith('|')) {
    break;
  }

  if (index === startIndex + 1 && /^\|[-\s|:]+\|$/.test(line)) {
    continue;
  }

  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length > 1) {
    rows.push(cells);
  }
}

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n') + '\n';

fs.writeFileSync(outputPath, csv, 'utf8');
console.log(`Wrote ${outputPath}`);
