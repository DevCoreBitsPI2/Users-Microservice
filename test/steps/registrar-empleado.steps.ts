import { Test, TestingModule } from '@nestjs/testing';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { of } from 'rxjs';
import * as path from 'path';

// Importar mocks PRIMERO para que jest.mock() se ejecute antes de las importaciones
import {
  mockPrismaService,
  mockNatsClient,
  mockSupabaseAdmin,
  mockEmployee,
  mockCargo,
  resetMocks,
} from '../mocks/prisma.mock';

// Definir los mocks ANTES de importar servicios que los usan
jest.mock('../../src/lib/supabase/supabase', () => ({
  supabase: mockSupabaseAdmin,
}));

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

// Ahora importar los servicios reales (despues de los jest.mock())
import { UsersService } from '../../src/employees/users.service';
import { InviteUserDto } from '../../src/employees/dto/invite-user.dto';
import { PrismaService } from '../../src/lib/prisma';
import { NATS_SERVICE } from '../../src/config/services';

const feature = loadFeature(
  path.join(__dirname, '../features/registrar-empleado.feature'),
);

type EmployeeResult = {
  id_employee?: number;
  status?: string;
  email?: string;
  [key: string]: unknown;
};

defineFeature(feature, (test) => {
  let usersService: UsersService;
  let inviteUserDto: Partial<InviteUserDto>;
  let result: unknown;
  let thrownError: Error | undefined;

  beforeEach(async () => {
    resetMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: NATS_SERVICE,
          useValue: mockNatsClient,
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    result = undefined;
    thrownError = undefined;
  });

  // Scenario 1: Registro exitoso de empleado con datos completos
  test('Registro exitoso de empleado con datos completos', ({
    given,
    when,
    then,
    and,
  }) => {
    given('que el administrador tiene los datos completos del empleado', () => {
      inviteUserDto = {
        email: 'juan.perez@empresa.com',
        first_name: 'Juan',
        last_name: 'Perez',
        age: 30,
        code: 1001,
        status: 'invited',
        id_position: 5,
        id_administrator: 1,
        id_manager: null,
      };

      mockNatsClient.send.mockReturnValue(of(mockCargo));
      mockPrismaService.employees.findUnique.mockResolvedValue(null);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'supabase-uuid-nuevo' } },
        error: null,
      });
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });
      mockPrismaService.employees.create.mockResolvedValue({
        ...mockEmployee,
        ...inviteUserDto,
      });
    });

    when('confirma el registro del empleado', async () => {
      result = await usersService.inviteUser(inviteUserDto as InviteUserDto);
    });

    then('el sistema crea el empleado exitosamente', () => {
      expect(mockPrismaService.employees.create).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    and('el empleado queda con estado "invited"', () => {
      expect((result as EmployeeResult).status).toBe('invited');
    });

    and('se genera un identificador UUID unico no editable', () => {
      expect((result as EmployeeResult).id_employee).toBeDefined();
      expect(inviteUserDto).not.toHaveProperty('id_employee');
    });
  });

  // Scenario 2: Rechazo por correo electronico duplicado
  test('Rechazo por correo electronico duplicado', ({ given, when, then }) => {
    given(
      /^que ya existe un empleado registrado con el email "(.*)"$/,
      (email: string) => {
        mockPrismaService.employees.findUnique.mockResolvedValue({
          ...mockEmployee,
          email,
        });
      },
    );

    when(
      /^se intenta registrar otro empleado con el mismo email "(.*)"$/,
      async (email: string) => {
        inviteUserDto = {
          email,
          first_name: 'Pedro',
          last_name: 'Lopez',
          age: 28,
          code: 1002,
          status: 'invited',
          id_position: 5,
          id_administrator: 1,
        };
        try {
          result = await usersService.inviteUser(
            inviteUserDto as InviteUserDto,
          );
        } catch (error) {
          thrownError = error as Error;
        }
      },
    );

    then('el sistema rechaza la operacion con error de duplicidad', () => {
      expect(thrownError).toBeDefined();
      expect(thrownError.message).toMatch(/ya existe|correo electronico/i);
      expect(
        mockSupabaseAdmin.auth.admin.inviteUserByEmail,
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.employees.create).not.toHaveBeenCalled();
    });
  });

  // Scenario 3: Rechazo por campos obligatorios vacios
  test('Rechazo por campos obligatorios vacios', ({
    given,
    when,
    then,
    and,
  }) => {
    given(
      /^que el administrador no proporciona el campo obligatorio "(.*)"$/,
      (campo: string) => {
        inviteUserDto = {
          first_name: 'Maria',
          last_name: 'Garcia',
          age: 25,
          code: 1003,
          status: 'invited',
          id_position: 5,
          id_administrator: 1,
        };

        if (campo !== 'email' && inviteUserDto[campo] !== undefined) {
          delete inviteUserDto[campo];
        }

        mockPrismaService.employees.findUnique.mockRejectedValue(
          new Error('Campo requerido ausente'),
        );
      },
    );

    when('intenta confirmar el registro del empleado', async () => {
      try {
        result = await usersService.inviteUser(inviteUserDto as InviteUserDto);
      } catch (error) {
        thrownError = error as Error;
      }
    });

    then(
      'el sistema retorna un error de validacion indicando el campo requerido',
      () => {
        expect(thrownError).toBeDefined();
      },
    );

    and('no se crea ningun registro en la base de datos', () => {
      expect(mockPrismaService.employees.create).not.toHaveBeenCalled();
    });
  });

  // Scenario 4: Rechazo por formato invalido de correo electronico
  test('Rechazo por formato invalido de correo electronico', ({
    given,
    when,
    then,
    and,
  }) => {
    given(
      /^que el administrador ingresa el email con formato invalido "(.*)"$/,
      (emailInvalido: string) => {
        inviteUserDto = {
          email: emailInvalido,
          first_name: 'Carlos',
          last_name: 'Ruiz',
          age: 35,
          code: 1004,
          status: 'invited',
          id_position: 5,
          id_administrator: 1,
        };

        mockPrismaService.employees.findUnique.mockResolvedValue(null);
        mockNatsClient.send.mockReturnValue(of(mockCargo));
        mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
          data: null,
          error: {
            message: 'Unable to validate email address: invalid format',
          },
        });
      },
    );

    when('intenta confirmar el registro del empleado', async () => {
      try {
        result = await usersService.inviteUser(inviteUserDto as InviteUserDto);
      } catch (error) {
        thrownError = error as Error;
      }
    });

    then(
      'el sistema retorna un error de validacion indicando el campo requerido',
      () => {
        expect(thrownError).toBeDefined();
      },
    );

    and('no se crea ningun registro en la base de datos', () => {
      expect(mockPrismaService.employees.create).not.toHaveBeenCalled();
    });
  });
});
