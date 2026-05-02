import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InternalServerErrorException } from '@nestjs/common';
import { NATS_SERVICE } from '@/src/config/services';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@/src/lib/prisma';
import { Logger } from '@nestjs/common';
import {
  InviteUserDto,
  UpdateProfileDto,
  UpdateEmployeeDto,
  FilterEmployeesDto,
  EmployeeIdDto,
  SupabaseUserDto,
} from '@/src/employees/dto';
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

  /**
   * Invita a un nuevo empleado enviándole un email de registro a través de Supabase.
   * Crea el registro del empleado en la base de datos y lo vincula al usuario de Supabase.
   *
   * @param inviteUserDto - Datos del empleado: `email`, `first_name`, `last_name`, `age`,
   *   `code`, `status`, `id_position`, `id_administrator` y opcionalmente `id_manager`.
   * @returns El registro completo del empleado recién creado en la tabla `employees`.
   * @throws InternalServerErrorException si Supabase falla al enviar la invitación
   *   o si ocurre cualquier error inesperado durante la creación.
   */
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
        // Se ingresa esto para que en el token que genera Supabase esté incluido el ID del cargo
        // al que está asociado. Se pone isAdmin en false para consistencia, ya que este endpoint
        // es solo para invitar empleados, no administradores.
        app_metadata: { roleId: inviteUserDto.id_position, isAdmin: false },
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

  /**
   * Retorna una lista paginada de empleados con soporte para filtros opcionales.
   *
   * @param filterDto - Parámetros de paginación (`page`, `limit`) y filtros opcionales:
   *   `status`, `id_position`, `id_manager`, `id_administrator`.
   *   Solo se aplican los filtros que vengan informados.
   * @returns Objeto con `data` (array de empleados) y `meta` con información de paginación:
   *   `total`, `page`, `limit` y `lastPage`.
   */
  async findAll(filterDto: FilterEmployeesDto) {
    const { page, limit, status, id_position, id_manager, id_administrator } =
      filterDto;
    const skip = (page - 1) * limit;

    const where = {
      ...(status && { status }),
      ...(id_position && { id_position }),
      ...(id_manager && { id_manager }),
      ...(id_administrator && { id_administrator }),
    };

    const [data, total] = await Promise.all([
      this.prisma.employees.findMany({
        where,
        skip,
        take: limit,
      }),
      this.prisma.employees.count({ where }),
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

  /**
   * Busca y retorna un empleado por su ID interno (`id_employee`).
   *
   * @param id - ID numérico del empleado.
   * @returns El registro completo del empleado encontrado.
   * @throws NotFoundException si no existe ningún empleado con ese ID.
   */
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

  /**
   * Retorna el perfil del empleado autenticado a partir de su ID de Supabase.
   * Pensado para que el propio empleado consulte sus datos desde el token de sesión.
   * Solo expone los campos relevantes del perfil, sin datos sensibles.
   *
   * @param supabase_user_id - UUID del usuario en Supabase, extraído del token JWT.
   * @returns Objeto con: `id_employee`, `first_name`, `last_name`, `email`, `age`,
   *   `photo_url`, `status`, `id_position`, `id_manager`.
   * @throws NotFoundException si no hay ningún empleado vinculado a ese UUID de Supabase.
   */
  async getMyProfile({ supabase_user_id }: SupabaseUserDto) {
    const employee = await this.prisma.employees.findUnique({
      where: { supabase_user_id },
      select: {
        id_employee: true,
        first_name: true,
        last_name: true,
        email: true,
        age: true,
        photo_url: true,
        status: true,
        id_position: true,
        id_manager: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado perfil asociado a este usuario.',
      );
    }

    return employee;
  }

  /**
   * Retorna la lista de subordinados directos de un empleado (quienes lo tienen como manager).
   *
   * @param id_employee - ID numérico del empleado del que se quieren obtener los subordinados.
   * @returns Array de subordinados con: `id_employee`, `first_name`, `last_name`,
   *   `email`, `status`, `id_position`, `photo_url`. Puede ser un array vacío si no tiene subordinados.
   * @throws NotFoundException si el empleado con ese ID no existe.
   */
  async getSubordinates({ id_employee }: EmployeeIdDto) {
    const employee = await this.prisma.employees.findUnique({
      where: { id_employee },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    return this.prisma.employees.findMany({
      where: { id_manager: id_employee },
      select: {
        id_employee: true,
        first_name: true,
        last_name: true,
        email: true,
        status: true,
        id_position: true,
        photo_url: true,
      },
    });
  }

  /**
   * Permite a un administrador actualizar los datos operativos de un empleado:
   * cargo, manager asignado y/o estado. No modifica datos de perfil personal.
   *
   * @param updateEmployeeDto - Objeto con `id_employee` (requerido) y los campos a actualizar
   *   de forma opcional: `id_position`, `id_manager`, `status`.
   * @returns El registro completo del empleado con los datos actualizados.
   * @throws NotFoundException si el empleado con ese ID no existe.
   */
  async updateEmployee(updateEmployeeDto: UpdateEmployeeDto) {
    const { id_employee, ...data } = updateEmployeeDto;

    const employee = await this.prisma.employees.findUnique({
      where: { id_employee },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    const updated = await this.prisma.employees.update({
      where: { id_employee },
      data,
    });

    this.logger.log(`Empleado actualizado por admin: #${id_employee}`);
    return updated;
  }

  /**
   * Permite al propio empleado actualizar su información de perfil personal.
   * Solo se pueden modificar `photo_url` y `age`; el resto de campos no son accesibles
   * por esta vía para evitar modificaciones no autorizadas.
   *
   * @param updateProfileDto - Objeto con `id_employee` (requerido) y los campos opcionales
   *   a actualizar: `photo_url` (URL válida) y/o `age` (entre 18 y 100).
   * @returns Objeto con los campos actualizados: `id_employee`, `email`, `age`, `photo_url`.
   * @throws NotFoundException si el empleado con ese ID no existe.
   */
  async updateProfile(updateProfileDto: UpdateProfileDto) {
    const { id_employee, ...data } = updateProfileDto;

    const employee = await this.prisma.employees.findUnique({
      where: { id_employee },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    const updated = await this.prisma.employees.update({
      where: { id_employee },
      data,
      select: {
        id_employee: true,
        email: true,
        age: true,
        photo_url: true,
      },
    });

    this.logger.log(`Perfil actualizado: empleado #${id_employee}`);
    return updated;
  }
}
