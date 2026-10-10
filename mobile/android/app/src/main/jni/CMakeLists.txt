cmake_minimum_required(VERSION 3.22.1)

# Define the React Native app modules project
project(appmodules LANGUAGES C CXX)

# Include React Native New Architecture build system
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# --- Chiwiwi Sovereign Isolated Diffusion Worker ---
# Configure nested stable-diffusion build
set(SD_BUILD_EXAMPLES OFF CACHE BOOL "Disable SD examples" FORCE)
set(SD_BUILD_SHARED_LIBS OFF CACHE BOOL "Build SD as static library" FORCE)
set(SD_WEBP OFF CACHE BOOL "Disable WebP" FORCE)
set(SD_WEBM OFF CACHE BOOL "Disable WebM" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "Disable OpenMP" FORCE)

add_subdirectory(../cpp/sd ${CMAKE_CURRENT_BINARY_DIR}/sd_build)

# JNI bridge shared library
add_library(chiwiwi-diffusion SHARED
    ../cpp/chiwiwi_diffusion_jni.cpp
)

set_target_properties(chiwiwi-diffusion PROPERTIES
    C_VISIBILITY_PRESET hidden
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN ON
)

target_include_directories(chiwiwi-diffusion PRIVATE
    ../cpp/sd/include
    ../cpp/sd/thirdparty
)

target_link_options(chiwiwi-diffusion PRIVATE
    "-Wl,--exclude-libs,ALL"
    "-Wl,-z,max-page-size=16384"
)

target_link_libraries(chiwiwi-diffusion PRIVATE
    stable-diffusion
    android
    log
)
