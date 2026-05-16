// test/bdd/steps/gestion-roles-permisos.steps.ts
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

// AdminService usa supabase.auth.admin.* (cliente admin, igual que users.service)
jest.mock('../../src/lib/supabase/supabase', () => ({
  supabase: { auth: { admin: mockSupabaseAdmin.auth.admin } },
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

import { AdminService } from '../../src/admin/admin.service';
import { PrismaService } from '../../src/lib/prisma';
import { NATS_SERVICE } from '../../src/config/services';

const feature = loadFeature(
  path.join(__dirname, '../features/gestion-roles-permisos.feature'),
);

// Administrador de ejemplo
const mockAdmin = {
  id: 10,
  email: 'admin.nuevo@empresa.com',
  name: 'Admin',
  last_name: 'Nuevo',
  age: 40,
  supabase_user_id: 'supabase-admin-uuid',
  created_at: new Date('2024-02-01T10:00:00Z'),
};

defineFeature(feature, (test) => {
  let adminService: AdminService;
  let result: unknown;
  let thrownError: Error | undefined;

  beforeEach(async () => {
    resetMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NATS_SERVICE, useValue: mockNatsClient },
      ],
    }).compile();

    adminService = module.get<AdminService>(AdminService);
    result = undefined;
    thrownError = undefined;
  });

  // =========================================================================
  // CA1: Crear administrador -> isAdmin:true en Supabase + registro en BD
  // Metodo real: adminService.addAdmin(createAdminDto)
  // =========================================================================
  test('Asignacion exitosa de rol administrador', ({
    given,
    when,
    then,
    and,
  }) => {
    given(
      'que el administrador tiene los datos del nuevo administrador',
      () => {
        mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
          data: { user: { id: 'supabase-admin-uuid-nuevo' } },
          error: null,
        });

        mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
          data: {},
          error: null,
        });

        mockPrismaService.administrators.create.mockResolvedValue(mockAdmin);
      },
    );

    when(
      /^registra al nuevo administrador con email "(.*)"$/,
      async (email: string) => {
        result = await adminService.addAdmin({
          email,
          name: 'Admin',
          last_name: 'Nuevo',
          age: 40,
        });
      },
    );

    then(
      'el sistema crea el usuario en Supabase con el rol isAdmin true',
      () => {
        // Verifica que updateUserById se llamo con isAdmin: true
        expect(
          mockSupabaseAdmin.auth.admin.updateUserById,
        ).toHaveBeenCalledWith(
          'supabase-admin-uuid-nuevo',
          expect.objectContaining({
            app_metadata: { isAdmin: true, rolId: null },
          }),
        );
      },
    );

    and('guarda el registro en la base de datos', () => {
      expect(mockPrismaService.administrators.create).toHaveBeenCalledTimes(1);
    });

    and('retorna el id del administrador creado', () => {
      expect(result).toBe(mockAdmin.id);
    });
  });

  // =========================================================================
  // CA2: Bloquear empleado -> status:'inactive' + ban en Supabase
  // Metodo real: adminService.block(id)
  // =========================================================================
  test('Bloqueo de usuario sin permisos suficientes', ({
    given,
    when,
    then,
    and,
  }) => {
    given('que existe un empleado activo con id 1', () => {
      mockPrismaService.employees.findUnique.mockResolvedValue({
        ...mockEmployee,
        id_employee: 1,
        status: 'active',
      });

      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });

      mockPrismaService.employees.update.mockResolvedValue({
        ...mockEmployee,
        id_employee: 1,
        status: 'inactive',
      });
    });

    when('el administrador bloquea al empleado con id 1', async () => {
      result = await adminService.block(1);
    });

    then('el sistema actualiza el estado del empleado a "inactive"', () => {
      expect(mockPrismaService.employees.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_employee: 1 },
          data: { status: 'inactive' },
        }),
      );
      expect((result as typeof mockEmployee).status).toBe('inactive');
    });

    and('banea al usuario en Supabase impidiendo el acceso', () => {
      // Verifica que el ban_duration sea el largo (equivalente a permanente)
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        mockEmployee.supabase_user_id,
        expect.objectContaining({ ban_duration: '876000h' }),
      );
    });
  });

  // =========================================================================
  // CA3: Reactivar empleado -> status:'active' + levantar ban en Supabase
  // Metodo real: adminService.unblock(id)
  // =========================================================================
  test('Reactivacion de usuario bloqueado', ({ given, when, then, and }) => {
    given('que existe un empleado bloqueado con id 1', () => {
      mockPrismaService.employees.findUnique.mockResolvedValue({
        ...mockEmployee,
        id_employee: 1,
        status: 'inactive',
      });

      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });

      mockPrismaService.employees.update.mockResolvedValue({
        ...mockEmployee,
        id_employee: 1,
        status: 'active',
      });
    });

    when('el administrador reactiva al empleado con id 1', async () => {
      result = await adminService.unblock(1);
    });

    then('el sistema actualiza el estado del empleado a "active"', () => {
      expect(mockPrismaService.employees.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_employee: 1 },
          data: { status: 'active' },
        }),
      );
      expect((result as typeof mockEmployee).status).toBe('active');
    });

    and('levanta el baneo en Supabase permitiendo el acceso nuevamente', () => {
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        mockEmployee.supabase_user_id,
        expect.objectContaining({ ban_duration: 'none' }),
      );
    });
  });

  // =========================================================================
  // CA2: Suspender empleado -> status:'suspended', sin tocar Supabase
  // Metodo real: adminService.suspendEmployee(id)
  // =========================================================================
  test('Suspension temporal de empleado', ({ given, when, then, and }) => {
    given('que existe un empleado activo con id 2', () => {
      mockPrismaService.employees.findUnique.mockResolvedValue({
        ...mockEmployee,
        id_employee: 2,
        status: 'active',
      });

      mockPrismaService.employees.update.mockResolvedValue({
        ...mockEmployee,
        id_employee: 2,
        status: 'suspended',
      });
    });

    when('el administrador suspende al empleado con id 2', async () => {
      result = await adminService.suspendEmployee(2);
    });

    then('el sistema actualiza el estado del empleado a "suspended"', () => {
      expect(mockPrismaService.employees.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_employee: 2 },
          data: { status: 'suspended' },
        }),
      );
      expect((result as typeof mockEmployee).status).toBe('suspended');
    });

    and('no modifica el acceso del usuario en Supabase', () => {
      // suspendEmployee NO llama a Supabase, a diferencia de block/unblock
      expect(
        mockSupabaseAdmin.auth.admin.updateUserById,
      ).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // CA2: Empleado ya suspendido -> BadRequestException
  // =========================================================================
  test('Rechazo de suspension sobre empleado ya suspendido', ({
    given,
    when,
    then,
  }) => {
    given(
      /^que existe un empleado con id (\d+) que ya esta en estado "suspended"$/,
      (id: string) => {
        mockPrismaService.employees.findUnique.mockResolvedValue({
          ...mockEmployee,
          id_employee: Number(id),
          status: 'suspended',
        });
      },
    );

    when(
      /^el administrador intenta suspender nuevamente al empleado con id (\d+)$/,
      async (id: string) => {
        try {
          result = await adminService.suspendEmployee(Number(id));
        } catch (error) {
          thrownError = error as Error;
        }
      },
    );

    then(
      'el sistema rechaza la operacion con error de solicitud incorrecta',
      () => {
        expect(thrownError).toBeDefined();
        expect(thrownError.message).toMatch(/ya se encuentra suspendido/i);
        // No se debe actualizar nada
        expect(mockPrismaService.employees.update).not.toHaveBeenCalled();
      },
    );
  });

  // =========================================================================
  // CA4: Empleado inexistente -> NotFoundException (registro para auditoria)
  // Metodo real: adminService.block(id) con Prisma retornando null
  // =========================================================================
  test('Bloqueo de usuario que no existe en el sistema', ({
    given,
    when,
    then,
  }) => {
    given('que no existe ningun empleado con id 999', () => {
      mockPrismaService.employees.findUnique.mockResolvedValue(null);
    });

    when(
      'el administrador intenta bloquear al empleado con id 999',
      async () => {
        try {
          result = await adminService.block(999);
        } catch (error) {
          thrownError = error as Error;
        }
      },
    );

    then(
      'el sistema retorna un error indicando que no se encontro el registro',
      () => {
        expect(thrownError).toBeDefined();
        expect(thrownError.message).toMatch(/no se ha encontrado/i);
        // Supabase nunca debe ser llamado si el empleado no existe
        expect(
          mockSupabaseAdmin.auth.admin.updateUserById,
        ).not.toHaveBeenCalled();
        expect(mockPrismaService.employees.update).not.toHaveBeenCalled();
      },
    );
  });
});
