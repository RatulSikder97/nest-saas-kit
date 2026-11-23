import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/app-config.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshToken } from './refresh-token.entity';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256', issuer: config.get('JWT_ISSUER') },
        verifyOptions: { algorithms: ['HS256'], issuer: config.get('JWT_ISSUER') },
      }),
    }),
    UsersModule,
    OrganizationsModule,
    InvitationsModule,
    ApiKeysModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [TokenService, PasswordService, AuthService, ApiKeysModule],
})
export class AuthModule {}
