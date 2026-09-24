cmake_minimum_required(VERSION 3.19)
project(expo_dom_webview LANGUAGES CXX)

# RNOH and Expo Modules Core are linked by the host's generated autolinking
# CMake project. The HAR carries sources, as does Expo Modules Core itself.
add_library(expo_harmony__expo_dom_webview SHARED ExpoDomWebViewPackage.cpp)
target_compile_features(expo_harmony__expo_dom_webview PUBLIC cxx_std_20)
target_include_directories(expo_harmony__expo_dom_webview PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(expo_harmony__expo_dom_webview PUBLIC rnoh expo_harmony__expo_modules_core)
