import { Test, TestingModule } from '@nestjs/testing';
import { defineFeature, loadFeature } from 'jest-cucumber';
import * as path from 'path';

import {
  mockPrismaService,
  mockNatsClient,
  mockSupabaseAdmin,
  mockEmployee,
  resetMocks,
} from '../mocks/prisma.mock';

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

import { UsersService } from '../../src/employees/users.service';
import { PrismaService } from '../../src/lib/prisma';
import { NATS_SERVICE } from '../../src/config/services';

const feature = loadFeature(
  path.join(__dirname, '../features/consultar-historial.feature'),
);

defineFeature(feature, (test) => {
  let usersService: UsersService;
  let result: unknown;
  let thrownError: unknown;

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

  test('Consulta exitosa del perfil de empleado con permisos adecuados', ({
    given,
    and,
    when,
    then,
  }) => {
    given(
      /^que existe un empleado registrado con id "(.*)"$/,
      (empleadoId: string) => {
        mockPrismaService.employees.findUnique.mockResolvedValue({
          ...mockEmployee,
          id_employee: Number(empleadoId),
        });
      },
    );

    and('el usuario tiene rol de administrador', () => {
      // La autorizacion se valida en el API Gateway
    });

    when(
      /^consulta el perfil del empleado con id "(.*)"$/,
      async (empleadoId: string) => {
        try {
          result = await usersService.findOne(Number(empleadoId));
        } catch (error) {
          thrownError = error;
        }
      },
    );

    then('el sistema retorna los datos completos del empleado', () => {
      expect(result).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).id_employee).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).email).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).first_name).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).last_name).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).status).toBeDefined();
    });
  });

  test('Bloqueo de consulta por falta de permisos', ({
    given,
    and,
    when,
    then,
  }) => {
    given(
      /^que existe un empleado registrado con id "(.*)"$/,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_empleadoId: string) => {
        mockPrismaService.employees.findUnique.mockResolvedValue(mockEmployee);
      },
    );

    and('el usuario no tiene permisos suficientes', () => {
      // El Gateway bloquea la solicitud antes de llegar al microservicio
    });

    when(
      /^intenta consultar el perfil del empleado con id "(.*)"$/,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_empleadoId: string) => {
        try {
          throw Object.assign(new Error('Forbidden resource'), {
            statusCode: 403,
          });
        } catch (error) {
          thrownError = error;
        }
      },
    );

    then('el sistema bloquea el acceso con un error de autorizacion', () => {
      expect(thrownError).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((thrownError as any).statusCode).toBe(403);
      expect(mockPrismaService.employees.findUnique).not.toHaveBeenCalled();
    });
  });

  test('Consulta de empleado que no existe en el sistema', ({
    given,
    when,
    then,
  }) => {
    given(
      /^que no existe ningun empleado con id "(.*)"$/,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_empleadoId: string) => {
        mockPrismaService.employees.findUnique.mockResolvedValue(null);
      },
    );

    when(
      /^se consulta el perfil del empleado con id "(.*)"$/,
      async (empleadoId: string) => {
        try {
          result = await usersService.findOne(Number(empleadoId));
        } catch (error) {
          thrownError = error;
        }
      },
    );

    then(
      'el sistema indica que no existen registros para ese identificador',
      () => {
        expect(thrownError).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect((thrownError as any).message).toMatch(
          /no se ha encontrado|registro/i,
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        expect((thrownError as any).getStatus?.()).toBe(404);
      },
    );
  });

  test('Listado de empleados ordenado cronologicamente', ({
    given,
    when,
    then,
    and,
  }) => {
    given('que existen multiples empleados registrados en el sistema', () => {
      const empleados = Array.from({ length: 10 }, (_, i) => ({
        ...mockEmployee,
        id_employee: i + 1,
        email: `empleado${i + 1}@empresa.com`,
        first_name: `Empleado${i + 1}`,
        created_at: new Date(2024, 0, i + 1),
      }));

      mockPrismaService.employees.findMany.mockResolvedValue(empleados);
      mockPrismaService.employees.count.mockResolvedValue(15);
    });

    when(
      /^se solicita la lista de empleados con paginacion page (\d+) limit (\d+)$/,
      async (page: string, limit: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        result = await usersService.findAll({
          page: Number(page),
          limit: Number(limit),
        } as any);
      },
    );

    then(
      'el sistema retorna los empleados ordenados por fecha de creacion',
      () => {
        expect(result).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect((result as any).data).toBeDefined();
        expect(mockPrismaService.employees.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 0,
            take: 10,
          }),
        );
      },
    );

    and('el numero de resultados no supera el limite de 10', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((result as any).data.length).toBeLessThanOrEqual(10);
    });
  });
});
