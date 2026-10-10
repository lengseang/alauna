#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <filesystem>
#include <sched.h>
#include <unistd.h>
#include <sys/resource.h>
#include <cerrno>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#include "stable-diffusion.h"
#include "core/ggml_extend_backend.h"

#define LOG_TAG "ChiwiwiDiffusion"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#define CHIWIWI_EXPORT extern "C" __attribute__((visibility("default"))) JNIEXPORT

static void set_big_core_affinity() {
    setpriority(PRIO_PROCESS, 0, -10);
    int num_cores = (int)sysconf(_SC_NPROCESSORS_CONF);
    if (num_cores >= 8) {
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        // Exclude 3 LITTLE efficiency cores (cores 0..2 Cortex-A510).
        // Pin to high-frequency Performance and Prime cores (cores 3..7 Cortex-A710/A715/Cortex-X3).
        for (int i = 3; i < num_cores; ++i) {
            CPU_SET(i, &cpuset);
        }
        if (sched_setaffinity(0, sizeof(cpu_set_t), &cpuset) == 0) {
            LOGI("Diffusion thread affinity locked to performance cores (3..%d)", num_cores - 1);
        } else {
            LOGW("Could not set performance core affinity: %s", strerror(errno));
        }
    }
}

static JavaVM* g_jvm = nullptr;
static std::string g_last_error;
static std::mutex g_error_mutex;

static void set_last_error(const char* text) {
    std::lock_guard<std::mutex> lock(g_error_mutex);
    if (text) {
        g_last_error = text;
    } else {
        g_last_error.clear();
    }
}

static std::string get_last_error() {
    std::lock_guard<std::mutex> lock(g_error_mutex);
    return g_last_error;
}

CHIWIWI_EXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    g_jvm = vm;
    LOGI("ChiwiwiDiffusion JNI loaded");
    return JNI_VERSION_1_6;
}

static void log_callback(enum sd_log_level_t level, const char* text, void* data) {
    switch (level) {
        case SD_LOG_DEBUG:
        case SD_LOG_VERBOSE:
            LOGI("[sd.cpp] %s", text);
            break;
        case SD_LOG_INFO:
            LOGI("[sd.cpp] %s", text);
            break;
        case SD_LOG_WARN:
            LOGW("[sd.cpp] %s", text);
            break;
        case SD_LOG_ERROR:
            LOGE("[sd.cpp] %s", text);
            set_last_error(text);
            break;
    }
}

struct ProgressCallbackContext {
    JNIEnv* env;
    jobject callbackObj;
    jmethodID methodId;
};

static void progress_callback(int step, int steps, float time, void* data) {
    if (!data) return;
    auto* ctx = reinterpret_cast<ProgressCallbackContext*>(data);
    if (ctx->env && ctx->callbackObj && ctx->methodId) {
        ctx->env->CallVoidMethod(ctx->callbackObj, ctx->methodId, (jint)step, (jint)steps, (jfloat)time);
    }
}

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_chiwiwi_sovereign_diffusion_NativeDiffusion_nativeInit(
    JNIEnv* env,
    jobject /* thiz */,
    jstring jModelPath,
    jint nThreads
) {
    if (!jModelPath) {
        LOGE("Model path is null");
        return 0;
    }

    const char* modelPath = env->GetStringUTFChars(jModelPath, nullptr);
    sd_set_log_callback(log_callback, nullptr);

    set_big_core_affinity();
    set_last_error(nullptr);
    sd_ctx_params_t params;
    sd_ctx_params_init(&params);
    params.model_path = modelPath;
    params.n_threads = nThreads > 0 ? nThreads : 5; // 5 threads targets 1 Prime + 4 Performance cores on Snapdragon 8 Gen 2
    params.wtype = SD_TYPE_COUNT; // Auto-detect quantization
    params.rng_type = CPU_RNG;
    params.enable_mmap = true;
    params.flash_attn = true; // Enable flash attention for memory efficiency
    params.diffusion_flash_attn = true; // Enable diffusion flash attention to accelerate UNet attention
    params.diffusion_conv_direct = true; // Direct 2D convolution without im2col tensor bloat
    params.vae_conv_direct = true; // Direct VAE convolution without im2col tensor bloat
    params.disable_segmented_compute = true; // Monolithic graph execution avoids re-slicing and re-planning UNet

    // Check companion files in the model's directory (for modular SDXL/Pony models)
    std::string clipLPath, clipGPath, t5xxlPath, vaePath;
    try {
        std::filesystem::path p(modelPath);
        std::filesystem::path dir = p.parent_path();

        for (const auto& name : {"clip_l.safetensors", "clip_l.gguf", "clip_l-q8_0.gguf", "clip_l-fp16.gguf"}) {
            auto cand = dir / name;
            if (std::filesystem::exists(cand)) {
                clipLPath = cand.string();
                params.clip_l_path = clipLPath.c_str();
                LOGI("Detected companion CLIP-L: %s", clipLPath.c_str());
                break;
            }
        }

        for (const auto& name : {"clip_g.safetensors", "clip_g.gguf", "clip_g-q8_0.gguf", "clip_g-fp16.gguf"}) {
            auto cand = dir / name;
            if (std::filesystem::exists(cand)) {
                clipGPath = cand.string();
                params.clip_g_path = clipGPath.c_str();
                LOGI("Detected companion CLIP-G: %s", clipGPath.c_str());
                break;
            }
        }

        for (const auto& name : {"t5xxl.safetensors", "t5xxl.gguf", "t5xxl_fp16.gguf", "t5xxl_q4_k.gguf"}) {
            auto cand = dir / name;
            if (std::filesystem::exists(cand)) {
                t5xxlPath = cand.string();
                params.t5xxl_path = t5xxlPath.c_str();
                LOGI("Detected companion T5XXL: %s", t5xxlPath.c_str());
                break;
            }
        }

        for (const auto& name : {"sdxl_vae.safetensors", "vae.safetensors", "sdxl_vae.gguf", "vae.gguf"}) {
            auto cand = dir / name;
            if (std::filesystem::exists(cand)) {
                vaePath = cand.string();
                params.vae_path = vaePath.c_str();
                LOGI("Detected companion VAE: %s", vaePath.c_str());
                break;
            }
        }
    } catch (const std::exception& e) {
        LOGW("Error while scanning companion model files: %s", e.what());
    }

    LOGI("Initializing sd_ctx for model: %s with %d threads", modelPath, params.n_threads);
    sd_ctx_t* ctx = new_sd_ctx(&params);
    if (!ctx) {
        LOGW("Failed to create sd_ctx with enable_mmap = true, retrying with enable_mmap = false...");
        params.enable_mmap = false;
        ctx = new_sd_ctx(&params);
    }
    env->ReleaseStringUTFChars(jModelPath, modelPath);

    if (!ctx) {
        std::string err = get_last_error();
        if (err.find("get sd version from file failed") != std::string::npos) {
            std::string enhanced = "Model missing text encoder: this model contains only diffusion UNet weights without embedded CLIP/VAE encoders. Standalone on-device generation requires an All-in-One checkpoint (e.g. Anything V5, DreamShaper 7 LCM, SD 1.5, AbsoluteReality) or companion CLIP-L/CLIP-G weights in the vault models directory. Original engine error: " + err;
            set_last_error(enhanced.c_str());
        }
        LOGE("Failed to create sd_ctx: %s", get_last_error().c_str());
        return 0;
    }

    LOGI("sd_ctx initialized successfully: %p", ctx);
    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT jboolean JNICALL
Java_com_chiwiwi_sovereign_diffusion_NativeDiffusion_nativeGenerate(
    JNIEnv* env,
    jobject /* thiz */,
    jlong ctxHandle,
    jstring jPrompt,
    jstring jNegativePrompt,
    jint width,
    jint height,
    jint steps,
    jfloat cfgScale,
    jlong seed,
    jstring jSampleMethod,
    jstring jOutputPath,
    jobject jProgressCallback
) {
    auto* ctx = reinterpret_cast<sd_ctx_t*>(ctxHandle);
    if (!ctx) {
        LOGE("nativeGenerate called with null context");
        return JNI_FALSE;
    }

    set_big_core_affinity();

    const char* prompt = env->GetStringUTFChars(jPrompt, nullptr);
    const char* negativePrompt = jNegativePrompt ? env->GetStringUTFChars(jNegativePrompt, nullptr) : "";
    const char* outputPath = env->GetStringUTFChars(jOutputPath, nullptr);
    const char* sampleMethodCStr = jSampleMethod ? env->GetStringUTFChars(jSampleMethod, nullptr) : nullptr;
    std::string methodStr = sampleMethodCStr ? sampleMethodCStr : "auto";
    if (sampleMethodCStr) {
        env->ReleaseStringUTFChars(jSampleMethod, sampleMethodCStr);
    }

    ProgressCallbackContext cbCtx{};
    if (jProgressCallback) {
        jclass cbClass = env->GetObjectClass(jProgressCallback);
        jmethodID methodId = env->GetMethodID(cbClass, "onStepProgress", "(IIF)V");
        if (methodId) {
            cbCtx.env = env;
            cbCtx.callbackObj = jProgressCallback;
            cbCtx.methodId = methodId;
            sd_set_progress_callback(progress_callback, &cbCtx);
        }
    }

    sd_img_gen_params_t gen_params;
    sd_img_gen_params_init(&gen_params);
    gen_params.prompt = prompt;
    gen_params.negative_prompt = negativePrompt;
    gen_params.width = width > 0 ? width : 512;
    gen_params.height = height > 0 ? height : 512;
    gen_params.sample_params.sample_steps = steps > 0 ? steps : 14;

    // Intelligent mobile sampler & scheduler selection:
    // DPM++ 2M Karras achieves convergence in 12-15 steps (2x faster than Euler_a at 30 steps with sharper quality).
    // LCM solver achieves convergence in 2-4 steps for distilled/LCM-LoRA models.
    if (methodStr == "lcm" || (methodStr == "auto" && gen_params.sample_params.sample_steps <= 6)) {
        gen_params.sample_params.sample_method = LCM_SAMPLE_METHOD;
        gen_params.sample_params.scheduler = LCM_SCHEDULER;
    } else if (methodStr == "euler_a") {
        gen_params.sample_params.sample_method = EULER_A_SAMPLE_METHOD;
        gen_params.sample_params.scheduler = DISCRETE_SCHEDULER;
    } else if (methodStr == "euler") {
        gen_params.sample_params.sample_method = EULER_SAMPLE_METHOD;
        gen_params.sample_params.scheduler = DISCRETE_SCHEDULER;
    } else {
        // High-performance default: DPM++ 2M Karras
        gen_params.sample_params.sample_method = DPMPP2M_SAMPLE_METHOD;
        gen_params.sample_params.scheduler = KARRAS_SCHEDULER;
    }

    gen_params.sample_params.guidance.txt_cfg = cfgScale > 0.0f ? cfgScale : 7.0f;
    gen_params.seed = seed >= 0 ? seed : -1;
    gen_params.batch_count = 1;

    LOGI("Starting generate_image: %dx%d, steps=%d, method=%d, scheduler=%d, cfg=%.2f, seed=%lld",
         gen_params.width, gen_params.height, gen_params.sample_params.sample_steps,
         (int)gen_params.sample_params.sample_method, (int)gen_params.sample_params.scheduler,
         gen_params.sample_params.guidance.txt_cfg, (long long)gen_params.seed);

    sd_image_t* raw_images = nullptr;
    int num_images = 0;
    bool success = generate_image(ctx, &gen_params, &raw_images, &num_images);

    // Clear progress callback
    sd_set_progress_callback(nullptr, nullptr);

    bool writeSuccess = false;
    if (success && num_images > 0 && raw_images && raw_images[0].data) {
        sd_image_t& img = raw_images[0];
        LOGI("Image generated successfully: %dx%d, channels=%d", img.width, img.height, img.channel);
        int stride = img.width * img.channel;
        int writeResult = stbi_write_png(outputPath, img.width, img.height, img.channel, img.data, stride);
        if (writeResult != 0) {
            LOGI("Saved image to: %s", outputPath);
            writeSuccess = true;
        } else {
            LOGE("stbi_write_png failed for path: %s", outputPath);
        }
    } else {
        LOGE("generate_image failed or produced 0 images");
    }

    // Clean up allocated image buffers
    if (raw_images) {
        for (int i = 0; i < num_images; ++i) {
            if (raw_images[i].data) {
                free(raw_images[i].data);
            }
        }
        free(raw_images);
    }

    env->ReleaseStringUTFChars(jPrompt, prompt);
    if (jNegativePrompt) {
        env->ReleaseStringUTFChars(jNegativePrompt, negativePrompt);
    }
    env->ReleaseStringUTFChars(jOutputPath, outputPath);

    return writeSuccess ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_chiwiwi_sovereign_diffusion_NativeDiffusion_nativeCancel(
    JNIEnv* /* env */,
    jobject /* thiz */,
    jlong ctxHandle
) {
    auto* ctx = reinterpret_cast<sd_ctx_t*>(ctxHandle);
    if (ctx) {
        LOGI("Canceling generation for ctx: %p", ctx);
        sd_cancel_generation(ctx, SD_CANCEL_ALL);
    }
}

JNIEXPORT void JNICALL
Java_com_chiwiwi_sovereign_diffusion_NativeDiffusion_nativeRelease(
    JNIEnv* /* env */,
    jobject /* thiz */,
    jlong ctxHandle
) {
    auto* ctx = reinterpret_cast<sd_ctx_t*>(ctxHandle);
    if (ctx) {
        LOGI("Releasing sd_ctx: %p", ctx);
        free_sd_ctx(ctx);
    }
    sd_backend_cpu_free_threadpool();
}

JNIEXPORT jstring JNICALL
Java_com_chiwiwi_sovereign_diffusion_NativeDiffusion_nativeGetLastError(
    JNIEnv* env,
    jobject /* thiz */
) {
    std::string err = get_last_error();
    return env->NewStringUTF(err.c_str());
}

} // extern "C"
