const esbuild = require('esbuild');

esbuild.buildSync({
    entryPoints: ['media/noteEditor.src.js'],
    bundle: true,
    outfile: 'media/noteEditor.js',
    format: 'iife',
    target: 'es2020',
    minify: false,
    sourcemap: false,
});
