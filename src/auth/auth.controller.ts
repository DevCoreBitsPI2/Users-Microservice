import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { LoginDto, LoginOtpDto, VerifyOtpDto } from '@/src/auth/dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Autentica a un usuario con email y contraseña.
   * Retorna la sesión de Supabase con el token de acceso.
   *
   * @pattern { cmd: 'login' }
   * @payload LoginDto - { email, password }
   */
  @MessagePattern({ cmd: 'login' })
  login(@Payload() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Inicia el flujo de login por OTP enviando un código al email del usuario.
   * El usuario debe existir previamente en Supabase.
   *
   * @pattern { cmd: 'loginOtp' }
   * @payload LoginOtpDto - { email }
   */
  @MessagePattern({ cmd: 'loginOtp' })
  loginOtp(@Payload() loginOtpDto: LoginOtpDto) {
    return this.authService.loginOtp(loginOtpDto);
  }

  /**
   * Verifica el OTP recibido por email y retorna el token JWT de sesión
   * junto con el cargo y rol del usuario autenticado.
   *
   * @pattern { cmd: 'verifyOtp' }
   * @payload VerifyOtpDto - { email, token }
   */
  @MessagePattern({ cmd: 'verifyOtp' })
  verifyOtp(@Payload() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }
}
