import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.service';
import { ConsoleMailer } from './console.mailer';
import { MAILER, type Mailer } from './mailer.interface';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Mailer => {
        switch (config.get('MAILER_DRIVER')) {
          case 'console':
            return new ConsoleMailer(config.get('MAIL_FROM'));
        }
      },
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
