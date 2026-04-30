import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { NatsModule } from '@/src/transports/nats.module';
import { PrismaService } from '@/src/lib/prisma';

@Module({
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
  imports: [
    NatsModule
  ]
})
export class AdminModule {}
