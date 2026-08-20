import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface VerifiedAccessToken extends JWTPayload {
  sub: string;
}

/**
 * Validates Auth0 access tokens.
 *
 * What is checked, and why each one matters (see transcripts/phase-0-auth0/FINDINGS.md
 * for the evidence behind these choices):
 *
 * - **Signature, RS256, key by `kid` from the tenant JWKS.** The tenant publishes TWO
 *   signing keys, so picking "the first key" would work today and break on rotation.
 *   `createRemoteJWKSet` selects by `kid` and caches, refetching on an unknown `kid`.
 * - **`alg` restricted to RS256.** Without this, a token could nominate its own algorithm.
 *   `none` and the HS256-confusion class of attack both die here.
 * - **`iss` exact match**, trailing slash included.
 * - **`aud` must include our API audience.** This is the check that agents most often skip:
 *   signature-valid but audience-unchecked means any token this tenant ever issued to any
 *   application is accepted by our API. An ID token (aud = client id) is rejected here.
 * - **`exp`/`nbf`** via jose, with a deliberately small clock tolerance.
 */
@Injectable()
export class TokenVerifierService {
  private readonly logger = new Logger(TokenVerifierService.name);
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: JWTVerifyGetKey;

  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('AUTH0_ISSUER');
    this.audience = config.getOrThrow<string>('AUTH0_AUDIENCE');
    const jwksUri = config.getOrThrow<string>('AUTH0_JWKS_URI');

    this.jwks = createRemoteJWKSet(new URL(jwksUri), {
      cooldownDuration: 30_000, // don't hammer the tenant on a burst of unknown kids
      cacheMaxAge: 600_000, // 10 min; a rotation is picked up within this window
      timeoutDuration: 5_000,
    });
  }

  async verify(token: string): Promise<VerifiedAccessToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new UnauthorizedException('Token has no subject');
      }
      return payload as VerifiedAccessToken;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Log the real reason, return a generic one. Telling a caller *why* their token
      // failed ("wrong audience" vs "expired") is free reconnaissance.
      this.logger.debug(`Token rejected: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
