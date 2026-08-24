import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src/manifest.json', 'dist/manifest.json');
await cp('src/popup.html', 'dist/popup.html');
await cp('src/popup.css', 'dist/popup.css');

const entryPoints = {
	'popup': 'src/popup.js',
	'service-worker': 'src/service-worker.js',
	'content-script': 'src/content-script.js'
};

await build({
	entryPoints,
	bundle: true,
	format: 'iife',
	outdir: 'dist',
	platform: 'browser',
	logLevel: 'info'
});
