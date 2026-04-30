import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AdminService } from './admin.service';
import { 
  CreateAdminDto
 } from '@/src/users/admin/dto';
import { PaginationDto } from '@/src/common';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @MessagePattern({ cmd: 'blockUser' })
  block(@Payload() id: number) {
    return this.adminService.block(id);
  }

  @MessagePattern({ cmd: 'unblockUser' })
  unblock(@Payload() id: number) {
    return this.adminService.unblock(id);
  }

  @MessagePattern({cmd: 'createAdmin'})
  addAdmin(@Payload() createAdminDto: CreateAdminDto){
    return this.adminService.addAdmin(createAdminDto)
  }

  @MessagePattern({ cmd: 'findAllAdmins' })
  findAllAdmins(@Payload() paginationDto: PaginationDto) {
    return this.adminService.findAllAdmins(paginationDto);
  }

  @MessagePattern({ cmd: 'findAdminById' })
  findOneAdmin(@Payload() id: number) {
    return this.adminService.findOneAdmin(id);
  }
}
