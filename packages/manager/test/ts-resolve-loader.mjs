// Test-only resolve hook for node --experimental-strip-types: retries
// extensionless relative imports as .ts files (source uses bundler-style
// imports for tsc dist emission; tests run directly from source).

export async function resolve(specifier, context, nextResolve) {
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
