Feature: Autenticacion de usuarios (HU6.1)
  Como usuario del sistema
  Quiero iniciar sesion mediante credenciales seguras
  Para acceder a las funcionalidades permitidas segun mi rol

  # CA1: Credenciales validas -> acceso permitido
  Scenario: Inicio de sesion exitoso con credenciales validas
    Given que el usuario tiene credenciales validas registradas en el sistema
    When ingresa su email "juan.perez@empresa.com" y contrasena correcta
    Then el sistema retorna la sesion con el token de acceso
    And la sesion contiene los datos del usuario autenticado

  # CA2: Credenciales incorrectas -> acceso rechazado
  Scenario: Rechazo por contrasena incorrecta
    Given que el usuario existe en el sistema con email "juan.perez@empresa.com"
    When intenta iniciar sesion con una contrasena incorrecta
    Then el sistema rechaza el acceso
    And retorna un mensaje de error de autenticacion

  # CA1 via OTP: Login por OTP exitoso
  Scenario: Inicio de sesion exitoso por OTP
    Given que el usuario existe en el sistema con email "juan.perez@empresa.com"
    When solicita un codigo OTP para ese email
    Then el sistema envia el codigo OTP correctamente
    And retorna confirmacion del envio

  # CA1 via OTP: Verificacion de OTP valido
  Scenario: Verificacion exitosa de OTP valido
    Given que el usuario recibio un codigo OTP valido
    When verifica el OTP con email "juan.perez@empresa.com" y el token correcto
    Then el sistema retorna el token JWT de acceso
    And el resultado incluye el cargo y el rol del usuario

  # CA2 via OTP: OTP invalido o expirado
  Scenario: Rechazo por OTP invalido o expirado
    Given que el usuario intenta verificar con un OTP incorrecto
    When verifica el OTP con email "juan.perez@empresa.com" y token invalido
    Then el sistema rechaza la verificacion
    And retorna un error de autorizacion

  # CA4: Cierre de sesion -> token verificado invalido
  Scenario: Token invalido despues del cierre de sesion
    Given que no se proporciona ningun token de sesion
    When el sistema intenta verificar ese token
    Then el sistema rechaza la verificacion con error de token no encontrado
