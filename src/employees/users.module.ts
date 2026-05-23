import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NatsModule } from '@/src/transports/nats.module';
import { PrismaService } from '@/src/lib/prisma';
import { CloudinaryProvider } from '@/src/lib/imageProvider/cloudinary.provider';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, CloudinaryProvider],
  imports: [
    NatsModule
  ]
})
export class UsersModule {}
