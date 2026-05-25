Feature: Registrar empleado (HU2.1)
  Como administrador de talento humano
  Quiero registrar un nuevo empleado en la plataforma
  Para centralizar su informacion laboral dentro del sistema

  Scenario: Registro exitoso de empleado con datos completos
    Given que el administrador tiene los datos completos del empleado
    When confirma el registro del empleado
    Then el sistema crea el empleado exitosamente
    And el empleado queda con estado "invited"
    And se genera un identificador UUID unico no editable

  Scenario: Rechazo por correo electronico duplicado
    Given que ya existe un empleado registrado con el email "test@example.com"
    When se intenta registrar otro empleado con el mismo email "test@example.com"
    Then el sistema rechaza la operacion con error de duplicidad

  Scenario: Rechazo por campos obligatorios vacios
    Given que el administrador no proporciona el campo obligatorio "email"
    When intenta confirmar el registro del empleado
    Then el sistema retorna un error de validacion indicando el campo requerido
    And no se crea ningun registro en la base de datos

  Scenario: Rechazo por formato invalido de correo electronico
    Given que el administrador ingresa el email con formato invalido "correo-sin-arroba"
    When intenta confirmar el registro del empleado
    Then el sistema retorna un error de validacion indicando el campo requerido
    And no se crea ningun registro en la base de datos
