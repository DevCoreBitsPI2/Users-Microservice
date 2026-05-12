import { Inject, Injectable } from '@nestjs/common';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { NATS_SERVICE } from '@/src/config/services';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@/src/lib/prisma';
import { Logger } from '@nestjs/common';
import { LoginDto, LoginOtpDto, VerifyOtpDto } from '@/src/auth/dto';
import { supabase } from '@/src/lib/supabase/supabase';

/*
NotFoundException lanza automáticamente el error 404.
BadRequestException es cuándo no hay datos válidos.
ForbiddenException es cuando no hay permisos.
Usando las clases directamente se lanzan solos sin hacer HttpException. */

@Injectable()
export class AuthService {
  private readonly logger = new Logger('auth service');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Autentica a un usuario con email y contraseña a través de Supabase.
   * Flujo estándar de login para usuarios que ya completaron su registro.
   *
   * @param loginDto - Credenciales del usuario: `email` y `password`.
   * @returns El objeto `data` de Supabase con la sesión y los datos del usuario autenticado,
   *   incluyendo el `access_token` y `refresh_token`.
   * @throws InternalServerErrorException si Supabase falla durante la autenticación.
   */
  async login(loginDto: LoginDto) {
    try {
      const { email, password } = loginDto;
      const { data } = await supabase.auth.signInWithPassword({
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

  /**
   * Inicia el flujo de autenticación por OTP (One-Time Password) enviando
   * un código de un solo uso al email del usuario.
   * Solo funciona para usuarios que ya existen en Supabase (`shouldCreateUser: false`).
   *
   * @param loginOtpDto - Datos del usuario: `email` al que se enviará el OTP.
   * @returns El objeto `data` de Supabase confirmando que el OTP fue enviado.
   * @throws InternalServerErrorException si Supabase falla al enviar el OTP.
   */
  async loginOtp(loginOtpDto: LoginOtpDto) {
    try {
      const { email } = loginOtpDto;
      const { data } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }

  /**
   * Verifica el OTP recibido por email y completa la autenticación del usuario.
   * Extrae del token de sesión los metadatos relevantes para el sistema:
   * el cargo (`rolId`) y si es administrador (`isAdmin`).
   *
   * @param verifyOtpDto - Datos de verificación: `email` del usuario y `token` OTP recibido.
   * @returns Objeto con:
   *   - `position`: ID del cargo del usuario (`session.user.app_metadata.rolId`)
   *   - `isAdmin`: booleano indicando si el usuario es administrador
   *   - `token`: JWT de acceso (`access_token`) para usar en peticiones autenticadas
   * @throws InternalServerErrorException si Supabase falla al verificar el OTP
   *   o si el token es inválido o ha expirado.
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: verifyOtpDto.email,
        token: verifyOtpDto.token,
        type: 'email',
      });

      if (error || !data.session) {
        throw new UnauthorizedException(error?.message ?? 'Invalid OTP');
      }

      return {
        position: data.session.user.app_metadata.roleId ?? data.session.user.app_metadata.rolId,
        isAdmin: data.session.user.app_metadata.isAdmin,
        token: data.session.access_token,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }

  /**
   * Valida el JWT de sesión enviado por el gateway y extrae los metadatos
   * necesarios para autorización.
   */
  async verifyToken(token: string) {
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        throw new UnauthorizedException(error?.message ?? 'Invalid token');
      }

      const { app_metadata } = data.user;
      const supabaseUserId = data.user.id;
      const employee = await this.prisma.employees.findUnique({
        where: { supabase_user_id: supabaseUserId },
        select: { id_employee: true, id_position: true },
      });

      return {
        supabaseUserId,
        employeeId: employee?.id_employee,
        position: app_metadata.roleId ?? app_metadata.rolId ?? employee?.id_position,
        isAdmin: Boolean(app_metadata.isAdmin),
        token,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }
}
