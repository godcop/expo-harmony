cmake_minimum_required(VERSION 3.5)
project(expo_eas_client)

add_library(expo_eas_client SHARED EASClient.cpp)
target_compile_features(expo_eas_client PRIVATE cxx_std_17)
target_link_libraries(expo_eas_client PUBLIC libace_napi.z.so)
