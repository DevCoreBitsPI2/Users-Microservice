import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { 
  LoginDto,
  LoginOtpDto,
  VerifyOtpDto
 } from '@/src/auth/dto';
import { PaginationDto } from '@/src/common';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'login' })
  login(@Payload() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @MessagePattern({ cmd: 'loginOtp' })
  loginOtp(@Payload() loginOtpDto: LoginOtpDto) {
    return this.authService.loginOtp(loginOtpDto);
  }

  @MessagePattern({ cmd: 'verifyOtp' })
  verifyOtp(@Payload() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }
}
