import { Module } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { AuthGuard } from './auth.guard.js';
import { TokenVerifierService } from './token-verifier.service.js';

@Module({
  providers: [TokenVerifierService, UsersService, AuthGuard],
  exports: [TokenVerifierService, UsersService, AuthGuard],
})
export class AuthModule {}
