// Test-only module resolution hook for `node --experimental-strip-types`.
// Production code uses Next.js-style extensionless relative imports and the
// '@/…' path alias, which plain Node cannot resolve. This hook retries
// extensionless relative specifiers as .ts files and maps '@/x' to 'src/x'.
// It is loaded exclusively by the dashboard's `npm test` script — it never
// ships in the application bundle.

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = new URL('../../' + specifier.slice(2), import.meta.url).href;
    return resolve(target, context, nextResolve);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND'
      && (specifier.startsWith('./') || specifier.startsWith('../'))
      && !specifier.endsWith('.ts') && !specifier.endsWith('.mjs') && !specifier.endsWith('.js')) {
      return nextResolve(specifier + '.ts', context);
    }
    throw error;
  }
}
