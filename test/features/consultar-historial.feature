Feature: Consultar historial laboral (HU2.2)
  Como usuario autorizado
  Quiero consultar el historial laboral completo de un empleado
  Para analizar su trayectoria institucional

  Scenario: Consulta exitosa del perfil de empleado con permisos adecuados
    Given que existe un empleado registrado con id "1"
    And el usuario tiene rol de administrador
    When consulta el perfil del empleado con id "1"
    Then el sistema retorna los datos completos del empleado

  Scenario: Bloqueo de consulta por falta de permisos
    Given que existe un empleado registrado con id "1"
    And el usuario no tiene permisos suficientes
    When intenta consultar el perfil del empleado con id "1"
    Then el sistema bloquea el acceso con un error de autorizacion

  Scenario: Consulta de empleado que no existe en el sistema
    Given que no existe ningun empleado con id "999"
    When se consulta el perfil del empleado con id "999"
    Then el sistema indica que no existen registros para ese identificador

  Scenario: Listado de empleados ordenado cronologicamente
    Given que existen multiples empleados registrados en el sistema
    When se solicita la lista de empleados con paginacion page 1 limit 10
    Then el sistema retorna los empleados ordenados por fecha de creacion
    And el numero de resultados no supera el limite de 10

