// Tipado explicito para los mocks de jest y modelo de prisma.

type MockedMethods<T extends string> = Record<T, jest.Mock>;

type EmployeeMock = MockedMethods<
  'create' | 'findUnique' | 'findMany' | 'findFirst' | 'update' | 'count'
>;

type AdministratorMock = MockedMethods<'create' | 'findUnique' | 'findMany'>;

type SupabaseAdminMock = MockedMethods<
  'inviteUserByEmail' | 'updateUserById' | 'getUserById'
>;

export const mockPrismaService: {
  employees: EmployeeMock;
  administrators: AdministratorMock;
} = {
  employees: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  administrators: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

export const mockNatsClient: { send: jest.Mock } = {
  send: jest.fn(),
};

// Las pruebas van a usar las funciones reales de supabase!
export const mockSupabaseAdmin: { auth: { admin: SupabaseAdminMock } } = {
  auth: {
    admin: {
      inviteUserByEmail: jest.fn(),
      updateUserById: jest.fn(),
      getUserById: jest.fn(),
    },
  },
};

// Empleado de ejemplo
export const mockEmployee = {
  id_employee: 1,
  email: 'juan.perez@empresa.com',
  first_name: 'Juan',
  last_name: 'Pérez',
  age: 30,
  code: 1001,
  status: 'invited' as const,
  id_position: 5,
  id_manager: null,
  id_administrator: 1,
  supabase_user_id: 'supabase-uuid-001',
  photo_url: null,
  created_at: new Date('2024-01-15T10:00:00Z'),
};

// Cargo de ejemplo devuelto
export const mockCargo = {
  id: 5,
  name: 'Desarrollador Senior',
};

export function resetMocks(): void {
  Object.values(mockPrismaService.employees).forEach((fn: jest.Mock) =>
    fn.mockReset(),
  );
  Object.values(mockPrismaService.administrators).forEach((fn: jest.Mock) =>
    fn.mockReset(),
  );
  Object.values(mockSupabaseAdmin.auth.admin).forEach((fn: jest.Mock) =>
    fn.mockReset(),
  );
  mockNatsClient.send.mockReset();
}
