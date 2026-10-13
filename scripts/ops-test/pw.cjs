// Playwright from wherever it's installed (the cloud image keeps it in /opt/node-tools; locally: npm i -D playwright)
const fs = require('fs');
let pw;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '@playwright/test']) { try { pw = require(p); break; } catch {} }
if (!pw) throw new Error('Playwright not found: npm i -D playwright');
const exe = '/opt/pw-browsers/chromium';
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (o = {}) => launch(fs.existsSync(exe) && !o.executablePath ? { executablePath: exe, ...o } : o);
module.exports = pw;
