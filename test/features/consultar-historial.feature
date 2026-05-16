# language: es
Feature: Consultar historial laboral (HU2.2)
  Como usuario autorizado
  Quiero consultar el historial laboral completo de un empleado
  Para analizar su trayectoria institucional

  # CA1: Consulta exitosa con permisos
  Scenario: Consulta exitosa del perfil de empleado con permisos adecuados
    Given que existe un empleado registrado con id "emp-uuid-001"
    And el usuario tiene rol de administrador
    When consulta el perfil del empleado con id "emp-uuid-001"
    Then el sistema retorna los datos completos del empleado

  # CA2: Acceso bloqueado sin permisos
  Scenario: Bloqueo de consulta por falta de permisos
    Given que existe un empleado registrado con id "emp-uuid-001"
    And el usuario no tiene permisos suficientes
    When intenta consultar el perfil del empleado con id "emp-uuid-001"
    Then el sistema bloquea el acceso con un error de autorización

  # CA4: Empleado sin registros o inexistente
  Scenario: Consulta de empleado que no existe en el sistema
    Given que no existe ningún empleado con id "emp-uuid-999"
    When se consulta el perfil del empleado con id "emp-uuid-999"
    Then el sistema indica que no existen registros para ese identificador

  # Listado paginado y orden cronológico (CA3)
  Scenario: Listado de empleados ordenado cronológicamente
    Given que existen múltiples empleados registrados en el sistema
    When se solicita la lista de empleados con paginación page 1 limit 10
    Then el sistema retorna los empleados ordenados por fecha de creación
    And el número de resultados no supera el límite de 10
