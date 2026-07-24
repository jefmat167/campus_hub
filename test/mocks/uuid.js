// CommonJS stub for the ESM-only `uuid` package so Jest (CJS) can load modules
// that import it. Tests don't assert on generated UUIDs.
let counter = 0;
module.exports = {
  v4: () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`,
};
