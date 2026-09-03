const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
for (const file of ['package.json', 'io-package.json', '.gitignore', 'eslint.config.mjs', 'prettier.config.mjs', 'tsconfig.json', '.releaseconfig.json', '.github/workflows/test-and-release.yml']) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ioPkg = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
if (pkg.version !== ioPkg.common.version) throw new Error('package.json and io-package.json versions differ');
if (pkg.name !== 'iobroker.apsystems-easypower') throw new Error('Unexpected package name');
console.log('Package structure check passed');
