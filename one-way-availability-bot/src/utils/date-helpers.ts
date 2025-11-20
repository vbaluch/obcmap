/**
 * Generate a dynamic example date for use in help and usage messages.
 * Returns a date two days from now in MMDD format.
 */
export function getExampleDate(): string {
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  return `${String(twoDaysFromNow.getMonth() + 1).padStart(2, '0')}${String(twoDaysFromNow.getDate()).padStart(2, '0')}`;
}
