import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { NATS_SERVICE } from '@/src/config/services';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@/src/lib/prisma';
import { Logger } from '@nestjs/common';
import { CreateAdminDto } from '@/src/admin/dto';
import { PaginationDto } from '@/src/common';
import { supabase } from '@/src/lib/supabase/supabase';

/*
NotFoundException lanza automáticamente el error 404.
BadRequestException es cuándo no hay datos válidos.
ForbiddenException es cuando no hay permisos.
Usando las clases directamente se lanzan solos sin hacer HttpException. */

@Injectable()
export class AdminService {
  private readonly logger = new Logger('admin service');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Invita a un nuevo administrador enviándole un email de registro a través de Supabase.
   * Crea el registro en la tabla `administrators` y lo vincula al usuario de Supabase.
   * El token generado por Supabase incluirá `isAdmin: true` y `rolId: null` en los metadatos.
   *
   * @param createAdminDto - Datos del administrador: `email`, `name`, `last_name`, `age`.
   * @returns El ID (`id`) del administrador recién creado.
   * @throws InternalServerErrorException si Supabase falla al enviar la invitación
   *   o si ocurre cualquier error inesperado durante la creación.
   */
  async addAdmin(createAdminDto: CreateAdminDto) {
    try {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        createAdminDto.email,
        {
          data: {
            nombre: createAdminDto.name,
            rol: "administrador",
          },
          redirectTo: 'http://localhost:3001/signup',
        },
      );

      if (error || !data?.user) {
        console.log(
          'Error al invitar admin:',
          error?.message || 'No se creó el usuario',
        );
        throw new InternalServerErrorException(error.message);
      }

      const userId = data.user.id;

      await supabase.auth.admin.updateUserById(userId, {
        // Se ingresa esto para que en el token que genera Supabase esté incluido que es Admin.
        // El rolId se pone null para consistencia, ya que los admins no tienen cargo asignado.
        app_metadata: { isAdmin: true, rolId: null, mustSetPassword: true },
      });

      const authId = data.user.id;
      const user = await this.prisma.administrators.create({
        data: {
          email: createAdminDto.email,
          name: createAdminDto.name,
          last_name: createAdminDto.last_name,
          age: createAdminDto.age,
          users: {
            connect: { id: authId },
          },
        },
      });

      this.logger.log(`Admin invitado: ${user.email}`);
      return user.id;
    } catch (error) {
      if (error instanceof Error) {
        console.log('Error al invitar admin:', error.message);
        throw new InternalServerErrorException(error.message);
      }

      throw new InternalServerErrorException('Error desconocido');
    }
  }

  /**
   * Retorna una lista paginada de todos los administradores registrados.
   *
   * @param paginationDto - Parámetros de paginación: `page` (default 1) y `limit` (default 10).
   * @returns Objeto con `data` (array de administradores) y `meta` con información de paginación:
   *   `total`, `page`, `limit` y `lastPage`.
   */
  async findAllAdmins(paginationDto: PaginationDto) {
    const { page, limit } = paginationDto;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.administrators.findMany({
        skip,
        take: limit,
      }),
      this.prisma.administrators.count(),
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
   * Busca y retorna un administrador por su ID interno.
   *
   * @param id - ID numérico del administrador.
   * @returns El registro completo del administrador encontrado.
   * @throws NotFoundException si no existe ningún administrador con ese ID.
   */
  async findOneAdmin(id: number) {
    const user = await this.prisma.administrators.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(
        'No se ha encontrado registro del administrador.',
      );
    }

    return user;
  }

  /**
   * Da de baja definitiva a un empleado: cambia su estado a `inactive` en la base de datos
   * y lo banea en Supabase con una duración extendida (equivalente a permanente),
   * impidiendo que pueda iniciar sesión.
   *
   * @param id - ID numérico del empleado (`id_employee`) a dar de baja.
   * @returns El registro actualizado del empleado con `status: inactive`.
   * @throws NotFoundException si no existe ningún empleado con ese ID.
   */
  async block(id: number) {
    const user = await this.prisma.employees.findUnique({
      where: { id_employee: id },
    });

    if (!user) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    // Supabase no tiene opción de baneo permanente, se usa un tiempo muy largo como equivalente.
    await supabase.auth.admin.updateUserById(user.supabase_user_id, {
      ban_duration: '876000h',
    });

    this.logger.log(`Empleado dado de baja: #${id}`);
    return this.prisma.employees.update({
      where: { id_employee: id },
      data: { status: 'inactive' },
    });
  }

  /**
   * Reactiva a un empleado previamente bloqueado: cambia su estado a `active` en la base de datos
   * y levanta el baneo en Supabase, permitiéndole volver a iniciar sesión.
   *
   * @param id - ID numérico del empleado (`id_employee`) a reactivar.
   * @returns El registro actualizado del empleado con `status: active`.
   * @throws NotFoundException si no existe ningún empleado con ese ID.
   */
  async unblock(id: number) {
    const user = await this.prisma.employees.findUnique({
      where: { id_employee: id },
    });

    if (!user) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    // Se retira el baneo para que pueda volver a ingresar.
    await supabase.auth.admin.updateUserById(user.supabase_user_id, {
      ban_duration: 'none',
    });

    this.logger.log(`Empleado reactivado: #${id}`);
    return this.prisma.employees.update({
      where: { id_employee: id },
      data: { status: 'active' },
    });
  }

  /**
   * Suspende temporalmente a un empleado cambiando su estado a `suspended`.
   * A diferencia de `block`, no banea al usuario en Supabase, por lo que es una
   * medida administrativa reversible sin afectar el acceso al sistema de autenticación.
   *
   * @param id_employee - ID numérico del empleado a suspender.
   * @returns El registro completo del empleado con `status: suspended`.
   * @throws NotFoundException si no existe ningún empleado con ese ID.
   * @throws BadRequestException si el empleado ya se encuentra en estado `suspended`.
   */
  async suspendEmployee(id: number) {
    const employee = await this.prisma.employees.findUnique({
      where: { id_employee: id },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    if (employee.status === 'suspended') {
      throw new BadRequestException('El empleado ya se encuentra suspendido.');
    }

    const updated = await this.prisma.employees.update({
      where: { id_employee: id },
      data: { status: 'suspended' },
    });

    this.logger.log(`Empleado suspendido: #${id}`);
    return updated;
  }

  /**
   * Reenvía el email de invitación a un empleado que aún no ha completado su registro.
   * Solo aplica a empleados con estado `invited`, evitando reenvíos innecesarios
   * a empleados que ya están activos o en otro estado.
   *
   * @param id_employee - ID numérico del empleado al que se quiere reenviar la invitación.
   * @returns Objeto con un mensaje de confirmación: `{ message: string }`.
   * @throws NotFoundException si no existe ningún empleado con ese ID.
   * @throws BadRequestException si el empleado no está en estado `invited`.
   * @throws InternalServerErrorException si Supabase falla al reenviar el email.
   */
  async resendInvitation(id: number) {
    const employee = await this.prisma.employees.findUnique({
      where: { id_employee: id },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    if (employee.status !== 'invited') {
      throw new BadRequestException(
        'Solo se puede reenviar la invitación a empleados con estado "invited".',
      );
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
      employee.email,
    );

    if (error || !data?.user) {
      throw new InternalServerErrorException(
        'Error al reenviar la invitación.',
      );
    }

    this.logger.log(`Invitación reenviada a: ${employee.email}`);
    return { message: `Invitación reenviada a ${employee.email}` };
  }
}
