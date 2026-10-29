const fs = require('fs');
const path = require('path');
const tsconfig = require('./src/tsconfig.json');

// Resolves to your output directory relative to the project root
const jsDir = path.resolve(__dirname, 'src', tsconfig.compilerOptions.outDir);

const bundledCode = tsconfig.files.map(file => {
    const jsFilePath = path.join(jsDir, file.replace(/\.ts$/, '.js'));
    return fs.readFileSync(jsFilePath, 'utf8');
}).join('\n');

const outDir = path.resolve(__dirname, 'bundle');

fs.writeFileSync(path.join(outDir, 'index.js'), bundledCode);