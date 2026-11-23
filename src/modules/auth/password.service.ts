import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** argon2id with OWASP-recommended baseline parameters (19 MiB, t=2, p=1). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Pre-computed hash verified against when the user does not exist, to equalise timing. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= argon2.hash('timing-equalisation-dummy-password', OPTIONS);
    await argon2.verify(await this.dummyHash, password);
    return false;
  }
}
