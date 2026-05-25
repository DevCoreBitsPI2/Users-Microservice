// test/bdd/steps/autenticacion-usuarios.steps.ts
import { Test, TestingModule } from '@nestjs/testing';
import { defineFeature, loadFeature } from 'jest-cucumber';
import * as path from 'path';

import {
  mockPrismaService,
  mockNatsClient,
  mockSupabaseAdmin,
  resetMocks,
} from '../mocks/prisma.mock';

// Mock del singleton de supabase ANTES de importar AuthService
// AuthService usa: supabase.auth.signInWithPassword, signInWithOtp, verifyOtp, getUser
jest.mock('../../src/lib/supabase/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSupabaseAuth.signInWithPassword,
      signInWithOtp: mockSupabaseAuth.signInWithOtp,
      verifyOtp: mockSupabaseAuth.verifyOtp,
      getUser: mockSupabaseAuth.getUser,
      admin: mockSupabaseAdmin.auth.admin,
    },
  },
}));

// Definicion del mock de metodos de auth de supabase (cliente anonimo, no admin)
// Se define ANTES del jest.mock para que la factory los capture
const mockSupabaseAuth = {
  signInWithPassword: jest.fn(),
  signInWithOtp: jest.fn(),
  verifyOtp: jest.fn(),
  getUser: jest.fn(),
};

jest.mock('../../src/config', () => ({
  envs: {
    databaseUrl: 'postgresql://mock:mock@localhost:5432/mock',
    supabaseUrl: 'https://mock.supabase.co',
    databaseAdminKey: 'mock-admin-key',
    databaseKey: 'mock-anon-key',
    natsServers: ['nats://localhost:4222'],
    qrTokenSecret: 'mock-qr-secret',
  },
}));

import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/lib/prisma';
import { NATS_SERVICE } from '../../src/config/services';

const feature = loadFeature(
  path.join(__dirname, '../features/autenticacion.feature'),
);

type AuthResult = {
  session?: { access_token?: string; user?: unknown };
  access_token?: string;
  position?: number | null;
  isAdmin?: boolean;
  token?: string;
  [key: string]: unknown;
};

defineFeature(feature, (test) => {
  let authService: AuthService;
  let result: unknown;
  let thrownError: Error | undefined;

  beforeEach(async () => {
    resetMocks();
    // Resetear mocks del cliente anonimo
    Object.values(mockSupabaseAuth).forEach((fn: jest.Mock) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NATS_SERVICE, useValue: mockNatsClient },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    result = undefined;
    thrownError = undefined;
  });

  // =========================================================================
  // CA1: Inicio de sesion exitoso con credenciales validas
  // Metodo real: authService.login({ email, password })
  // =========================================================================
  test('Inicio de sesion exitoso con credenciales validas', ({
    given,
    when,
    then,
    and,
  }) => {
    given(
      'que el usuario tiene credenciales validas registradas en el sistema',
      () => {
        mockSupabaseAuth.signInWithPassword.mockResolvedValue({
          data: {
            session: {
              access_token: 'jwt-token-valido',
              refresh_token: 'refresh-token',
              user: {
                id: 'supabase-uuid-001',
                email: 'juan.perez@empresa.com',
              },
            },
            user: { id: 'supabase-uuid-001' },
          },
          error: null,
        });
      },
    );

    when(
      /^ingresa su email "(.*)" y contrasena correcta$/,
      async (email: string) => {
        result = await authService.login({ email, password: 'Password123!' });
      },
    );

    then('el sistema retorna la sesion con el token de acceso', () => {
      expect(result).toBeDefined();
      expect((result as AuthResult).session).toBeDefined();
    });

    and('la sesion contiene los datos del usuario autenticado', () => {
      const sesion = (result as AuthResult).session;
      expect(sesion).toHaveProperty('access_token');
      expect(sesion).toHaveProperty('user');
    });
  });

  test('Rechazo por contrasena incorrecta', ({ given, when, then, and }) => {
    given(
      /^que el usuario existe en el sistema con email "(.*)"$/,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_email: string) => {
        mockSupabaseAuth.signInWithPassword.mockRejectedValue(
          new Error('Invalid login credentials'),
        );
      },
    );

    when('intenta iniciar sesion con una contrasena incorrecta', async () => {
      try {
        result = await authService.login({
          email: 'juan.perez@empresa.com',
          password: 'contrasena-incorrecta',
        });
      } catch (error) {
        thrownError = error as Error;
      }
    });

    then('el sistema rechaza el acceso', () => {
      expect(thrownError).toBeDefined();
    });

    and('retorna un mensaje de error de autenticacion', () => {
      expect(thrownError.message).toMatch(/Invalid login credentials/i);
    });
  });

  test('Inicio de sesion exitoso por OTP', ({ given, when, then, and }) => {
    given(
      /^que el usuario existe en el sistema con email "(.*)"$/,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_email: string) => {
        mockSupabaseAuth.signInWithOtp.mockResolvedValue({
          data: { user: null, session: null, messageId: 'msg-001' },
          error: null,
        });
      },
    );

    when(/^solicita un codigo OTP para ese email$/, async () => {
      result = await authService.loginOtp({
        email: 'juan.perez@empresa.com',
      });
    });

    then('el sistema envia el codigo OTP correctamente', () => {
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledTimes(1);
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'juan.perez@empresa.com',
          options: { shouldCreateUser: false },
        }),
      );
    });

    and('retorna confirmacion del envio', () => {
      expect(result).toBeDefined();
    });
  });

  test('Verificacion exitosa de OTP valido', ({ given, when, then, and }) => {
    given('que el usuario recibio un codigo OTP valido', () => {
      mockSupabaseAuth.verifyOtp.mockResolvedValue({
        data: {
          session: {
            access_token: 'jwt-token-otp',
            user: {
              id: 'supabase-uuid-001',
              app_metadata: { roleId: 5, isAdmin: false },
            },
          },
        },
        error: null,
      });
    });

    when(
      /^verifica el OTP con email "(.*)" y el token correcto$/,
      async (email: string) => {
        result = await authService.verifyOtp({ email, token: '123456' });
      },
    );

    then('el sistema retorna el token JWT de acceso', () => {
      expect((result as AuthResult).token).toBeDefined();
      expect((result as AuthResult).token).toBe('jwt-token-otp');
    });

    and('el resultado incluye el cargo y el rol del usuario', () => {
      expect((result as AuthResult).position).toBe(5);
      expect((result as AuthResult).isAdmin).toBe(false);
    });
  });

  test('Rechazo por OTP invalido o expirado', ({ given, when, then, and }) => {
    given('que el usuario intenta verificar con un OTP incorrecto', () => {
      mockSupabaseAuth.verifyOtp.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token has expired or is invalid' },
      });
    });

    when(
      /^verifica el OTP con email "(.*)" y token invalido$/,
      async (email: string) => {
        try {
          result = await authService.verifyOtp({
            email,
            token: 'token-invalido',
          });
        } catch (error) {
          thrownError = error as Error;
        }
      },
    );

    then('el sistema rechaza la verificacion', () => {
      expect(thrownError).toBeDefined();
    });

    and('retorna un error de autorizacion', () => {
      expect(thrownError.message).toMatch(/Token has expired|Invalid OTP/i);
    });
  });

  test('Token invalido despues del cierre de sesion', ({
    given,
    when,
    then,
  }) => {
    given('que no se proporciona ningun token de sesion', () => {
      // No se necesita configurar mocks: el servicio lanza antes de llamar a Supabase
    });

    when('el sistema intenta verificar ese token', async () => {
      try {
        result = await authService.verifyToken('');
      } catch (error) {
        thrownError = error as Error;
      }
    });

    then(
      'el sistema rechaza la verificacion con error de token no encontrado',
      () => {
        expect(thrownError).toBeDefined();
        expect(thrownError.message).toMatch(/Token not found/i);
        // Supabase nunca debe ser consultado si el token esta vacio
        expect(mockSupabaseAuth.getUser).not.toHaveBeenCalled();
      },
    );
  });
});
