/**
 * AUTHOR SEAM — typeable one-time password for a hired staff sign-in.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class StaffSignInPasswordFactory {
  constructor(private readonly random: Crypto = crypto) {}

  next(): string {
    const bytes = new Uint8Array(8);
    this.random.getRandomValues(bytes);
    const chunk = (offset: number) =>
      Array.from(bytes.slice(offset, offset + 4), (value) => {
        const index = value % ALPHABET.length;
        return ALPHABET[index] ?? "X";
      }).join("");
    return `capsule-${chunk(0)}-${chunk(4)}`.toLowerCase();
  }
}
