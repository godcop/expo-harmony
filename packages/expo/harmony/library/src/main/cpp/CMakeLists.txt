cmake_minimum_required(VERSION 3.19)
project(expo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT TARGET rnoh)
  if(NOT DEFINED OH_MODULES_DIR)
    set(OH_MODULES_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules")
  endif()
  add_subdirectory("${OH_MODULES_DIR}/@rnoh/react-native-openharmony/src/main/cpp"
    "${CMAKE_CURRENT_BINARY_DIR}/rnoh")
endif()

add_library(expo_harmony__expo SHARED
  "ExpoPackage.cpp"
  "runtime/RuntimeErrors.cpp"
  "runtime/RuntimeErrorBindings.cpp")

target_include_directories(expo_harmony__expo PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(expo_harmony__expo PUBLIC rnoh)
