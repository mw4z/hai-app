const fs = require('fs');
const path = require('path');
const glob = require('path');

// Find all .tsx and .ts files in src/app and src/components
function findFiles(dir, ext) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) results.push(...findFiles(full, ext));
    else if (item.name.endsWith(ext)) results.push(full);
  }
  return results;
}

const root = path.join(__dirname, '..');
const files = [
  ...findFiles(path.join(root, 'src', 'app'), '.tsx'),
  ...findFiles(path.join(root, 'src', 'app'), '.ts'),
  ...findFiles(path.join(root, 'src', 'components'), '.tsx'),
  ...findFiles(path.join(root, 'src', 'components'), '.ts'),
];

let totalChanged = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  // Replace `lang === 'ar' ? 'arabicText' : 'englishText'` with `lang !== 'en' ? 'arabicText' : 'englishText'`
  // This makes Urdu fall into the Arabic branch (better than English for Urdu speakers)
  // But SKIP layout/positioning checks (right/left, rtl/ltr)
  content = content.replace(/lang === 'ar' \?/g, (match, offset) => {
    // Check the context — if it's about positioning (right/left), keep it
    const context = content.substring(offset, offset + 200);
    if (context.includes('right-') || context.includes('left-') || context.includes("'ltr'") || context.includes("'rtl'")) {
      return match; // keep original for layout
    }
    return "lang !== 'en' ?";
  });

  // Also fix `isAr = lang === 'ar'` pattern
  content = content.replace(/const isAr = lang === 'ar'/g, "const isAr = lang !== 'en'");

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    const changes = (original.match(/lang === 'ar' \?/g) || []).length - (content.match(/lang === 'ar' \?/g) || []).length;
    if (changes > 0) {
      console.log(`${path.relative(root, file)}: ${changes} changes`);
      totalChanged += changes;
    }
  }
}

console.log(`\nTotal: ${totalChanged} text checks fixed for Urdu support`);
