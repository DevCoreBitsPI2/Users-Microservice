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
import { InviteUserDto } from '@/src/employees/dto';
import { RpcException } from '@nestjs/microservices';
import { PaginationDto } from '@/src/common';
import { supabase } from '@/src/lib/supabase/supabase';

/* 
NotFoundException lanza automáticamente el error 404. 
BadRequestException es cuándo no hay datos válidos.
ForbiddenException es cuando no hay permisos. 
Usando las clases directamente se lanzan solos sin hacer HttpException. */

@Injectable()
export class UsersService {
  private readonly logger = new Logger('users service');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
  ) {}

  async inviteUser(inviteUserDto: InviteUserDto) {
    try {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        inviteUserDto.email,
      );

      if (error || !data?.user) {
        throw new InternalServerErrorException('Error invitando usuario');
      }

      const userId = data.user.id;

      await supabase.auth.admin.updateUserById(userId, {
        app_metadata: { roleId: inviteUserDto.id_position, isAdmin: false }, // Se ingresa esto para que en el token que genera Supabase, esté incluido el ID del cargo al está asociado. Se pone isAdmin en false para consistencia, ya que este endpoint es solo para invitar empleados, no administradores.
      });

      const authId = data.user.id;
      const user = await this.prisma.employees.create({
        data: {
          email: inviteUserDto.email,
          first_name: inviteUserDto.first_name,
          last_name: inviteUserDto.last_name,
          age: inviteUserDto.age,
          code: inviteUserDto.code,
          status: inviteUserDto.status,
          id_position: inviteUserDto.id_position,

          ...(inviteUserDto.id_manager && {
            manager: {
              connect: { id_employee: inviteUserDto.id_manager },
            },
          }),
          administrators: {
            connect: { id: inviteUserDto.id_administrator },
          },
          users: {
            connect: { id: authId },
          },
        },
      });
      this.logger.log(`Usuario invitado: ${user.email}`);
      return user;
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = paginationDto;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.employees.findMany({
        skip,
        take: limit,
      }),
      this.prisma.employees.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.employees.findUnique({
      where: { id_employee: id },
    });

    if (!user) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    return user;
  }

  /* update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  } */
}
