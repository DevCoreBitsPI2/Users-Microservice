import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InternalServerErrorException } from '@nestjs/common';
import { NATS_SERVICE } from '@/src/config/services';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@/src/lib/prisma';
import { Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  GenerateEmployeeQrDto,
  InviteUserDto,
  ScanEmployeeQrDto,
  UpdateProfileDto,
  UpdateEmployeeDto,
  FilterEmployeesDto,
} from '@/src/employees/dto';
import { supabase } from '@/src/lib/supabase/supabase';
import { envs } from '@/src/config';
import {
  C_LEVEL_POSITION_IDS,
  LEAD_POSITION_IDS,
} from '@/src/employees/enums/position.enum';

/*
NotFoundException lanza automáticamente el error 404.
BadRequestException es cuándo no hay datos válidos.
ForbiddenException es cuando no hay permisos.
Usando las clases directamente se lanzan solos sin hacer HttpException. */

@Injectable()
export class UsersService {
  private readonly logger = new Logger('users service');
  private readonly employeeQrPurpose = 'employee-qr';
  private readonly employeeQrTtlSeconds = 15 * 60;

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
      // 1. Verificar si el usuario ya existe
      const existingUser = await this.prisma.employees.findUnique({
        where: { email: inviteUserDto.email },
      });

      if (existingUser) {
        throw new InternalServerErrorException(
          'Ya existe un usuario con ese correo electrónico.',
        );
      }

      // 2. Obtener el cargo desde el microservicio
      const cargo = await firstValueFrom(
        this.client.send({ cmd: 'findOnePosition' }, inviteUserDto.id_position),
      );

      if (!cargo) {
        throw new InternalServerErrorException('Cargo no encontrado');
      }

      if (!cargo?.name) {
        throw new InternalServerErrorException('El cargo no tiene nombre');
      }

      // 3. Invitar usuario en Supabase
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        inviteUserDto.email,
        {
          data: {
            nombre: inviteUserDto.first_name,
            rol: cargo.name,
          },
          redirectTo: 'http://localhost:3001/signup',
        },
      );

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      if (!data?.user) {
        throw new InternalServerErrorException(
          'No se pudo crear el usuario en Auth',
        );
      }

      const authId = data.user.id;

      // 4. Actualizar metadata
      await supabase.auth.admin.updateUserById(authId, {
        app_metadata: {
          roleId: inviteUserDto.id_position,
          isAdmin: false,
          mustSetPassword: true,
        },
      });

      // 5. Crear usuario en base de datos
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

      return user;
    } catch (error) {
      throw error;
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
  async generateEmployeeQr(generateEmployeeQrDto: GenerateEmployeeQrDto) {
    const employee = await this.prisma.employees.findUnique({
      where: { id_employee: generateEmployeeQrDto.id_employee },
      select: { id_employee: true },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    if (
      !generateEmployeeQrDto.scannerIsAdmin &&
      generateEmployeeQrDto.scannerEmployeeId !== employee.id_employee
    ) {
      throw new ForbiddenException(
        'No tiene permisos para generar este código QR.',
      );
    }

    const expiresAt = new Date(Date.now() + this.employeeQrTtlSeconds * 1000);
    const qrToken = this.signEmployeeQrToken(employee.id_employee, expiresAt);

    return {
      qrToken,
      expiresAt,
    };
  }

  async scanEmployeeQr(scanEmployeeQrDto: ScanEmployeeQrDto) {
    const payload = this.verifyEmployeeQrToken(scanEmployeeQrDto.qrToken);
    const employee = await this.prisma.employees.findUnique({
      where: { id_employee: payload.employeeId },
      select: {
        id_employee: true,
        first_name: true,
        last_name: true,
        age: true,
        email: true,
        code: true,
        status: true,
        id_position: true,
        photo_url: true,
        id_manager: true,
        id_administrator: true,
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    const visibilityLevel = this.resolveQrVisibilityLevel(
      employee,
      scanEmployeeQrDto,
    );
    const enabled = employee.status === 'active';

    return {
      enabled,
      status: employee.status,
      message: enabled ? null : 'Employee is not currently enabled',
      visibilityLevel,
      employee: this.pickEmployeeQrFields(employee, visibilityLevel),
    };
  }

  private signEmployeeQrToken(employeeId: number, expiresAt: Date): string {
    const payload = {
      employeeId,
      purpose: this.employeeQrPurpose,
      exp: Math.floor(expiresAt.getTime() / 1000),
    };

    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  private verifyEmployeeQrToken(token: string): {
    employeeId: number;
    purpose: string;
    exp: number;
  } {
    const [encodedPayload, signature] = token.split('.');

    if (!encodedPayload || !signature) {
      throw new BadRequestException('Invalid QR token');
    }

    const expectedSignature = this.sign(encodedPayload);
    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new BadRequestException('Invalid QR token');
    }

    const payload = JSON.parse(this.base64UrlDecode(encodedPayload));

    if (
      payload.purpose !== this.employeeQrPurpose ||
      !Number.isInteger(payload.employeeId)
    ) {
      throw new BadRequestException('Invalid QR token');
    }

    if (Date.now() >= payload.exp * 1000) {
      throw new UnauthorizedException('QR token expired');
    }

    return payload;
  }

  private sign(value: string): string {
    return createHmac('sha256', envs.qrTokenSecret)
      .update(value)
      .digest('base64url');
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  private resolveQrVisibilityLevel(
    employee: { id_employee: number; id_manager: number | null },
    scanner: ScanEmployeeQrDto,
  ): 'full' | 'manager' | 'self' | 'basic' {
    if (scanner.scannerIsAdmin) return 'full';
    if (C_LEVEL_POSITION_IDS.includes(scanner.scannerPosition)) return 'full';
    if (scanner.scannerEmployeeId === employee.id_employee) return 'self';
    if (
      scanner.scannerEmployeeId &&
      scanner.scannerEmployeeId === employee.id_manager
    )
      return 'manager';
    if (LEAD_POSITION_IDS.includes(scanner.scannerPosition)) return 'manager';

    return 'basic';
  }

  private pickEmployeeQrFields(
    employee: any,
    visibilityLevel: 'full' | 'manager' | 'self' | 'basic',
  ) {
    if (visibilityLevel === 'full') return employee;

    if (visibilityLevel === 'manager') {
      return {
        id_employee: employee.id_employee,
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        status: employee.status,
        id_position: employee.id_position,
        id_manager: employee.id_manager,
        photo_url: employee.photo_url,
      };
    }

    if (visibilityLevel === 'self') {
      return {
        id_employee: employee.id_employee,
        first_name: employee.first_name,
        last_name: employee.last_name,
        age: employee.age,
        email: employee.email,
        code: employee.code,
        status: employee.status,
        id_position: employee.id_position,
        photo_url: employee.photo_url,
      };
    }

    return {
      id_employee: employee.id_employee,
      first_name: employee.first_name,
      last_name: employee.last_name,
      status: employee.status,
      id_position: employee.id_position,
      photo_url: employee.photo_url,
    };
  }

  async findEmployeesByIds(ids: number[]) {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id));

    if (uniqueIds.length === 0) {
      return [];
    }

    return this.prisma.employees.findMany({
      where: {
        id_employee: { in: uniqueIds },
      },
      select: {
        id_employee: true,
        first_name: true,
        last_name: true,
        email: true,
      },
    });
  }
  async findEmployeesByPositionIds(positionIds: number[]) {
    const uniqueIds = [...new Set(positionIds)].filter((id) =>
      Number.isInteger(id),
    );

    if (uniqueIds.length === 0) {
      return [];
    }

    return this.prisma.employees.findMany({
      where: {
        id_position: { in: uniqueIds },
        status: 'active',
      },
      select: {
        id_employee: true,
        first_name: true,
        last_name: true,
        email: true,
        id_position: true,
      },
    });
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
  async getMyProfile(id: string) {
    const employee = await this.prisma.employees.findUnique({
      where: { supabase_user_id: id },
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
  async getSubordinates(id: number) {
    const employee = await this.prisma.employees.findUnique({
      where: { id_employee: id },
    });

    if (!employee) {
      throw new NotFoundException(
        'No se ha encontrado registro del funcionario.',
      );
    }

    return this.prisma.employees.findMany({
      where: { id_manager: id },
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

    if (
      data.id_position !== undefined &&
      data.id_position !== employee.id_position
    ) {
      const [previousPosition, newPosition] = await Promise.all([
        firstValueFrom(
          this.client.send({ cmd: 'findOnePosition' }, employee.id_position),
        ),
        firstValueFrom(
          this.client.send({ cmd: 'findOnePosition' }, data.id_position),
        ),
      ]);

      await this.createCareerHistory({
        id_employee,
        type: this.resolvePositionChangeType(previousPosition, newPosition),
        description: `Cambio de cargo de ${previousPosition.name} a ${newPosition.name}`,
      });
    }

    if (
      data.id_manager !== undefined &&
      data.id_manager !== employee.id_manager
    ) {
      await this.createCareerHistory({
        id_employee,
        type: 'transfer',
        description: `Cambio de jefe directo de ${employee.id_manager ?? 'sin jefe'} a ${data.id_manager ?? 'sin jefe'}`,
      });
    }

    this.logger.log(`Empleado actualizado por admin: #${id_employee}`);
    return updated;
  }

  private resolvePositionChangeType(
    previousPosition: { id_area?: number; base_salary?: number | null },
    newPosition: { id_area?: number; base_salary?: number | null },
  ): 'promotion' | 'transfer' {
    if (previousPosition.id_area !== newPosition.id_area) return 'transfer';

    const previousSalary = previousPosition.base_salary ?? 0;
    const newSalary = newPosition.base_salary ?? 0;

    if (newSalary > previousSalary) return 'promotion';

    return 'transfer';
  }

  private async createCareerHistory(payload: {
    id_employee: number;
    type:
      | 'promotion'
      | 'transfer'
      | 'contract_modification'
      | 'salary_change'
      | 'evaluation';
    description: string;
  }) {
    await firstValueFrom(
      this.client.send(
        { cmd: 'createCareerHistory' },
        {
          ...payload,
          event_date: new Date(),
        },
      ),
    );
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

  async firstTimeSetup(idSupabase: string) {
    const { data: userData } =
      await supabase.auth.admin.getUserById(idSupabase);

    const mustSetPassword =
      userData.user.app_metadata?.mustSetPassword ?? false;

    return { isFirstLogin: mustSetPassword };
  }

  async completeFirstTimeSetup(idSupabase: string) {
    await supabase.auth.admin.updateUserById(idSupabase, {
      app_metadata: {
        mustSetPassword: false,
      },
    });
    const employee = await this.prisma.employees.findUnique({
      where: { supabase_user_id: idSupabase },
      select: { id_employee: true },
    });

    if(employee){
      await this.prisma.employees.update({
        where: { id_employee: employee.id_employee },
        data: {
          status: 'active',
        },
      });
    }

    return { ok: true };
  }
}
