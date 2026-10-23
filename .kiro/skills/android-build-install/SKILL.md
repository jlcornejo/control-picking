---
name: android-build-install
description: "Arma el build de Android (APK) de la app móvil Fundo360 (Expo) e instálalo en un equipo Android físico. Dispara con frases como: build Android, generar APK, compilar la app móvil, instalar la app en el teléfono, apk en el equipo, probar en el celular Android. Cubre los obstáculos ya resueltos (JDK 21, memoria de Gradle) y la instalación por adb."
---

# Build Android + instalación en equipo (Fundo360 móvil)

Genera el APK de `apps/mobile` (Expo) e instálalo en un Android físico vía `adb`.
Ambiente de PRUEBAS; el APK `preview` apunta al Supabase **remoto**.

## Contexto fijo del proyecto

- App móvil: `apps/mobile` (Expo, package `com.fundo360.app`).
- Perfiles de build en `apps/mobile/eas.json`:
  - `preview` → **APK** (`buildType: apk`), canal `preview`, env apunta al remoto. **Es el que se instala en el equipo.**
  - `development` → APK con dev client.
  - `production` → `app-bundle` (AAB, para la store), no para instalar directo.
- El perfil `preview` ya trae `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` del remoto en `eas.json` → no hay que tocar `.env`.

## Obstáculos ya resueltos (NO re-descubrir)

1. **JDK: usar 21, no el de Android Studio.** El JDK que trae Android Studio puede ser Java 25, incompatible con la versión de Gradle del proyecto. Hay un Temurin 21 instalado.
   - Ruta: `/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home`
   - Seleccionar en la shell antes de compilar local:
     ```bash
     export JAVA_HOME=$(/usr/libexec/java_home -v 21)
     ```
2. **Memoria de Gradle (OutOfMemory).** En `apps/mobile/app.json`, el plugin `expo-build-properties` fija:
   ```
   org.gradle.jvmargs = -Xmx4096m -XX:MaxMetaspaceSize=2048m -XX:+HeapDumpOnOutOfMemoryError
   ```
   Si vuelve a dar OOM, subir `-Xmx`. No bajarlo.
3. **adb no está en el PATH por defecto.** Binario en `~/Library/Android/sdk/platform-tools/adb`. Ya se añadió al PATH en `~/.zshrc`:
   ```
   export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
   ```
   En terminales nuevas basta `adb`; si no resuelve, usar la ruta completa.
4. **macOS NO tiene `timeout`.** No envuelvas comandos con `timeout`.

## Cómo generar el APK

Dos vías. Preferir EAS si el usuario quiere el flujo "como lo verá el cliente".

### Opción A — EAS Build (nube, recomendada)

```bash
cd apps/mobile
eas build --platform android --profile preview
```

Al terminar, EAS da una URL para descargar el `.apk`. Descárgalo al repo
(histórico: se guardó como `apps/mobile/build-fundo360-preview.apk`, ~95 MB).

### Opción B — build local (si no se quiere la nube)

Requiere JDK 21 seleccionado (ver obstáculo #1) y el toolchain de Android.

```bash
cd apps/mobile
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
eas build --platform android --profile preview --local
```

> El build local es largo y consume mucha RAM. Si da OOM, revisar `org.gradle.jvmargs` (obstáculo #2).

## Cómo instalar en el equipo (adb por USB)

1. En el teléfono: Ajustes → Acerca del teléfono → tocar 7× "Número de compilación"
   para habilitar **Opciones de desarrollador**; luego activar **Depuración USB**.
2. Conectar por USB y aceptar el diálogo "¿Permitir depuración USB?".
3. Verificar e instalar:
   ```bash
   adb devices -l                 # debe listar el equipo (no "unauthorized")
   adb install -r <ruta-al-apk>   # -r reinstala si ya existe
   ```
   Histórico OK: se instaló en un Motorola **moto g04s** con `Success`.

### Si "app no instalada"
Suele ser conflicto de firma con una versión previa. Desinstalar la anterior y reintentar:
```bash
adb uninstall com.fundo360.app
adb install <ruta-al-apk>
```

## Ver logs si la app crashea

```bash
adb logcat --pid=$(adb shell pidof -s com.fundo360.app)
```

## Verificación

- `adb install` imprime `Success`.
- La app abre desde el cajón de aplicaciones.
- El login usa usuarios del **remoto** (ver `TEST_USERS.md`, sección REMOTO), no los locales.
