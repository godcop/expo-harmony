cmake_minimum_required(VERSION 3.19)
project(expo_dev_launcher LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT TARGET rnoh)
  if(DEFINED OH_MODULES_DIR)
    set(EXPO_DEV_LAUNCHER_OH_MODULES_DIR "${OH_MODULES_DIR}")
  else()
    set(EXPO_DEV_LAUNCHER_OH_MODULES_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules")
  endif()

  # RNOH ships RNOH/assert.h in a public include directory. On Darwin hosts,
  # libc++'s <cassert> can otherwise resolve that header instead of the SDK's
  # C assert declarations while RNOH itself is being built.
  set(ENABLE_COMPILE_OPTIMIZATIONS OFF CACHE BOOL "" FORCE)
  if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Darwin" AND DEFINED OHOS_SDK_NATIVE)
    set(CMAKE_CXX_FLAGS
      "${CMAKE_CXX_FLAGS} -include ${OHOS_SDK_NATIVE}/sysroot/usr/include/assert.h")
  endif()

  add_subdirectory("${EXPO_DEV_LAUNCHER_OH_MODULES_DIR}/@rnoh/react-native-openharmony/src/main/cpp"
    "${CMAKE_CURRENT_BINARY_DIR}/rnoh")
endif()

add_library(expo_harmony__expo_dev_launcher SHARED
  "EXDevLauncherTurboModule.cpp"
  "ExpoDevLauncherPackage.cpp")

target_include_directories(expo_harmony__expo_dev_launcher PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(expo_harmony__expo_dev_launcher PUBLIC rnoh)
