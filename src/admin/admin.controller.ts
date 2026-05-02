import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AdminService } from './admin.service';
import { CreateAdminDto } from '@/src/admin/dto';
import { PaginationDto } from '@/src/common';
import { EmployeeIdDto } from '@/src/employees/dto';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Invita a un nuevo administrador por email.
   * Crea el usuario en Supabase con `isAdmin: true` y el registro en `administrators`.
   *
   * @pattern { cmd: 'createAdmin' }
   * @payload CreateAdminDto - { email, name, last_name, age }
   */
  @MessagePattern({ cmd: 'createAdmin' })
  addAdmin(@Payload() createAdminDto: CreateAdminDto) {
    return this.adminService.addAdmin(createAdminDto);
  }

  /**
   * Retorna una lista paginada de todos los administradores.
   *
   * @pattern { cmd: 'findAllAdmins' }
   * @payload PaginationDto - { page?, limit? }
   */
  @MessagePattern({ cmd: 'findAllAdmins' })
  findAllAdmins(@Payload() paginationDto: PaginationDto) {
    return this.adminService.findAllAdmins(paginationDto);
  }

  /**
   * Busca un administrador por su ID interno.
   *
   * @pattern { cmd: 'findAdminById' }
   * @payload number - ID del administrador
   */
  @MessagePattern({ cmd: 'findAdminById' })
  findOneAdmin(@Payload() id: number) {
    return this.adminService.findOneAdmin(id);
  }

  /**
   * Da de baja definitiva a un empleado: lo marca como `inactive` y lo banea en Supabase.
   * Representa el flujo de despido o desvinculación. No elimina el registro.
   *
   * @pattern { cmd: 'blockUser' }
   * @payload number - ID del empleado (`id_employee`)
   */
  @MessagePattern({ cmd: 'blockUser' })
  block(@Payload() id: number) {
    return this.adminService.block(id);
  }

  /**
   * Reactiva a un empleado previamente bloqueado: lo marca como `active` y levanta el baneo en Supabase.
   *
   * @pattern { cmd: 'unblockUser' }
   * @payload number - ID del empleado (`id_employee`)
   */
  @MessagePattern({ cmd: 'unblockUser' })
  unblock(@Payload() id: number) {
    return this.adminService.unblock(id);
  }

  /**
   * Suspende temporalmente a un empleado cambiando su estado a `suspended`.
   * No afecta el acceso en Supabase, es una medida administrativa reversible.
   *
   * @pattern { cmd: 'suspendEmployee' }
   * @payload EmployeeIdDto - { id_employee: number }
   */
  @MessagePattern({ cmd: 'suspendEmployee' })
  suspendEmployee(@Payload() employeeIdDto: EmployeeIdDto) {
    return this.adminService.suspendEmployee(employeeIdDto);
  }

  /**
   * Reenvía el email de invitación a un empleado con estado `invited`
   * que aún no ha completado su registro.
   *
   * @pattern { cmd: 'resendInvitation' }
   * @payload EmployeeIdDto - { id_employee: number }
   */
  @MessagePattern({ cmd: 'resendInvitation' })
  resendInvitation(@Payload() employeeIdDto: EmployeeIdDto) {
    return this.adminService.resendInvitation(employeeIdDto);
  }
}
