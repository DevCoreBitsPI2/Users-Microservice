import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { 
  InviteUserDto,
  CreateAdminDto
 } from '@/src/users/dto';
import { PaginationDto } from '@/src/common';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'inviteUser' })
  inviteUser(@Payload() inviteUserDto: InviteUserDto) {
    return this.usersService.inviteUser(inviteUserDto);
  }

  @MessagePattern({ cmd: 'findAllUsers' })
  findAll(@Payload() paginationDto: PaginationDto) {
    return this.usersService.findAll(paginationDto);
  }

  @MessagePattern({ cmd: 'findUserById' })
  findOne(@Payload() id: number) {
    return this.usersService.findOne(id);
  }
  @MessagePattern({ cmd: 'blockUser' })
  block(@Payload() id: number) {
    return this.usersService.block(id);
  }

  @MessagePattern({ cmd: 'unblockUser' })
  unblock(@Payload() id: number) {
    return this.usersService.unblock(id);
  }

  @MessagePattern({cmd: 'createAdmin'})
  addAdmin(@Payload() createAdminDto: CreateAdminDto){
    return this.usersService.addAdmin(createAdminDto)
  }

  @MessagePattern({ cmd: 'findAllAdmins' })
  findAllAdmins(@Payload() paginationDto: PaginationDto) {
    return this.usersService.findAllAdmins(paginationDto);
  }

  @MessagePattern({ cmd: 'findAdminById' })
  findOneAdmin(@Payload() id: number) {
    return this.usersService.findOneAdmin(id);
  }

  // @MessagePattern('updateUser')
  // update(@Payload() updateUserDto: UpdateUserDto) {
  //   return this.usersService.update(updateUserDto.id, updateUserDto);
  // }

  // @MessagePattern('blockUser')
  // remove(@Payload() id: number) {
  //   return this.usersService.block(id);
  // }
}
