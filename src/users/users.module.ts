import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NatsModule } from '@/src/transports/nats.module';
import { PrismaService } from '@/src/lib/prisma';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
  imports: [
    NatsModule
  ]
})
export class UsersModule {}
