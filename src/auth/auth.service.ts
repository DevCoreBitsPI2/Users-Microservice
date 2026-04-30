import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { NATS_SERVICE } from '@/src/config/services';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@/src/lib/prisma';
import { Logger } from '@nestjs/common';
import { LoginDto, LoginOtpDto, VerifyOtpDto } from '@/src/auth/dto';
import { RpcException } from '@nestjs/microservices';
import { PaginationDto } from '@/src/common';
import { supabase } from '@/src/lib/supabase/supabase';

/* 
NotFoundException lanza automáticamente el error 404. 
BadRequestException es cuándo no hay datos válidos.
ForbiddenException es cuando no hay permisos. 
Usando las clases directamente se lanzan solos sin hacer HttpException. */

@Injectable()
export class AuthService {
  private readonly logger = new Logger('users service');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
  ) {}

  async login(loginDto: LoginDto) {
    try {
      const { email, password } = loginDto;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }

  async loginOtp(loginOtpDto: LoginOtpDto) {
    try {
      const { email } = loginOtpDto;
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.verifyOtp({
        email: verifyOtpDto.email,
        token: verifyOtpDto.token,
        type: 'email',
      });

      return session
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }
}
