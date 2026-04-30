import { Module } from '@nestjs/common';
import { UsersModule } from './employees/users.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [UsersModule, AdminModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
