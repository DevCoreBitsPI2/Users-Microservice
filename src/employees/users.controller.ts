import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import {
  InviteUserDto,
  GenerateEmployeeQrDto,
  ScanEmployeeQrDto,
  UpdateProfileDto,
  UpdateEmployeeDto,
  FilterEmployeesDto,
  FilterByPositionIdsDto,
} from '@/src/employees/dto';
import { UploadProfileImageDto } from './dto/upload-photo.dto';
import { Express } from 'express';


@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Invita a un nuevo empleado por email.
   * Crea el usuario en Supabase y el registro en la tabla `employees`.
   *
   * @pattern { cmd: 'inviteUser' }
   * @payload InviteUserDto - { email, first_name, last_name, age, code, status, id_position, id_administrator, id_manager? }
   */
  @MessagePattern({ cmd: 'inviteUser' })
  inviteUser(@Payload() inviteUserDto: InviteUserDto) {
    return this.usersService.inviteUser(inviteUserDto);
  }

  /**
   * Retorna una lista paginada de empleados con filtros opcionales.
   * Soporta filtrar por `status`, `id_position`, `id_manager` e `id_administrator`.
   *
   * @pattern { cmd: 'findAllUsers' }
   * @payload FilterEmployeesDto - { page?, limit?, status?, id_position?, id_manager?, id_administrator? }
   */
  @MessagePattern({ cmd: 'findAllUsers' })
  findAll(@Payload() filterDto: FilterEmployeesDto) {
    return this.usersService.findAll(filterDto);
  }

  /**
   * Busca un empleado por su ID interno (`id_employee`).
   *
   * @pattern { cmd: 'findUserById' }
   * @payload number - ID del empleado
   */
  @MessagePattern({ cmd: 'findUserById' })
  findOne(@Payload() id: number) {
    return this.usersService.findOne(id);
  }
  @MessagePattern({ cmd: 'generateEmployeeQr' })
  generateEmployeeQr(@Payload() generateEmployeeQrDto: GenerateEmployeeQrDto) {
    return this.usersService.generateEmployeeQr(generateEmployeeQrDto);
  }

  @MessagePattern({ cmd: 'scanEmployeeQr' })
  scanEmployeeQr(@Payload() scanEmployeeQrDto: ScanEmployeeQrDto) {
    return this.usersService.scanEmployeeQr(scanEmployeeQrDto);
  }

  @MessagePattern({ cmd: 'findEmployeesByIds' })
  findEmployeesByIds(@Payload() ids: number[]) {
    return this.usersService.findEmployeesByIds(ids);
  }
  @MessagePattern({ cmd: 'findEmployeesByPositionIds' })
  findEmployeesByPositionIds(@Payload() dto: FilterByPositionIdsDto) {
    return this.usersService.findEmployeesByPositionIds(dto.positionIds);
  }
  /**
   * Retorna el perfil del empleado autenticado a partir de su UUID de Supabase.
   * Pensado para ser llamado con el `supabase_user_id` extraído del token JWT.
   *
   * @pattern { cmd: 'getMyProfile' }
   * @payload string - UUID del usuario en Supabase
   */
  @MessagePattern({ cmd: 'getMyProfile' })
  getMyProfile(@Payload() id: string) {
    return this.usersService.getMyProfile(id);
  }

  /**
   * Retorna los subordinados directos de un empleado (quienes lo tienen como manager).
   *
   * @pattern { cmd: 'getSubordinates' }
   * @payload EmployeeIdDto - { id_employee: number }
   */
  @MessagePattern({ cmd: 'getSubordinates' })
  getSubordinates(@Payload() id: number) {
    return this.usersService.getSubordinates(id);
  }

  /**
   * Permite al propio empleado actualizar su foto de perfil y/o edad.
   * No permite modificar otros campos del registro.
   *
   * @pattern { cmd: 'updateProfile' }
   * @payload UpdateProfileDto - { id_employee, photo_url?, age? }
   */
  @MessagePattern({ cmd: 'updateProfile' })
  updateProfile(@Payload() updateProfileDto: UpdateProfileDto) {
    return this.usersService.updateProfile(updateProfileDto);
  }

  /**
   * Permite a un administrador actualizar datos operativos de un empleado:
   * cargo (`id_position`), manager (`id_manager`) y/o estado (`status`).
   *
   * @pattern { cmd: 'updateEmployee' }
   * @payload UpdateEmployeeDto - { id_employee, id_position?, id_manager?, status? }
   */
  @MessagePattern({ cmd: 'updateEmployee' })
  updateEmployee(@Payload() updateEmployeeDto: UpdateEmployeeDto) {
    return this.usersService.updateEmployee(updateEmployeeDto);
  }

  @MessagePattern({ cmd: 'firstTimeSetup' })
  firstTimeSetup(@Payload() idSupabase: string) {
    return this.usersService.firstTimeSetup(idSupabase);
  }

  @MessagePattern({ cmd: 'completeFirstLogin' })
  completeFirstTimeSetup(@Payload() idSupabase: string) {
    return this.usersService.completeFirstTimeSetup(idSupabase);
  }

  @MessagePattern({ cmd: 'uploadProfileImage' })
  async uploadProfileImage(@Payload() payload: UploadProfileImageDto) {
    const buffer = Buffer.from(payload.bufferBase64, 'base64');

    const file = {
      fieldname: payload.fieldname || 'file',
      originalname: payload.originalname,
      encoding: payload.encoding || '7bit',
      mimetype: payload.mimetype,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const uploadedImage = await this.usersService.uploadFile(file);

    return this.usersService.uploadProfileImage({
      idUser: payload.idUser,
      imageUrl: uploadedImage.secure_url,
      publicId: uploadedImage.public_id,
    });
  }
}
