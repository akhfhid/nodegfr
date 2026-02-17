const d = require('./captured-submission.json');
const fs = require('fs');

let output = '';
d.forEach((r, i) => {
    output += `\n========== REQUEST ${i} ==========\n`;
    output += `URL: ${r.url}\n`;
    const params = new URLSearchParams(r.postData);
    for (const [k, v] of params.entries()) {
        output += `  ${k} = ${v}\n`;
    }
});

fs.writeFileSync('captured-decoded.txt', output, { encoding: 'ascii' });
process.stdout.write('DONE');
