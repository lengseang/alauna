package com.chiwiwi.sovereign.diffusion

import android.util.Log

interface ProgressCallback {
    fun onStepProgress(step: Int, totalSteps: Int, timeSec: Float)
}

object NativeDiffusion {
    private const val TAG = "NativeDiffusion"
    private var isLoaded = false
    private var loadError: Throwable? = null

    @Synchronized
    fun ensureLoaded(): Boolean {
        if (isLoaded) return true
        if (loadError != null) return false
        return try {
            System.loadLibrary("chiwiwi-diffusion")
            isLoaded = true
            Log.i(TAG, "libchiwiwi-diffusion.so loaded successfully in worker process")
            true
        } catch (t: Throwable) {
            loadError = t
            Log.e(TAG, "Failed to load libchiwiwi-diffusion.so in worker process", t)
            false
        }
    }

    fun isLibraryLoaded(): Boolean = isLoaded

    fun getLoadError(): Throwable? = loadError

    external fun nativeInit(modelPath: String, nThreads: Int): Long

    external fun nativeGenerate(
        ctxHandle: Long,
        prompt: String,
        negativePrompt: String?,
        width: Int,
        height: Int,
        steps: Int,
        cfgScale: Float,
        seed: Long,
        sampleMethod: String?,
        outputPath: String,
        progressCallback: ProgressCallback?
    ): Boolean

    external fun nativeCancel(ctxHandle: Long)

    external fun nativeRelease(ctxHandle: Long)

    external fun nativeGetLastError(): String
}
