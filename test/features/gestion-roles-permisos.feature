Feature: Gestion de roles y permisos (HU6.2)
  Como administrador
  Quiero asignar roles y permisos diferenciados a los usuarios
  Para controlar el acceso a informacion sensible y funcionalidades del sistema

  # CA1: Crear admin con rol isAdmin=true -> permisos guardados
  Scenario: Asignacion exitosa de rol administrador
    Given que el administrador tiene los datos del nuevo administrador
    When registra al nuevo administrador con email "admin.nuevo@empresa.com"
    Then el sistema crea el usuario en Supabase con el rol isAdmin true
    And guarda el registro en la base de datos
    And retorna el id del administrador creado

  # CA2: Bloqueo de empleado -> no puede acceder al sistema
  Scenario: Bloqueo de usuario sin permisos suficientes
    Given que existe un empleado activo con id 1
    When el administrador bloquea al empleado con id 1
    Then el sistema actualiza el estado del empleado a "inactive"
    And banea al usuario en Supabase impidiendo el acceso

  # CA3: Reactivacion de empleado -> nuevo nivel de acceso
  Scenario: Reactivacion de usuario bloqueado
    Given que existe un empleado bloqueado con id 1
    When el administrador reactiva al empleado con id 1
    Then el sistema actualiza el estado del empleado a "active"
    And levanta el baneo en Supabase permitiendo el acceso nuevamente

  # CA2: Suspension temporal -> estado suspendido
  Scenario: Suspension temporal de empleado
    Given que existe un empleado activo con id 2
    When el administrador suspende al empleado con id 2
    Then el sistema actualiza el estado del empleado a "suspended"
    And no modifica el acceso del usuario en Supabase

  # CA2: Empleado ya suspendido -> rechazo
  Scenario: Rechazo de suspension sobre empleado ya suspendido
    Given que existe un empleado con id 3 que ya esta en estado "suspended"
    When el administrador intenta suspender nuevamente al empleado con id 3
    Then el sistema rechaza la operacion con error de solicitud incorrecta

  # CA4: Intento sobre usuario inexistente -> auditoria implicita via NotFoundException
  Scenario: Bloqueo de usuario que no existe en el sistema
    Given que no existe ningun empleado con id 999
    When el administrador intenta bloquear al empleado con id 999
    Then el sistema retorna un error indicando que no se encontro el registro
