/**
 * Soft-failures de managers: loguea el error real (Stripe type/code/param/stack)
 * antes de devolver solo `error.message` al handler.
 */
function logCaughtError(phase, error) {
  const err = error instanceof Error ? error : new Error(String(error));
  const bits = [`[stripe][${phase}] ${err.message}`];
  if (err.type) bits.push(`type=${err.type}`);
  if (err.code) bits.push(`code=${err.code}`);
  if (err.param) bits.push(`param=${err.param}`);
  if (err.statusCode) bits.push(`http=${err.statusCode}`);
  if (err.raw && typeof err.raw === 'object' && err.raw.message) {
    bits.push(`raw=${String(err.raw.message).slice(0, 300)}`);
  }
  console.error(bits.join(' '));
  if (err.stack) console.error(err.stack);
  return err;
}

module.exports = { logCaughtError };
