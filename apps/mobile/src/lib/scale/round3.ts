/**
 * Round a weight (kg) to 3 decimals.
 *
 * Shared by the register submit mutation and the Bluetooth scale auto-fill so
 * both use one definition (avoids drift). Behavior-preserving: identical to the
 * formula previously inlined in `submitMutation.mutationFn`.
 */
export const round3 = (x: number): number => Math.round(x * 1000) / 1000;
