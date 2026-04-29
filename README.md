# Users Microservice

Microservicio responsable de la gestión de **empleados** y **administradores** del sistema. Integra autenticación y gestión de identidad a través de Supabase Auth, y almacena datos del dominio en PostgreSQL via Prisma.

## Tabla de Contenidos

- [Users Microservice](#users-microservice)
  - [Tabla de Contenidos](#tabla-de-contenidos)
  - [Descripción General](#descripción-general)
  - [Arquitectura y Módulos](#arquitectura-y-módulos)
  - [Modelos de Base de Datos](#modelos-de-base-de-datos)
    - [`administrators`](#administrators)
    - [`employees`](#employees)
    - [`users` (Supabase Auth Schema)](#users-supabase-auth-schema)
  - [Mensajes NATS (API Interna)](#mensajes-nats-api-interna)
    - [Empleados](#empleados)
    - [Administradores](#administradores)
  - [Flujo de Autenticación](#flujo-de-autenticación)
    - [Invitación de Empleado](#invitación-de-empleado)
    - [Creación de Administrador](#creación-de-administrador)
    - [Bloqueo de Usuario](#bloqueo-de-usuario)
  - [Variables de Entorno](#variables-de-entorno)
  - [Instalación y Ejecución](#instalación-y-ejecución)
    - [Modo desarrollo (local)](#modo-desarrollo-local)
    - [Modo Docker (recomendado)](#modo-docker-recomendado)
      - [Esto no es necesario si se quiere ejecutar todo el proyecto desde el launcher: **Leer README.md del launcher**](#esto-no-es-necesario-si-se-quiere-ejecutar-todo-el-proyecto-desde-el-launcher-leer-readmemd-del-launcher)
    - [Migraciones de base de datos](#migraciones-de-base-de-datos)
  - [Estructura del Proyecto](#estructura-del-proyecto)

---

## Descripción General

Este microservicio centraliza la gestión del ciclo de vida de los usuarios del sistema. Maneja dos tipos de usuarios: **administradores** (con acceso al panel de gestión) y **empleados** (personal de la organización). La autenticación es delegada completamente a Supabase Auth, mientras que los datos del dominio (perfil, rol, estado laboral) se almacenan en la base de datos propia del microservicio.

**Características destacadas:**
- Invitación de empleados vía correo electrónico (Supabase invite flow)
- Creación de administradores con credenciales y registro de autenticación
- Gestión de estados laborales: `active`, `inactive`, `suspended`, `retired`, `invited`
- Bloqueo/desbloqueo permanente de usuarios en Supabase Auth
- Soporte de jerarquía de managers para empleados (estructura de reporte)
- Metadatos de rol almacenados directamente en el token JWT de Supabase (`roleId`, `isAdmin`)

---

## Arquitectura y Módulos

```
AppModule
└── UsersModule   → Gestión de empleados y administradores
```

El módulo de usuarios unifica la operación sobre dos entidades (`employees`, `administrators`) con sus respectivas interacciones con Supabase Auth y la base de datos local.

`Controller (MessagePattern) → Service → Prisma + Supabase Admin SDK`

---

## Modelos de Base de Datos

### `administrators`
Cuenta de administrador del sistema con acceso completo al panel de gestión.

| Campo         | Tipo            | Descripción                                   |
|---------------|-----------------|-----------------------------------------------|
| `id`          | `String` (UUID) | Identificador único                           |
| `email`       | `String`        | Correo electrónico (único)                    |
| `name`        | `String`        | Nombre completo                               |
| `age`         | `Int`           | Edad                                          |
| `user_id`     | `String`        | Referencia al registro en Supabase Auth       |
| `created_at`  | `DateTime`      | Fecha de creación                             |

### `employees`
Empleado de la organización con datos laborales y de perfil.

| Campo           | Tipo                  | Descripción                                        |
|-----------------|-----------------------|----------------------------------------------------|
| `id`            | `String` (UUID)       | Identificador único                                |
| `email`         | `String`              | Correo electrónico (único)                         |
| `name`          | `String`              | Nombre completo                                    |
| `position_id`   | `String`              | Cargo asignado (referencia a `administrative-data-ms`) |
| `manager_id`    | `String?`             | ID del empleado que es su manager directo          |
| `admin_id`      | `String`              | Administrador responsable del empleado             |
| `user_id`       | `String?`             | Referencia al registro en Supabase Auth (asignado al aceptar invitación) |
| `status`        | `employee_status`     | Estado laboral actual                              |
| `created_at`    | `DateTime`            | Fecha de creación                                  |

**Estados de empleado:** `active`, `inactive`, `suspended`, `retired`, `invited`

### `users` (Supabase Auth Schema)
Tabla gestionada por Supabase Auth. El microservicio la referencia via relación pero no la modifica directamente — toda interacción se hace a través del SDK de Supabase Admin.

---

## Mensajes NATS (API Interna)

Todos los mensajes se envían con el patrón `{ cmd: '<accion>' }`.

### Empleados

| `cmd`               | Payload                              | Descripción                                                   |
|---------------------|--------------------------------------|---------------------------------------------------------------|
| `inviteUser`        | `InviteUserDto`                      | Enviar invitación a un empleado vía Supabase. Crea el registro con estado `invited`. |
| `findAllUsers`      | `PaginationDto`                      | Listar todos los empleados con paginación                     |
| `findUserById`      | `{ id: string }`                     | Obtener empleado por ID                                       |
| `blockUser`         | `{ id: string }`                     | Bloquear empleado (ban permanente en Supabase + estado `suspended`) |
| `unblockUser`       | `{ id: string }`                     | Desbloquear empleado (remoción del ban en Supabase + estado `active`) |

### Administradores

| `cmd`               | Payload                              | Descripción                                                   |
|---------------------|--------------------------------------|---------------------------------------------------------------|
| `createAdmin`       | `CreateAdminDto`                     | Crear administrador con cuenta en Supabase Auth               |
| `findAllAdmins`     | `PaginationDto`                      | Listar todos los administradores con paginación               |
| `findAdminById`     | `{ id: string }`                     | Obtener administrador por ID                                  |

---

## Flujo de Autenticación

### Invitación de Empleado
```
Gateway → inviteUser →  users-ms
                          ├── Crea registro en DB (status: invited)
                          └── Llama supabase.auth.admin.inviteUserByEmail()
                                └── Supabase envía correo de invitación al empleado
                                      └── Empleado acepta → user_id se vincula al registro
```

### Creación de Administrador
```
Gateway → createAdmin → users-ms
                          ├── Llama supabase.auth.admin.createUser()
                          │     └── user_metadata: { isAdmin: true }
                          └── Crea registro en DB vinculado al user_id de Supabase
```

### Bloqueo de Usuario
```
Gateway → blockUser → users-ms
                        ├── Llama supabase.auth.admin.updateUserById(id, { ban_duration: 'none' })
                        └── Actualiza status del empleado a 'suspended' en DB
```

Los tokens JWT emitidos por Supabase incluyen `user_metadata.roleId` (para empleados) o `user_metadata.isAdmin: true` (para administradores), permitiendo al Gateway validar permisos sin consultar este microservicio en cada request.

---

## Variables de Entorno

| Variable              | Descripción                                              |
|-----------------------|----------------------------------------------------------|
| `PORT`                | Puerto interno del microservicio (default: `3002`)       |
| `NATS_SERVERS`        | URL del servidor NATS (ej: `nats://nats-server:4222`)    |
| `DATABASE_URL`        | Cadena de conexión PostgreSQL (Supabase)                 |
| `SUPABASE_URL`        | URL del proyecto Supabase                               |
| `DATABASE_KEY`        | Clave pública (`anon key`) de Supabase                  |
| `DATABASE_ADMIN_KEY`  | Clave de servicio (`service_role key`) — solo servidor  |

> **Importante:** `DATABASE_ADMIN_KEY` es la clave `service_role` de Supabase. Nunca debe exponerse al cliente. Se usa exclusivamente para operaciones administrativas (invitar usuarios, crear cuentas, ban).

---

## Instalación y Ejecución

### Modo desarrollo (local)

```bash
npm install
npm run start:dev
```

### Modo Docker (recomendado)
#### Esto no es necesario si se quiere ejecutar todo el proyecto desde el launcher: **Leer README.md del launcher**


```bash
# Desde la raíz del launcher
docker compose up users-ms
```

### Migraciones de base de datos

```bash
npx prisma db pull
npx prisma generate
```

---

## Estructura del Proyecto

```
src/
├── main.ts                             # Bootstrap como microservicio NATS
├── app.module.ts                       # Módulo raíz
├── users/
│   ├── users.controller.ts             # MessagePatterns de usuarios
│   ├── users.service.ts                # Lógica de negocio + Supabase Admin
│   ├── users.module.ts
│   ├── dto/
│   │   ├── invite-user.dto.ts          # Datos para invitar empleado
│   │   ├── create-admin.dto.ts         # Datos para crear administrador
│   │   ├── update-user.dto.ts
│   │   └── index.ts
│   └── enums/
│       └── status.enum.ts              # Estados del empleado
├── lib/
│   ├── prisma.ts                       # PrismaClient con adaptador pg
│   └── supabase/
│       └── supabase.ts                 # Cliente Supabase con service_role key
├── config/
│   ├── envs.ts                         # Validación de variables de entorno (Joi)
│   ├── index.ts
│   └── services.ts                     # Constante NATS_SERVICE
├── transports/
│   └── nats.module.ts                  # ClientsModule NATS
└── common/
    ├── dto/pagination.dto.ts
    ├── exceptions/rpc-custom-exception.filter.ts
    └── index.ts
```
