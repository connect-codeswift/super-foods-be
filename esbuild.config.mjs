import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Dependencies stay in node_modules: Prisma's runtime and pino's transport
  // workers resolve their own files at runtime and break if inlined.
  packages: 'external',
  sourcemap: true,
  // Servers gain little from minification and lose readable stack traces.
  minify: false,
  treeShaking: true,
  logLevel: 'info',
  tsconfig: 'tsconfig.json',
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('esbuild: watching src/…')
} else {
  await build(options)
}
